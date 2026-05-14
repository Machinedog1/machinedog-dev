import { and, sql } from "drizzle-orm";
import { db, projectsTable, type Project } from "@workspace/db";
import { randomBytes } from "node:crypto";

export interface GithubImportInput {
  clientId: number;
  owner: string;
  repo: string;
  defaultBranch?: string;
  title?: string;
  description?: string;
  summary?: string;
  templateSlug?: string | null;
  projectType?: Project["projectType"];
  framework?: Project["framework"];
  healthcareMode?: boolean;
  baaStatus?: Project["baaStatus"];
}

export interface GithubImportResult {
  ok: true;
  project: Project;
}

export interface GithubImportConflict {
  ok: false;
  reason: "duplicate";
  existingProjectId: number;
  message: string;
}

export type GithubImportOutcome = GithubImportResult | GithubImportConflict;

/**
 * Shared GitHub-import service. Reused by the admin
 * /admin/projects/import-github route AND the user-facing wizard's
 * `POST /projects` (origin=github) flow so dedupe semantics, normalization,
 * and unique-index race handling stay consistent across surfaces.
 *
 * Returns a discriminated union instead of throwing for the duplicate case
 * so callers can map it to the appropriate HTTP status (admin returns 409,
 * the wizard surfaces it as a 409 toast).
 */
export async function importGithubAsProject(
  input: GithubImportInput,
): Promise<GithubImportOutcome> {
  const owner = input.owner.trim();
  const repo = input.repo.trim();
  const defaultBranch = (input.defaultBranch ?? "main").trim() || "main";

  // GitHub owner/repo names are case-insensitive — match the same
  // normalization used on the list side so "Owner/Repo" and "owner/repo"
  // dedupe against each other.
  const [existing] = await db
    .select()
    .from(projectsTable)
    .where(
      and(
        sql`lower(${projectsTable.githubOwner}) = ${owner.toLowerCase()}`,
        sql`lower(${projectsTable.githubRepo}) = ${repo.toLowerCase()}`,
      ),
    );
  if (existing) {
    return {
      ok: false,
      reason: "duplicate",
      existingProjectId: existing.id,
      message: `Project for ${existing.githubOwner}/${existing.githubRepo} already exists (id ${existing.id}).`,
    };
  }

  const title =
    input.title?.trim() ||
    repo
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  try {
    const [row] = await db
      .insert(projectsTable)
      .values({
        clientId: input.clientId,
        title,
        description:
          input.description?.trim() ||
          `Imported from github.com/${owner}/${repo}`,
        summary: input.summary ?? "",
        status: "draft",
        projectType: input.projectType ?? "web_app",
        framework: input.framework ?? "react",
        templateSlug: input.templateSlug ?? null,
        healthcareMode: input.healthcareMode ?? false,
        phiAllowed: false,
        baaStatus: input.baaStatus ?? "not_required",
        githubOwner: owner,
        githubRepo: repo,
        githubDefaultBranch: defaultBranch,
        heartbeatToken: randomBytes(16).toString("hex"),
      })
      .returning();
    return { ok: true, project: row };
  } catch (err: unknown) {
    // The unique index on (lower(github_owner), lower(github_repo)) catches
    // a concurrent import that raced past the read-then-insert dedupe
    // above. Map it to the same conflict outcome.
    const code = (err as { code?: string } | null)?.code;
    if (code === "23505") {
      // Resolve the racing project's real id so callers can surface a
      // useful "open existing" affordance instead of a bare conflict.
      const [racing] = await db
        .select({ id: projectsTable.id })
        .from(projectsTable)
        .where(
          and(
            sql`lower(${projectsTable.githubOwner}) = ${owner.toLowerCase()}`,
            sql`lower(${projectsTable.githubRepo}) = ${repo.toLowerCase()}`,
          ),
        );
      return {
        ok: false,
        reason: "duplicate",
        existingProjectId: racing?.id ?? -1,
        message: racing
          ? `Project for ${owner}/${repo} already exists (id ${racing.id}).`
          : `Project for ${owner}/${repo} already exists.`,
      };
    }
    throw err;
  }
}
