/**
 * GitHub helpers for the change-request workflow.
 *
 * Uses the Replit Connectors SDK proxy — the Replit GitHub OAuth integration
 * must be authorized at the account level, otherwise every call throws
 * `GitHubNotConfiguredError` and the change-request route catches it and
 * leaves the request in its previous state.
 *
 * Flow per change request:
 *   1. resolveBaseSha(project)          → current HEAD of default branch
 *   2. createSnapshotTag(project, sha, name)
 *   3. pushBranchWithFiles(project, branch, baseSha, files, msg)
 *   4. openPullRequest(project, branch, title, body)
 *   5. (later) mergePullRequest(project, prNumber)
 *   6. (later) openRevertPr(project, branchName, snapshotTag)
 *
 * All file contents are uploaded as blobs and assembled into a single tree
 * commit via the Git Data API, so partial pushes can't leave the branch in a
 * half-baked state.
 */

import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./logger";

export class GitHubNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubNotConfiguredError";
  }
}

export class GitHubConflictError extends Error {
  constructor(
    message: string,
    public readonly branch: string,
    public readonly expectedSha: string,
    public readonly actualSha: string,
  ) {
    super(message);
    this.name = "GitHubConflictError";
  }
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export interface GitHubProjectConfig {
  githubOwner: string | null;
  githubRepo: string | null;
  githubDefaultBranch: string;
}

export interface PushFile {
  path: string;
  contents: string;
}

const connectors = new ReplitConnectors();

function requireRepo(project: GitHubProjectConfig): {
  owner: string;
  repo: string;
  defaultBranch: string;
} {
  const owner = project.githubOwner?.trim();
  const repo = project.githubRepo?.trim();
  if (!owner || !repo) {
    throw new GitHubNotConfiguredError(
      "GitHub repo not set on this project (owner/repo missing).",
    );
  }
  return {
    owner,
    repo,
    defaultBranch: project.githubDefaultBranch || "main",
  };
}

async function gh<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await connectors.proxy("github", path, {
      method: opts.method ?? "GET",
      body: opts.body,
      headers: { accept: "application/vnd.github+json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.toLowerCase().includes("not connected") ||
      message.toLowerCase().includes("no connection")
    ) {
      throw new GitHubNotConfiguredError(
        "GitHub connector not authorized for this Repl. Visit Replit > Integrations > GitHub.",
      );
    }
    throw err;
  }

  if (response.status === 404) {
    const text = await response.text().catch(() => "");
    throw new GitHubApiError(
      `GitHub 404 for ${opts.method ?? "GET"} ${path}: ${text || "not found"}`,
      404,
      text,
    );
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new GitHubApiError(
      `GitHub ${response.status} for ${opts.method ?? "GET"} ${path}: ${text}`,
      response.status,
      text,
    );
  }
  if (response.status === 204) {
    return undefined as unknown as T;
  }
  return (await response.json()) as T;
}

// Lightweight helpers used by the admin "Import from GitHub" panel — they
// do not require a project context (they speak to the connected user's
// account directly).

export interface ConnectedGithubUser {
  login: string;
  id: number;
  name: string | null;
}

export interface ConnectedGithubRepo {
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  description: string | null;
  htmlUrl: string;
  updatedAt: string | null;
}

export async function getConnectedGithubUser(): Promise<ConnectedGithubUser> {
  const me = await gh<{ login: string; id: number; name: string | null }>(
    "/user",
  );
  return { login: me.login, id: me.id, name: me.name ?? null };
}

export async function listConnectedUserRepos(): Promise<ConnectedGithubRepo[]> {
  // Pull every page (up to a sane cap) so admins see all repos they manage,
  // sorted by most recently updated for the most useful default ordering.
  const out: ConnectedGithubRepo[] = [];
  for (let page = 1; page <= 10; page++) {
    const arr = await gh<
      Array<{
        owner: { login: string };
        name: string;
        full_name: string;
        default_branch: string;
        private: boolean;
        description: string | null;
        html_url: string;
        updated_at: string | null;
      }>
    >(
      `/user/repos?per_page=100&sort=updated&page=${page}&affiliation=owner,collaborator,organization_member`,
    );
    if (!Array.isArray(arr) || arr.length === 0) break;
    for (const r of arr) {
      out.push({
        owner: r.owner.login,
        repo: r.name,
        fullName: r.full_name,
        defaultBranch: r.default_branch || "main",
        private: !!r.private,
        description: r.description,
        htmlUrl: r.html_url,
        updatedAt: r.updated_at,
      });
    }
    if (arr.length < 100) break;
  }
  return out;
}

export interface FetchedFile {
  path: string;
  contents: string;
  sha: string;
  size: number;
}

/**
 * Fetch every text file at the tip of `branch` (or the default branch).
 * Returns paths + utf8 contents. Skips entries larger than `maxBytes`
 * (default 1 MiB) and any blob whose decoded contents are not valid utf8.
 */
export async function fetchBranchTreeFiles(
  project: GitHubProjectConfig,
  branch?: string,
  opts: { maxBytes?: number } = {},
): Promise<{ branch: string; commitSha: string; files: FetchedFile[] }> {
  const { owner, repo, defaultBranch } = requireRepo(project);
  const target = branch ?? defaultBranch;
  const maxBytes = opts.maxBytes ?? 1_048_576;
  const headSha = await resolveBranchSha(project, target);
  const commit = await gh<{ tree: { sha: string } }>(
    `/repos/${owner}/${repo}/git/commits/${headSha}`,
  );
  const tree = await gh<{
    tree: Array<{ path: string; type: string; sha: string; size?: number }>;
    truncated?: boolean;
  }>(`/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
  const blobs = tree.tree.filter(
    (n) => n.type === "blob" && (n.size ?? 0) <= maxBytes,
  );
  const files: FetchedFile[] = [];
  for (const node of blobs) {
    try {
      const blob = await gh<{ content: string; encoding: string; size: number }>(
        `/repos/${owner}/${repo}/git/blobs/${node.sha}`,
      );
      const buf =
        blob.encoding === "base64"
          ? Buffer.from(blob.content, "base64")
          : Buffer.from(blob.content, "utf8");
      // Skip binaries (heuristic: NUL byte in first 8 KiB)
      const probe = buf.subarray(0, 8192);
      if (probe.includes(0)) continue;
      files.push({
        path: node.path,
        contents: buf.toString("utf8"),
        sha: node.sha,
        size: buf.byteLength,
      });
    } catch (err) {
      logger.warn(
        { err, path: node.path },
        "fetchBranchTreeFiles: skipping unreadable blob",
      );
    }
  }
  return { branch: target, commitSha: headSha, files };
}

/**
 * List every blob path at the tip of `branch` (lightweight: no blob bodies).
 * Used to compute deletion diffs for the workspace commit endpoint.
 */
export async function listBranchTreePaths(
  project: GitHubProjectConfig,
  branch?: string,
): Promise<{ branch: string; commitSha: string; paths: string[] }> {
  const { owner, repo, defaultBranch } = requireRepo(project);
  const target = branch ?? defaultBranch;
  const headSha = await resolveBranchSha(project, target);
  const commit = await gh<{ tree: { sha: string } }>(
    `/repos/${owner}/${repo}/git/commits/${headSha}`,
  );
  const tree = await gh<{
    tree: Array<{ path: string; type: string }>;
  }>(`/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
  return {
    branch: target,
    commitSha: headSha,
    paths: tree.tree.filter((n) => n.type === "blob").map((n) => n.path),
  };
}

export async function resolveBranchSha(
  project: GitHubProjectConfig,
  branch?: string,
): Promise<string> {
  const { owner, repo, defaultBranch } = requireRepo(project);
  const target = branch ?? defaultBranch;
  const ref = await gh<{ object: { sha: string } }>(
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(target)}`,
  );
  return ref.object.sha;
}

export async function createSnapshotTag(
  project: GitHubProjectConfig,
  sha: string,
  tagName: string,
): Promise<{ tag: string; sha: string }> {
  const { owner, repo } = requireRepo(project);

  // Create an annotated tag object first (gives us a real tagger + message
  // for audit), then point a ref at it. Lightweight tags (ref-only) work but
  // the spec calls for annotated tags so rollback history is self-describing.
  const tagObject = await gh<{ sha: string }>(
    `/repos/${owner}/${repo}/git/tags`,
    {
      method: "POST",
      body: {
        tag: tagName,
        message: `Machinedog snapshot before applying change.`,
        object: sha,
        type: "commit",
        tagger: {
          name: "Machinedog",
          email: "ops@machinedog.com",
          date: new Date().toISOString(),
        },
      },
    },
  );

  await gh(`/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    body: { ref: `refs/tags/${tagName}`, sha: tagObject.sha },
  });
  return { tag: tagName, sha };
}

export async function pushBranchWithFiles(
  project: GitHubProjectConfig,
  branch: string,
  baseSha: string,
  files: PushFile[],
  commitMessage: string,
  opts: { force?: boolean; deletions?: string[] } = {},
): Promise<{ branch: string; commitSha: string }> {
  const { owner, repo } = requireRepo(project);
  const deletions = opts.deletions ?? [];
  if (files.length === 0 && deletions.length === 0) {
    throw new Error("pushBranchWithFiles called with no files or deletions");
  }
  const force = opts.force ?? true;
  // Conflict pre-check: when callers opt out of force, refuse to push if the
  // remote branch has advanced past `baseSha`. GitHub's PATCH /git/refs
  // would also reject non-fast-forward updates, but we want a structured
  // error with the actual sha so the UI can surface a meaningful conflict.
  if (!force) {
    try {
      const ref = await gh<{ object: { sha: string } }>(
        `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
      );
      if (ref.object.sha !== baseSha) {
        throw new GitHubConflictError(
          `Branch ${branch} has advanced since you last fetched it. Pull and retry.`,
          branch,
          baseSha,
          ref.object.sha,
        );
      }
    } catch (err) {
      if (err instanceof GitHubConflictError) throw err;
      // 404 = branch doesn't exist yet; that's fine, we'll create it below.
      if (!(err instanceof GitHubApiError && err.status === 404)) {
        throw err;
      }
    }
  }

  // Upload every file as a blob.
  const blobs = await Promise.all(
    files.map(async (file) => {
      const blob = await gh<{ sha: string }>(
        `/repos/${owner}/${repo}/git/blobs`,
        {
          method: "POST",
          body: { content: file.contents, encoding: "utf-8" },
        },
      );
      return { path: file.path, sha: blob.sha };
    }),
  );

  // Build a tree on top of the base commit's tree.
  const baseCommit = await gh<{ tree: { sha: string } }>(
    `/repos/${owner}/${repo}/git/commits/${baseSha}`,
  );

  // Tree update: blobs become add/update entries; deletions are represented
  // by entries with sha=null (GitHub interprets as removal from base_tree).
  const treeEntries: Array<Record<string, unknown>> = [
    ...blobs.map((b) => ({
      path: b.path,
      mode: "100644",
      type: "blob",
      sha: b.sha,
    })),
    ...deletions.map((path) => ({
      path,
      mode: "100644",
      type: "blob",
      sha: null,
    })),
  ];
  const tree = await gh<{ sha: string }>(
    `/repos/${owner}/${repo}/git/trees`,
    {
      method: "POST",
      body: {
        base_tree: baseCommit.tree.sha,
        tree: treeEntries,
      },
    },
  );

  const commit = await gh<{ sha: string }>(
    `/repos/${owner}/${repo}/git/commits`,
    {
      method: "POST",
      body: {
        message: commitMessage,
        tree: tree.sha,
        parents: [baseSha],
      },
    },
  );

  // Create the branch ref. If it already exists, force-update it so retries
  // are idempotent.
  const refPath = `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`;
  try {
    await gh(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${branch}`, sha: commit.sha },
    });
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 422) {
      // Ref exists — update it. `force` controls whether non-fast-forward
      // updates are allowed; non-force pushes will be rejected with 422 if
      // the remote moved between our pre-check and this PATCH.
      try {
        await gh(refPath, {
          method: "PATCH",
          body: { sha: commit.sha, force },
        });
      } catch (err2) {
        if (!force && err2 instanceof GitHubApiError && err2.status === 422) {
          throw new GitHubConflictError(
            `Branch ${branch} was updated concurrently. Pull and retry.`,
            branch,
            baseSha,
            "unknown",
          );
        }
        throw err2;
      }
    } else {
      throw err;
    }
  }

  return { branch, commitSha: commit.sha };
}

export async function openPullRequest(
  project: GitHubProjectConfig,
  branch: string,
  title: string,
  body: string,
): Promise<{ prNumber: number; prUrl: string }> {
  const { owner, repo, defaultBranch } = requireRepo(project);
  const pr = await gh<{ number: number; html_url: string }>(
    `/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      body: {
        title,
        body,
        head: branch,
        base: defaultBranch,
        maintainer_can_modify: true,
      },
    },
  );
  return { prNumber: pr.number, prUrl: pr.html_url };
}

export async function mergePullRequest(
  project: GitHubProjectConfig,
  prNumber: number,
  method: "merge" | "squash" | "rebase" = "squash",
): Promise<{ merged: boolean; sha: string | null }> {
  const { owner, repo } = requireRepo(project);
  try {
    const result = await gh<{ merged: boolean; sha: string }>(
      `/repos/${owner}/${repo}/pulls/${prNumber}/merge`,
      {
        method: "PUT",
        body: { merge_method: method },
      },
    );
    return { merged: result.merged, sha: result.sha ?? null };
  } catch (err) {
    if (err instanceof GitHubApiError && (err.status === 405 || err.status === 409)) {
      // PR not mergeable (conflicts, unstable, already merged). Surface a
      // clean error to the caller without spinning the change request into a
      // hard fail.
      throw new GitHubApiError(
        `PR #${prNumber} is not mergeable yet (${err.status}).`,
        err.status,
        err.responseBody,
      );
    }
    throw err;
  }
}

export async function openRevertPr(
  project: GitHubProjectConfig,
  branchName: string,
  snapshotTag: string,
  prTitle: string,
  prBody: string,
): Promise<{ prNumber: number; prUrl: string; branch: string }> {
  const { owner, repo, defaultBranch } = requireRepo(project);

  // Resolve the snapshot tag down to its underlying commit sha.
  const tagRef = await gh<{ object: { sha: string; type: string } }>(
    `/repos/${owner}/${repo}/git/ref/tags/${encodeURIComponent(snapshotTag)}`,
  );
  let snapshotCommitSha = tagRef.object.sha;
  if (tagRef.object.type === "tag") {
    const tag = await gh<{ object: { sha: string } }>(
      `/repos/${owner}/${repo}/git/tags/${snapshotCommitSha}`,
    );
    snapshotCommitSha = tag.object.sha;
  }

  // Pull the snapshot's tree so we can replay it on top of current default
  // branch HEAD. This produces a NEW commit that's strictly ahead of main
  // — meaning GitHub will let us open a PR (no "no commits between" 422).
  const snapshotCommit = await gh<{ tree: { sha: string } }>(
    `/repos/${owner}/${repo}/git/commits/${snapshotCommitSha}`,
  );

  const baseSha = await resolveBranchSha(project);
  if (baseSha === snapshotCommitSha) {
    // Default branch already at snapshot — nothing to revert.
    throw new GitHubApiError(
      "Default branch is already at the snapshot — nothing to revert.",
      409,
      undefined,
    );
  }

  const revertCommit = await gh<{ sha: string }>(
    `/repos/${owner}/${repo}/git/commits`,
    {
      method: "POST",
      body: {
        message: `[Machinedog rollback] Restore tree from snapshot ${snapshotTag}`,
        tree: snapshotCommit.tree.sha,
        parents: [baseSha],
      },
    },
  );

  // Push the revert branch (idempotent — force-update if it already exists).
  try {
    await gh(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${branchName}`, sha: revertCommit.sha },
    });
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 422) {
      await gh(
        `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branchName)}`,
        { method: "PATCH", body: { sha: revertCommit.sha, force: true } },
      );
    } else {
      throw err;
    }
  }

  const pr = await gh<{ number: number; html_url: string }>(
    `/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      body: {
        title: prTitle,
        body: prBody,
        head: branchName,
        base: defaultBranch,
        maintainer_can_modify: true,
      },
    },
  );
  return { prNumber: pr.number, prUrl: pr.html_url, branch: branchName };
}

/**
 * Build the per-CR preview URL.
 *  - If `previewUrlTemplate` contains "{branch}", substitute the branch.
 *  - Otherwise fall back to the project's dev URL (`liveUrl`). We never
 *    return the raw template — without {branch} it's not a real per-branch
 *    URL and would mislead the operator into thinking they're previewing
 *    the new code when they're actually looking at main.
 */
export function computePreviewUrl(
  template: string | null,
  branch: string,
  fallbackDevUrl: string | null,
): string | null {
  if (template && template.includes("{branch}")) {
    return template.replace(/\{branch\}/g, branch);
  }
  return fallbackDevUrl ?? null;
}

export function buildBranchName(changeRequestId: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    || "change";
  return `machinedog/cr-${changeRequestId}-${slug}`;
}

export function buildSnapshotTag(changeRequestId: number): string {
  // Millisecond-precision timestamp + 4-char random nonce so rapid retries
  // (which can happen when an operator clicks a button twice or the agent
  // pipeline retries) never collide on the GitHub side.
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const nonce = Math.random().toString(36).slice(2, 6);
  return `machinedog/snapshot-cr-${changeRequestId}-${ts}-${nonce}`;
}

export function buildRevertBranchName(changeRequestId: number): string {
  return `machinedog/revert-cr-${changeRequestId}`;
}

export { logger as githubLogger };
