import { and, sql } from "drizzle-orm";
import { db, projectsTable, type Project } from "@workspace/db";
import { randomBytes } from "node:crypto";

export interface GithubImportInput {
  organizationId: number;
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

export async function importGithubAsProject(
  input: GithubImportInput,
): Promise<GithubImportOutcome> {
  const owner = input.owner.trim();
  const repo = input.repo.trim();
  const defaultBranch = (input.defaultBranch ?? "main").trim() || "main";

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
        organizationId: input.organizationId,
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
    const code = (err as { code?: string } | null)?.code;
    if (code === "23505") {
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
