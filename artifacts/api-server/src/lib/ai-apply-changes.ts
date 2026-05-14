/**
 * Phase 4 — apply proposed AI changes to a project's workspace.
 *
 * Mirrors what /projects/:id/files (inline + content) do for manual edits:
 *   - upsert each create/update into project_files (with object-storage backed
 *     bytes)
 *   - rename moves the row (and the underlying object — copied via re-upload)
 *   - delete removes the row (object-storage entries are left to GC)
 *   - best-effort commit the resulting set to the project's workspace branch
 *     via the existing pushBranchWithFiles helper
 *
 * Returns enough info for the route to update the proposed_changes rows and
 * surface a per-file status to the UI.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  projectFilesTable,
  type Project,
  type AiProposedChange,
} from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";
import {
  pushBranchWithFiles,
  resolveBranchSha,
  GitHubApiError,
  type PushFile,
} from "./github";
import { logger } from "./logger";

function activeBranchFor(project: Pick<Project, "id">): string {
  return `machinedog/workspace-${project.id}`;
}

async function resolveWorkspaceBaseSha(
  cfg: {
    githubOwner: string;
    githubRepo: string;
    githubDefaultBranch: string;
  },
  branch: string,
): Promise<{ baseSha: string; branchExists: boolean }> {
  try {
    const sha = await resolveBranchSha(cfg, branch);
    return { baseSha: sha, branchExists: true };
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 404) {
      return {
        baseSha: await resolveBranchSha(cfg),
        branchExists: false,
      };
    }
    throw err;
  }
}

export interface ApplyOutcome {
  changeId: number;
  ok: boolean;
  error?: string;
}

export interface ApplyChangesResult {
  outcomes: ApplyOutcome[];
  commit: { branch: string; commitSha: string } | null;
  commitWarning: string | null;
}

/**
 * Persist the given proposed changes into project_files and (best-effort)
 * push them to the workspace branch on GitHub. Each change row is processed
 * independently so a single bad path doesn't sink the whole batch.
 */
export async function applyProposedChanges(
  project: Project,
  uploadedByClientId: number,
  changes: AiProposedChange[],
): Promise<ApplyChangesResult> {
  const storage = new ObjectStorageService();
  const outcomes: ApplyOutcome[] = [];
  const pushFiles: PushFile[] = [];
  const deletions: string[] = [];

  for (const c of changes) {
    try {
      if (c.op === "create" || c.op === "update") {
        const contents = c.contents ?? "";
        const objectPath = await storage.uploadInlineObject({
          contents,
          contentType: "text/plain",
        });
        const sizeBytes = Buffer.byteLength(contents, "utf8");
        const [existing] = await db
          .select()
          .from(projectFilesTable)
          .where(
            and(
              eq(projectFilesTable.projectId, project.id),
              eq(projectFilesTable.name, c.path),
            ),
          )
          .limit(1);
        if (existing) {
          await db
            .update(projectFilesTable)
            .set({ objectPath, sizeBytes })
            .where(eq(projectFilesTable.id, existing.id));
        } else {
          await db.insert(projectFilesTable).values({
            projectId: project.id,
            uploadedByClientId,
            name: c.path,
            contentType: "text/plain",
            sizeBytes,
            objectPath,
          });
        }
        pushFiles.push({ path: c.path, contents });
        outcomes.push({ changeId: c.id, ok: true });
      } else if (c.op === "delete") {
        const rows = await db
          .select()
          .from(projectFilesTable)
          .where(
            and(
              eq(projectFilesTable.projectId, project.id),
              eq(projectFilesTable.name, c.path),
            ),
          );
        if (rows.length) {
          await db
            .delete(projectFilesTable)
            .where(
              inArray(
                projectFilesTable.id,
                rows.map((r) => r.id),
              ),
            );
        }
        deletions.push(c.path);
        outcomes.push({ changeId: c.id, ok: true });
      } else if (c.op === "rename") {
        if (!c.newPath) {
          outcomes.push({
            changeId: c.id,
            ok: false,
            error: "rename change missing newPath",
          });
          continue;
        }
        const [row] = await db
          .select()
          .from(projectFilesTable)
          .where(
            and(
              eq(projectFilesTable.projectId, project.id),
              eq(projectFilesTable.name, c.path),
            ),
          )
          .limit(1);
        if (!row) {
          outcomes.push({
            changeId: c.id,
            ok: false,
            error: `source path not found: ${c.path}`,
          });
          continue;
        }
        // When the AI provides new contents alongside a rename, treat it as
        // rename+update: re-upload the new bytes to object storage and bump
        // sizeBytes so workspace state on disk matches the GitHub commit.
        // Without this, GitHub gets the new bytes but project_files keeps
        // the old objectPath/sizeBytes and the workspace diverges.
        const newName = c.newPath;
        if (typeof c.contents === "string") {
          const newObjectPath = await storage.uploadInlineObject({
            contents: c.contents,
            contentType: row.contentType,
          });
          const sizeBytes = Buffer.byteLength(c.contents, "utf8");
          await db
            .update(projectFilesTable)
            .set({
              name: newName,
              objectPath: newObjectPath,
              sizeBytes,
            })
            .where(eq(projectFilesTable.id, row.id));
          pushFiles.push({ path: newName, contents: c.contents });
        } else {
          // Pure rename: keep the existing objectPath/sizeBytes; for GitHub
          // re-push the previous contents under the new path.
          await db
            .update(projectFilesTable)
            .set({ name: newName })
            .where(eq(projectFilesTable.id, row.id));
          const contents = c.previousContents ?? "";
          pushFiles.push({ path: newName, contents });
        }
        deletions.push(c.path);
        outcomes.push({ changeId: c.id, ok: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, changeId: c.id, op: c.op, path: c.path },
        "ai-apply-changes: failed to apply change",
      );
      outcomes.push({ changeId: c.id, ok: false, error: message });
    }
  }

  // Best-effort GitHub commit.
  let commit: { branch: string; commitSha: string } | null = null;
  let commitWarning: string | null = null;
  if (
    project.githubOwner &&
    project.githubRepo &&
    (pushFiles.length || deletions.length)
  ) {
    try {
      const cfg = {
        githubOwner: project.githubOwner,
        githubRepo: project.githubRepo,
        githubDefaultBranch: project.githubDefaultBranch,
      };
      const branch = activeBranchFor(project);
      const { baseSha, branchExists } = await resolveWorkspaceBaseSha(
        cfg,
        branch,
      );
      const pushed = await pushBranchWithFiles(
        cfg,
        branch,
        baseSha,
        pushFiles,
        `[Machinedog AI] Apply ${pushFiles.length + deletions.length} file change${pushFiles.length + deletions.length === 1 ? "" : "s"}`,
        { force: branchExists ? false : true, deletions },
      );
      commit = { branch: pushed.branch, commitSha: pushed.commitSha };
    } catch (err) {
      commitWarning =
        err instanceof Error ? err.message : "GitHub commit failed";
      logger.warn(
        { err, projectId: project.id },
        "ai-apply-changes: GitHub commit skipped",
      );
    }
  } else if (!project.githubOwner || !project.githubRepo) {
    commitWarning = "GitHub repo not configured on this project.";
  }

  return { outcomes, commit, commitWarning };
}
