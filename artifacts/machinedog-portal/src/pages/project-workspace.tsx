import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import {
  useGetProject,
  useListProjectFiles,
  useDeleteProjectFile,
  getListProjectFilesQueryKey,
  getGetProjectQueryKey,
} from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FilePlus,
  FolderPlus,
  Folder,
  FolderOpen,
  GitCommit,
  ArrowDownToLine,
  ArrowUpFromLine,
  KeyRound,
  Rocket,
  Save,
  Search,
  Sparkles,
  History,
  Loader2,
  Trash2,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

// ---- Path helpers ---------------------------------------------------------

function detectLanguage(name: string): string {
  const ext = name.toLowerCase().split(".").pop() || "";
  switch (ext) {
    case "ts":
    case "mts":
    case "cts":
      return "typescript";
    case "tsx":
      return "typescript";
    case "js":
    case "mjs":
    case "cjs":
      return "javascript";
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "md":
    case "mdx":
      return "markdown";
    case "css":
      return "css";
    case "scss":
    case "sass":
      return "scss";
    case "html":
    case "htm":
      return "html";
    case "yaml":
    case "yml":
      return "yaml";
    case "py":
      return "python";
    case "go":
      return "go";
    case "rs":
      return "rust";
    case "sh":
    case "bash":
      return "shell";
    case "sql":
      return "sql";
    case "xml":
    case "svg":
      return "xml";
    case "toml":
      return "ini";
    default:
      return "plaintext";
  }
}

interface FileRow {
  id: number;
  name: string;
  contentType: string;
  sizeBytes: number;
  objectPath: string;
}

interface TreeNode {
  type: "file" | "folder";
  name: string;
  path: string;
  file?: FileRow;
  children: TreeNode[];
}

function buildTree(files: FileRow[]): TreeNode {
  const root: TreeNode = { type: "folder", name: "", path: "", children: [] };
  for (const f of files) {
    const segs = f.name.split("/").filter(Boolean);
    if (!segs.length) continue;
    let cur = root;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const isLeaf = i === segs.length - 1;
      const path = segs.slice(0, i + 1).join("/");
      if (isLeaf && seg !== ".gitkeep") {
        cur.children.push({ type: "file", name: seg, path, file: f, children: [] });
      } else if (isLeaf && seg === ".gitkeep") {
        // folder placeholder — already created cur
      } else {
        let child = cur.children.find(
          (c) => c.type === "folder" && c.name === seg,
        );
        if (!child) {
          child = { type: "folder", name: seg, path, children: [] };
          cur.children.push(child);
        }
        cur = child;
      }
    }
  }
  sortTree(root);
  return root;
}

function sortTree(node: TreeNode) {
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const c of node.children) if (c.type === "folder") sortTree(c);
}

// ---- API helpers (use customFetch for the new endpoints not in the spec) --

async function apiReadContent(projectId: number, fileId: number): Promise<string> {
  const r = await customFetch<{ content: string }>(
    `/api/projects/${projectId}/files/${fileId}/content`,
  );
  return r.content ?? "";
}

type WriteContentResult = {
  commit?: { commitSha: string; branch: string } | null;
  commitWarning?: string | null;
};
async function apiWriteContent(
  projectId: number,
  fileId: number,
  content: string,
  opts: { skipCommit?: boolean } = {},
): Promise<WriteContentResult> {
  const qs = opts.skipCommit ? "?commit=false" : "";
  return await customFetch<WriteContentResult>(
    `/api/projects/${projectId}/files/${fileId}/content${qs}`,
    {
      method: "PUT",
      body: JSON.stringify({ content }),
      headers: { "content-type": "application/json" },
    },
  );
}

async function apiFolderOp(
  projectId: number,
  body: { op: "delete"; path: string } | { op: "rename"; path: string; newPath: string },
): Promise<{ ok: true; deleted?: number; renamed?: number }> {
  return await customFetch(`/api/projects/${projectId}/files/folder`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function apiCreateInline(
  projectId: number,
  name: string,
  content: string,
): Promise<FileRow> {
  return await customFetch<FileRow>(`/api/projects/${projectId}/files/inline`, {
    method: "POST",
    body: JSON.stringify({ name, content, contentType: "text/plain" }),
    headers: { "content-type": "application/json" },
  });
}

async function apiRename(
  projectId: number,
  fileId: number,
  name: string,
): Promise<FileRow> {
  return await customFetch<FileRow>(
    `/api/projects/${projectId}/files/${fileId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ name }),
      headers: { "content-type": "application/json" },
    },
  );
}

async function apiCommit(
  projectId: number,
  message: string,
  fileIds?: number[],
): Promise<{ branch: string; commitSha: string; fileCount: number; deletionCount?: number }> {
  return await customFetch(`/api/projects/${projectId}/files/commit`, {
    method: "POST",
    body: JSON.stringify({ message, fileIds: fileIds ?? [] }),
    headers: { "content-type": "application/json" },
  });
}

type PullResult = {
  ok: boolean;
  branch: string;
  sha: string;
  files: { fetched: number; created: number; updated: number; unchanged: number };
};
async function apiPull(projectId: number): Promise<PullResult> {
  return await customFetch<PullResult>(
    `/api/projects/${projectId}/files/pull`,
    { method: "POST" },
  );
}

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// ---- Page -----------------------------------------------------------------

export default function ProjectWorkspacePage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const projectQuery = useGetProject(projectId, {
    query: {
      queryKey: getGetProjectQueryKey(projectId),
      enabled: Number.isFinite(projectId),
      refetchInterval: 10000,
      refetchIntervalInBackground: false,
    },
  });
  const project = projectQuery.data;

  const filesQuery = useListProjectFiles(projectId, {
    query: {
      queryKey: getListProjectFilesQueryKey(projectId),
      enabled: Number.isFinite(projectId),
    },
  });
  const files = (filesQuery.data?.data ?? []) as FileRow[];
  const tree = useMemo(() => buildTree(files), [files]);

  // ---- Selection / editor state ------------------------------------------
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [openContents, setOpenContents] = useState<Record<number, string>>({});
  const [savedContents, setSavedContents] = useState<Record<number, string>>({});
  const [loadingFileIds, setLoadingFileIds] = useState<Set<number>>(new Set());

  // Auto-select first file once files load
  useEffect(() => {
    if (selectedFileId == null && files.length > 0) {
      const first = files.find((f) => !f.name.endsWith("/.gitkeep")) ?? files[0];
      setSelectedFileId(first.id);
    }
  }, [files, selectedFileId]);

  // Lazy-load file content on selection
  useEffect(() => {
    if (selectedFileId == null) return;
    if (selectedFileId in openContents) return;
    if (loadingFileIds.has(selectedFileId)) return;
    setLoadingFileIds((s) => new Set(s).add(selectedFileId));
    apiReadContent(projectId, selectedFileId)
      .then((content) => {
        setOpenContents((m) => ({ ...m, [selectedFileId]: content }));
        setSavedContents((m) => ({ ...m, [selectedFileId]: content }));
      })
      .catch((err) => {
        toast({
          variant: "destructive",
          title: "Couldn't open file",
          description: errMsg(err, "Read failed"),
        });
      })
      .finally(() => {
        setLoadingFileIds((s) => {
          const n = new Set(s);
          n.delete(selectedFileId);
          return n;
        });
      });
  }, [selectedFileId, projectId, openContents, loadingFileIds, toast]);

  const dirtyFileIds = useMemo(() => {
    const out: number[] = [];
    for (const id of Object.keys(openContents)) {
      const n = Number(id);
      if (openContents[n] !== savedContents[n]) out.push(n);
    }
    return out;
  }, [openContents, savedContents]);

  // Warn on unsaved navigation: covers both browser-level navigation
  // (close/refresh) and SPA navigation (in-app link clicks + history
  // back/forward). wouter has no built-in route blocker, so we
  // intercept anchor clicks during the capture phase and patch
  // history.pushState/replaceState + popstate to ask first.
  useEffect(() => {
    const dirty = () => dirtyFileIds.length > 0;
    const ask = () =>
      window.confirm("You have unsaved changes. Leave anyway?");

    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    function onClickCapture(e: MouseEvent) {
      if (!dirty()) return;
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      // External or new-tab links go through onBeforeUnload instead.
      if (anchor.target && anchor.target !== "_self") return;
      const here = window.location.pathname + window.location.search;
      if (href === here) return;
      if (!ask()) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;
    window.history.pushState = function (...args) {
      if (dirty() && !ask()) return;
      return origPush.apply(this, args as Parameters<typeof origPush>);
    };
    window.history.replaceState = function (...args) {
      if (dirty() && !ask()) return;
      return origReplace.apply(this, args as Parameters<typeof origReplace>);
    };
    function onPopState(e: PopStateEvent) {
      if (dirty() && !ask()) {
        // Re-push current location to undo the back/forward.
        origPush.call(
          window.history,
          e.state,
          "",
          window.location.pathname + window.location.search,
        );
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("popstate", onPopState);
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
    };
  }, [dirtyFileIds.length]);

  const selectedFile = files.find((f) => f.id === selectedFileId) ?? null;
  const selectedContent = selectedFileId != null ? openContents[selectedFileId] : undefined;
  const isSelectedDirty =
    selectedFileId != null &&
    openContents[selectedFileId] !== savedContents[selectedFileId];

  // ---- Save / Commit -----------------------------------------------------
  const [saving, setSaving] = useState(false);
  const [committing, setCommitting] = useState(false);

  const saveCurrent = useCallback(async () => {
    if (selectedFileId == null || selectedContent == null || !isSelectedDirty) return;
    setSaving(true);
    try {
      const res = await apiWriteContent(projectId, selectedFileId, selectedContent);
      setSavedContents((m) => ({ ...m, [selectedFileId]: selectedContent }));
      queryClient.invalidateQueries({
        queryKey: getListProjectFilesQueryKey(projectId),
      });
      if (res.commitWarning) {
        toast({
          variant: "destructive",
          title: "Saved (commit skipped)",
          description: `${selectedFile?.name ?? "file"} — ${res.commitWarning}`,
        });
      } else if (res.commit?.commitSha) {
        toast({
          title: "Saved & committed",
          description: `${selectedFile?.name ?? "file"} → ${res.commit.branch} @ ${res.commit.commitSha.slice(0, 7)}`,
        });
      } else {
        toast({ title: "Saved", description: selectedFile?.name });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: errMsg(err, "Could not save."),
      });
    } finally {
      setSaving(false);
    }
  }, [
    selectedFileId,
    selectedContent,
    isSelectedDirty,
    projectId,
    queryClient,
    toast,
    selectedFile?.name,
  ]);

  // Cmd/Ctrl+S
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isSave = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s";
      if (isSave) {
        e.preventDefault();
        void saveCurrent();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveCurrent]);

  // ---- File-tree mutations ------------------------------------------------
  const removeFile = useDeleteProjectFile();

  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileBase, setNewFileBase] = useState(""); // optional folder prefix
  const [newFileName, setNewFileName] = useState("");
  const [newFileIsFolder, setNewFileIsFolder] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileRow | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function openNewFile(base = "", isFolder = false) {
    setNewFileBase(base);
    setNewFileName("");
    setNewFileIsFolder(isFolder);
    setNewFileOpen(true);
  }

  async function submitNewFile() {
    const trimmed = newFileName.trim();
    if (!trimmed) return;
    const path = newFileBase ? `${newFileBase}/${trimmed}` : trimmed;
    const finalPath = newFileIsFolder ? `${path}/.gitkeep` : path;
    try {
      const created = await apiCreateInline(projectId, finalPath, "");
      queryClient.invalidateQueries({
        queryKey: getListProjectFilesQueryKey(projectId),
      });
      setNewFileOpen(false);
      if (!newFileIsFolder) {
        setSelectedFileId(created.id);
      }
      toast({
        title: newFileIsFolder ? "Folder created" : "File created",
        description: finalPath,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Create failed",
        description: errMsg(err, "Could not create."),
      });
    }
  }

  function openRename(file: FileRow) {
    setRenameTarget(file);
    setRenameValue(file.name);
    setRenameOpen(true);
  }

  async function submitRename() {
    if (!renameTarget) return;
    const next = renameValue.trim();
    if (!next || next === renameTarget.name) {
      setRenameOpen(false);
      return;
    }
    try {
      await apiRename(projectId, renameTarget.id, next);
      queryClient.invalidateQueries({
        queryKey: getListProjectFilesQueryKey(projectId),
      });
      setRenameOpen(false);
      toast({ title: "Renamed", description: next });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Rename failed",
        description: errMsg(err, "Could not rename."),
      });
    }
  }

  async function handleFolderDelete(folderPath: string) {
    if (
      !window.confirm(
        `Delete folder "${folderPath}" and all files inside it?`,
      )
    )
      return;
    try {
      const r = await apiFolderOp(projectId, { op: "delete", path: folderPath });
      toast({
        title: "Folder deleted",
        description: `${r.deleted ?? 0} files removed (commit to push).`,
      });
      // Drop any open buffers that lived under this folder.
      const liveFiles = files;
      const isUnderFolder = (id: number) => {
        const f = liveFiles.find((x) => x.id === id);
        return (
          !f ||
          f.name.startsWith(`${folderPath}/`) ||
          f.name === `${folderPath}/.gitkeep`
        );
      };
      if (selectedFileId != null && isUnderFolder(selectedFileId)) {
        setSelectedFileId(null);
      }
      setOpenContents((m) => {
        const n: Record<number, string> = {};
        for (const [k, v] of Object.entries(m)) {
          if (!isUnderFolder(Number(k))) n[Number(k)] = v;
        }
        return n;
      });
      setSavedContents((m) => {
        const n: Record<number, string> = {};
        for (const [k, v] of Object.entries(m)) {
          if (!isUnderFolder(Number(k))) n[Number(k)] = v;
        }
        return n;
      });
      queryClient.invalidateQueries({
        queryKey: getListProjectFilesQueryKey(projectId),
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Folder delete failed",
        description: errMsg(err, "Could not delete folder."),
      });
    }
  }

  async function handleFolderRename(folderPath: string) {
    const next = window.prompt("Rename folder to:", folderPath);
    if (!next || next === folderPath) return;
    try {
      const r = await apiFolderOp(projectId, {
        op: "rename",
        path: folderPath,
        newPath: next.replace(/\/+$/, ""),
      });
      toast({
        title: "Folder renamed",
        description: `${r.renamed ?? 0} files moved (commit to push).`,
      });
      queryClient.invalidateQueries({
        queryKey: getListProjectFilesQueryKey(projectId),
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Folder rename failed",
        description: errMsg(err, "Could not rename folder."),
      });
    }
  }

  function handleDelete(file: FileRow) {
    if (!window.confirm(`Delete ${file.name}?`)) return;
    removeFile.mutate(
      { id: projectId, fileId: file.id },
      {
        onSuccess: () => {
          if (selectedFileId === file.id) setSelectedFileId(null);
          setOpenContents((m) => {
            const n = { ...m };
            delete n[file.id];
            return n;
          });
          setSavedContents((m) => {
            const n = { ...m };
            delete n[file.id];
            return n;
          });
          queryClient.invalidateQueries({
            queryKey: getListProjectFilesQueryKey(projectId),
          });
        },
        onError: (err) =>
          toast({
            variant: "destructive",
            title: "Delete failed",
            description: errMsg(err, "Could not delete."),
          }),
      },
    );
  }

  // ---- Commit dialog ------------------------------------------------------
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");

  async function doCommit() {
    if (!project?.githubOwner || !project?.githubRepo) {
      toast({
        variant: "destructive",
        title: "GitHub not configured",
        description:
          "Set the project's GitHub owner/repo on the project details page first.",
      });
      return;
    }
    setCommitting(true);
    try {
      // Persist dirty buffers to DB only — the /files/commit call below
      // batches everything into a single GitHub commit.
      for (const id of dirtyFileIds) {
        await apiWriteContent(projectId, id, openContents[id] ?? "", {
          skipCommit: true,
        });
      }
      setSavedContents((m) => {
        const n = { ...m };
        for (const id of dirtyFileIds) n[id] = openContents[id] ?? "";
        return n;
      });
      const res = await apiCommit(
        projectId,
        commitMessage.trim() || "Workspace edit",
      );
      const delSuffix = res.deletionCount
        ? ` · -${res.deletionCount} deleted`
        : "";
      toast({
        title: `Committed to ${res.branch}`,
        description: `${res.fileCount} files${delSuffix} · ${res.commitSha.slice(0, 7)}`,
      });
      setCommitOpen(false);
      setCommitMessage("");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Commit failed",
        description: errMsg(err, "GitHub commit failed."),
      });
    } finally {
      setCommitting(false);
    }
  }

  // Push = commit current saved tree (no dialog — uses default message).
  const [pushing, setPushing] = useState(false);
  async function doPush() {
    if (!project?.githubOwner || !project?.githubRepo) {
      toast({
        variant: "destructive",
        title: "GitHub not configured",
        description: "Configure the project's GitHub repo first.",
      });
      return;
    }
    setPushing(true);
    try {
      // DB-only saves; the commit call below makes a single GitHub commit.
      for (const id of dirtyFileIds) {
        await apiWriteContent(projectId, id, openContents[id] ?? "", {
          skipCommit: true,
        });
      }
      setSavedContents((m) => {
        const n = { ...m };
        for (const id of dirtyFileIds) n[id] = openContents[id] ?? "";
        return n;
      });
      const res = await apiCommit(projectId, "Push from workspace");
      toast({
        title: `Pushed ${res.fileCount} files`,
        description: `${res.branch} · ${res.commitSha.slice(0, 7)}`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Push failed",
        description: errMsg(err, "Could not push."),
      });
    } finally {
      setPushing(false);
    }
  }

  // Pull = sync default-branch contents into project_files
  const [pulling, setPulling] = useState(false);
  async function doPull() {
    setPulling(true);
    try {
      const r = await apiPull(projectId);
      // Refresh tree + invalidate any open file contents
      queryClient.invalidateQueries({
        queryKey: getListProjectFilesQueryKey(projectId),
      });
      setOpenContents({});
      setSavedContents({});
      setLoadingFileIds(new Set());
      toast({
        title: `Pulled ${r.branch} @ ${r.sha.slice(0, 7)}`,
        description: `${r.files.created} new · ${r.files.updated} updated · ${r.files.unchanged} unchanged`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Pull failed",
        description: errMsg(err, "Could not pull."),
      });
    } finally {
      setPulling(false);
    }
  }

  // ---- Phase-X stub modals ----------------------------------------------
  const [aiPlanOpen, setAiPlanOpen] = useState(false);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  // ---- Search filter -----------------------------------------------------
  const [search, setSearch] = useState("");

  // ---- Logs panel: workspace events ----------------------------------
  type WorkspaceEvent = {
    id: number;
    changeRequestId: number;
    changeRequestTitle: string | null;
    eventType: string;
    payload: unknown;
    createdAt: string;
  };
  const eventsQuery = useQuery({
    queryKey: ["workspace-events", projectId],
    enabled: Number.isFinite(projectId),
    refetchInterval: 15000,
    queryFn: async () =>
      await customFetch<{ data: WorkspaceEvent[] }>(
        `/api/projects/${projectId}/events?limit=100`,
      ),
  });

  // ---- Preview URL (latest CR previewUrl with liveUrl fallback) ------
  const previewUrlQuery = useQuery({
    queryKey: ["workspace-preview-url", projectId],
    enabled: Number.isFinite(projectId),
    refetchInterval: 30000,
    queryFn: async () =>
      await customFetch<{ previewUrl: string | null; liveUrl: string | null }>(
        `/api/projects/${projectId}/preview-url`,
      ),
  });

  if (!Number.isFinite(projectId)) {
    return <div className="p-6">Invalid project id</div>;
  }
  if (projectQuery.isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading workspace…
      </div>
    );
  }
  if (!project) {
    return <div className="p-6">Project not found.</div>;
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      {/* ── Top action bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 h-11 border-b border-border/30 bg-background/40 shrink-0 overflow-x-auto">
        <Link href={`/projects/${projectId}`}>
          <button
            type="button"
            data-testid="button-back-project"
            className="h-7 px-2 inline-flex items-center gap-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition text-xs font-mono"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Project
          </button>
        </Link>
        <span className="text-xs font-mono text-foreground/80 truncate max-w-[20rem]">
          {project.title}
        </span>
        {dirtyFileIds.length > 0 && (
          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40">
            {dirtyFileIds.length} unsaved
          </span>
        )}
        <div className="flex-1" />
        <ActionBtn
          icon={<Save className="h-3.5 w-3.5" />}
          label="Save"
          onClick={saveCurrent}
          disabled={!isSelectedDirty || saving}
          loading={saving}
          testId="button-workspace-save"
          title="Save current file (Cmd/Ctrl+S)"
        />
        <ActionBtn
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="AI Plan"
          onClick={() => setAiPlanOpen(true)}
          testId="button-workspace-ai-plan"
        />
        <ActionBtn
          icon={<GitCommit className="h-3.5 w-3.5" />}
          label="Commit"
          onClick={() => setCommitOpen(true)}
          disabled={committing}
          loading={committing}
          testId="button-workspace-commit"
        />
        <ActionBtn
          icon={<ArrowDownToLine className="h-3.5 w-3.5" />}
          label="Pull"
          onClick={doPull}
          disabled={pulling}
          loading={pulling}
          testId="button-workspace-pull"
        />
        <ActionBtn
          icon={<ArrowUpFromLine className="h-3.5 w-3.5" />}
          label="Push"
          onClick={doPush}
          disabled={pushing}
          loading={pushing}
          testId="button-workspace-push"
        />
        <ActionBtn
          icon={<Rocket className="h-3.5 w-3.5" />}
          label="Publish"
          onClick={() => setPublishOpen(true)}
          testId="button-workspace-publish"
        />
        <ActionBtn
          icon={<KeyRound className="h-3.5 w-3.5" />}
          label="Secrets"
          onClick={() => setSecretsOpen(true)}
          testId="button-workspace-secrets"
        />
        <Link href={`/projects/${projectId}/history`}>
          <ActionBtn
            icon={<History className="h-3.5 w-3.5" />}
            label="History"
            onClick={() => {}}
            testId="button-workspace-history"
          />
        </Link>
      </div>

      {/* ── Main 4-panel layout ───────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup
          direction="vertical"
          autoSaveId={`md.workspace.v.${projectId}`}
        >
          <ResizablePanel defaultSize={70} minSize={30}>
            <ResizablePanelGroup
              direction="horizontal"
              autoSaveId={`md.workspace.h.${projectId}`}
            >
              {/* File tree */}
              <ResizablePanel defaultSize={20} minSize={12} maxSize={40}>
                <FileTreePanel
                  tree={tree}
                  search={search}
                  onSearchChange={setSearch}
                  selectedFileId={selectedFileId}
                  onSelect={setSelectedFileId}
                  dirtyFileIds={new Set(dirtyFileIds)}
                  onNewFile={(base) => openNewFile(base, false)}
                  onNewFolder={(base) => openNewFile(base, true)}
                  onRename={openRename}
                  onDelete={handleDelete}
                  onFolderRename={handleFolderRename}
                  onFolderDelete={handleFolderDelete}
                />
              </ResizablePanel>
              <ResizableHandle withHandle />

              {/* Editor */}
              <ResizablePanel defaultSize={50} minSize={25}>
                <EditorPanel
                  file={selectedFile}
                  content={selectedContent}
                  onChange={(v) =>
                    selectedFileId != null &&
                    setOpenContents((m) => ({ ...m, [selectedFileId]: v }))
                  }
                  isLoading={
                    selectedFileId != null && loadingFileIds.has(selectedFileId)
                  }
                  isDirty={isSelectedDirty}
                />
              </ResizablePanel>
              <ResizableHandle withHandle />

              {/* Preview */}
              <ResizablePanel defaultSize={30} minSize={20}>
                <WorkspacePreviewPane
                  previewUrl={previewUrlQuery.data?.previewUrl ?? null}
                  isLoading={previewUrlQuery.isLoading}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle withHandle />

          {/* Logs */}
          <ResizablePanel defaultSize={30} minSize={10} maxSize={50}>
            <LogsPanel
              events={eventsQuery.data?.data ?? []}
              isLoading={eventsQuery.isLoading}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* ── New file/folder dialog ────────────────────────────────── */}
      <Dialog open={newFileOpen} onOpenChange={setNewFileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {newFileIsFolder ? "New folder" : "New file"}
            </DialogTitle>
            <DialogDescription>
              {newFileBase
                ? `Inside ${newFileBase}/`
                : "At the project root"}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder={newFileIsFolder ? "src/components" : "src/foo.tsx"}
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitNewFile();
            }}
            data-testid="input-new-file-name"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewFileOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitNewFile} data-testid="button-new-file-submit">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
            <DialogDescription>
              Update the relative path of this file.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitRename();
            }}
            data-testid="input-rename-file"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitRename} data-testid="button-rename-submit">
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Commit dialog */}
      <Dialog open={commitOpen} onOpenChange={setCommitOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Commit workspace files</DialogTitle>
            <DialogDescription>
              Pushes the current file tree to{" "}
              <span className="font-mono">
                machinedog/workspace-&lt;you&gt;
              </span>{" "}
              on{" "}
              <span className="font-mono">
                {project.githubOwner}/{project.githubRepo}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Commit message"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            rows={3}
            data-testid="textarea-commit-message"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCommitOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={doCommit}
              disabled={committing}
              data-testid="button-commit-submit"
            >
              {committing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
              ) : (
                <GitCommit className="h-3.5 w-3.5 mr-2" />
              )}
              Commit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase stubs */}
      <StubDialog
        open={aiPlanOpen}
        onOpenChange={setAiPlanOpen}
        title="AI Plan"
        phase="Phase 4"
        description="The AI console — plan, propose, and apply multi-file changes — lands in Phase 4."
      />
      <StubDialog
        open={secretsOpen}
        onOpenChange={setSecretsOpen}
        title="Project Secrets"
        phase="Phase 5"
        description="Per-project secrets and audit logs land in Phase 5."
      />
      <StubDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publish"
        phase="Phase 6"
        description="Publish + build jobs + GitHub-driven auto-deploy lands in Phase 6."
      />
    </div>
  );
}

// ---- Subcomponents --------------------------------------------------------

function ActionBtn({
  icon,
  label,
  onClick,
  disabled,
  loading,
  testId,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  testId?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      data-testid={testId}
      className="h-7 px-2 inline-flex items-center gap-1.5 rounded-md ring-1 ring-border/30 bg-background/60 hover:bg-background/80 transition font-mono text-[11px] text-foreground/90 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

function FileTreePanel({
  tree,
  search,
  onSearchChange,
  selectedFileId,
  onSelect,
  dirtyFileIds,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onFolderRename,
  onFolderDelete,
}: {
  tree: TreeNode;
  search: string;
  onSearchChange: (v: string) => void;
  selectedFileId: number | null;
  onSelect: (id: number) => void;
  dirtyFileIds: Set<number>;
  onNewFile: (base: string) => void;
  onNewFolder: (base: string) => void;
  onRename: (file: FileRow) => void;
  onDelete: (file: FileRow) => void;
  onFolderRename: (path: string) => void;
  onFolderDelete: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function toggle(path: string) {
    setExpanded((e) => ({ ...e, [path]: !e[path] }));
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.toLowerCase();
    function filterNode(n: TreeNode): TreeNode | null {
      if (n.type === "file") {
        return n.path.toLowerCase().includes(q) ? n : null;
      }
      const kids = n.children
        .map(filterNode)
        .filter((c): c is TreeNode => c !== null);
      if (kids.length === 0) return null;
      return { ...n, children: kids };
    }
    const out = filterNode(tree);
    return out ?? { ...tree, children: [] };
  }, [tree, search]);

  // When searching, expand everything
  const effectiveExpanded = search.trim() ? null : expanded;

  return (
    <div className="h-full flex flex-col bg-muted/10 border-r border-border/30">
      <div className="px-2 py-2 border-b border-border/30 flex items-center gap-1 shrink-0">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex-1 px-1">
          Files
        </span>
        <button
          type="button"
          onClick={() => onNewFile("")}
          title="New file"
          data-testid="button-tree-new-file"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40"
        >
          <FilePlus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onNewFolder("")}
          title="New folder"
          data-testid="button-tree-new-folder"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-2 py-1.5 border-b border-border/30 shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search files…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            data-testid="input-tree-search"
            className="w-full pl-7 pr-2 h-7 text-xs font-mono bg-background/60 rounded ring-1 ring-border/30 focus:ring-primary/40 focus:outline-none"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto p-1">
        {filtered.children.length === 0 ? (
          <div className="px-3 py-6 text-xs text-muted-foreground text-center">
            {search.trim() ? "No matches." : "No files yet."}
          </div>
        ) : (
          <TreeNodes
            nodes={filtered.children}
            depth={0}
            expanded={effectiveExpanded}
            toggle={toggle}
            selectedFileId={selectedFileId}
            onSelect={onSelect}
            dirtyFileIds={dirtyFileIds}
            onNewFile={onNewFile}
            onNewFolder={onNewFolder}
            onRename={onRename}
            onDelete={onDelete}
            onFolderRename={onFolderRename}
            onFolderDelete={onFolderDelete}
          />
        )}
      </div>
    </div>
  );
}

function TreeNodes({
  nodes,
  depth,
  expanded,
  toggle,
  selectedFileId,
  onSelect,
  dirtyFileIds,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onFolderRename,
  onFolderDelete,
}: {
  nodes: TreeNode[];
  depth: number;
  expanded: Record<string, boolean> | null;
  toggle: (p: string) => void;
  selectedFileId: number | null;
  onSelect: (id: number) => void;
  dirtyFileIds: Set<number>;
  onNewFile: (base: string) => void;
  onNewFolder: (base: string) => void;
  onRename: (file: FileRow) => void;
  onDelete: (file: FileRow) => void;
  onFolderRename: (path: string) => void;
  onFolderDelete: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((n) => {
        if (n.type === "folder") {
          const isOpen = expanded == null ? true : expanded[n.path] ?? depth < 1;
          return (
            <div key={`f-${n.path}`}>
              <div
                className="group flex items-center gap-1 px-1 py-0.5 rounded hover:bg-muted/40 cursor-pointer text-xs font-mono"
                style={{ paddingLeft: `${depth * 10 + 4}px` }}
                onClick={() => toggle(n.path)}
                data-testid={`tree-folder-${n.path}`}
              >
                {isOpen ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
                {isOpen ? (
                  <FolderOpen className="h-3.5 w-3.5 text-amber-400/80 shrink-0" />
                ) : (
                  <Folder className="h-3.5 w-3.5 text-amber-400/70 shrink-0" />
                )}
                <span className="truncate flex-1">{n.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNewFile(n.path);
                  }}
                  title="New file in this folder"
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted/60"
                >
                  <FilePlus className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFolderRename(n.path);
                  }}
                  title="Rename folder"
                  data-testid={`button-folder-rename-${n.path}`}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted/60"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFolderDelete(n.path);
                  }}
                  title="Delete folder"
                  data-testid={`button-folder-delete-${n.path}`}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/20"
                >
                  <Trash2 className="h-3 w-3 text-destructive/80" />
                </button>
              </div>
              {isOpen && n.children.length > 0 && (
                <TreeNodes
                  nodes={n.children}
                  depth={depth + 1}
                  expanded={expanded}
                  toggle={toggle}
                  selectedFileId={selectedFileId}
                  onSelect={onSelect}
                  dirtyFileIds={dirtyFileIds}
                  onNewFile={onNewFile}
                  onNewFolder={onNewFolder}
                  onRename={onRename}
                  onDelete={onDelete}
                  onFolderRename={onFolderRename}
                  onFolderDelete={onFolderDelete}
                />
              )}
            </div>
          );
        }
        const file = n.file!;
        const active = selectedFileId === file.id;
        const dirty = dirtyFileIds.has(file.id);
        return (
          <div
            key={`file-${file.id}`}
            className={
              "group flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer text-xs font-mono " +
              (active
                ? "bg-primary/15 text-primary"
                : "hover:bg-muted/40 text-foreground/90")
            }
            style={{ paddingLeft: `${depth * 10 + 16}px` }}
            onClick={() => onSelect(file.id)}
            data-testid={`tree-file-${file.id}`}
          >
            <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate flex-1">{n.name}</span>
            {dirty && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Unsaved" />
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRename(file);
              }}
              title="Rename"
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted/60"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(file);
              }}
              title="Delete"
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/20"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </>
  );
}

function EditorPanel({
  file,
  content,
  onChange,
  isLoading,
  isDirty,
}: {
  file: FileRow | null;
  content: string | undefined;
  onChange: (v: string) => void;
  isLoading: boolean;
  isDirty: boolean;
}) {
  if (!file) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-xs font-mono">
        Select a file to edit
      </div>
    );
  }
  return (
    <div className="h-full flex flex-col bg-background/60">
      <div className="flex items-center gap-2 px-3 h-8 border-b border-border/30 shrink-0 bg-muted/20">
        <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-mono truncate flex-1">{file.name}</span>
        {isDirty && (
          <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300">
            • unsaved
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {isLoading || content == null ? (
          <div className="h-full flex items-center justify-center text-muted-foreground gap-2 text-xs font-mono">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : (
          <Editor
            language={detectLanguage(file.name)}
            value={content}
            onChange={(v) => onChange(v ?? "")}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              tabSize: 2,
              automaticLayout: true,
              scrollBeyondLastLine: false,
              wordWrap: "on",
            }}
          />
        )}
      </div>
    </div>
  );
}

type WorkspaceEventRow = {
  id: number;
  changeRequestId: number;
  changeRequestTitle: string | null;
  eventType: string;
  kind?: string;
  message?: string;
  payload: unknown;
  createdAt: string;
};

function eventSummary(ev: WorkspaceEventRow): string {
  if (ev.message && ev.message.length > 0) return ev.message;
  const p = (ev.payload ?? {}) as Record<string, unknown>;
  const pick = (k: string): string | null => {
    const v = p[k];
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  return (
    pick("message") ??
    pick("status") ??
    pick("note") ??
    pick("summary") ??
    ev.eventType
  );
}

function WorkspacePreviewPane({
  previewUrl,
  isLoading,
}: {
  previewUrl: string | null;
  isLoading: boolean;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  if (isLoading && !previewUrl) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin mr-2" /> Loading preview…
      </div>
    );
  }
  if (!previewUrl) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center"
        data-testid="preview-empty-state"
      >
        <div className="text-sm font-medium">No preview yet</div>
        <p className="text-xs text-muted-foreground max-w-xs leading-5">
          Open or run an AI change request to generate a deployable preview.
          The latest preview URL will appear here automatically.
        </p>
        <Link href="#" onClick={(e) => e.preventDefault()}>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="button-preview-new-cr"
            onClick={() => {
              window.location.hash = "#new-change-request";
            }}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Start a change request
          </Button>
        </Link>
      </div>
    );
  }
  return (
    <div className="h-full flex flex-col" data-testid="preview-iframe-wrap">
      <div className="flex items-center gap-2 px-2 h-7 border-b border-border/30 shrink-0">
        <span className="text-[10px] font-mono text-muted-foreground truncate flex-1">
          {previewUrl}
        </span>
        <button
          type="button"
          className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          onClick={() => setReloadKey((k) => k + 1)}
          data-testid="button-preview-reload"
        >
          Reload
        </button>
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          data-testid="button-preview-open"
        >
          Open ↗
        </a>
      </div>
      <iframe
        key={reloadKey}
        src={previewUrl}
        title="Workspace preview"
        className="flex-1 w-full bg-background"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
      />
    </div>
  );
}

function LogsPanel({
  events,
  isLoading,
}: {
  events: WorkspaceEventRow[];
  isLoading: boolean;
}) {
  const [tab, setTab] = useState<"build" | "events" | "errors">("events");
  const errorEvents = events.filter((e) =>
    /error|fail/i.test(e.eventType),
  );
  return (
    <div className="h-full flex flex-col bg-muted/10 border-t border-border/30">
      <div className="flex items-center gap-1 px-2 h-8 border-b border-border/30 shrink-0">
        <LogTab label="Build" active={tab === "build"} onClick={() => setTab("build")} testId="logs-tab-build" />
        <LogTab
          label={`Events${events.length ? ` (${events.length})` : ""}`}
          active={tab === "events"}
          onClick={() => setTab("events")}
          testId="logs-tab-events"
        />
        <LogTab
          label={`Errors${errorEvents.length ? ` (${errorEvents.length})` : ""}`}
          active={tab === "errors"}
          onClick={() => setTab("errors")}
          testId="logs-tab-errors"
        />
      </div>
      <div className="flex-1 overflow-auto p-2 text-xs font-mono">
        {tab === "build" && (
          <div className="text-muted-foreground px-2 py-3">
            Build job logs land in Phase 6.
          </div>
        )}
        {tab === "events" && (
          <EventsList events={events} isLoading={isLoading} emptyText="No workspace events yet." />
        )}
        {tab === "errors" && (
          <EventsList events={errorEvents} isLoading={isLoading} emptyText="No errors recorded." />
        )}
      </div>
    </div>
  );
}

function EventsList({
  events,
  isLoading,
  emptyText,
}: {
  events: WorkspaceEventRow[];
  isLoading: boolean;
  emptyText: string;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground px-2 py-3">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading…
      </div>
    );
  }
  if (events.length === 0) {
    return <div className="text-muted-foreground px-2 py-3">{emptyText}</div>;
  }
  return (
    <ul className="space-y-0.5">
      {events.map((ev) => {
        const ts = new Date(ev.createdAt);
        const hh = isNaN(ts.getTime()) ? "" : ts.toLocaleTimeString();
        return (
          <li
            key={ev.id}
            className="flex items-start gap-2 px-2 py-1 rounded hover:bg-muted/30"
            data-testid={`log-event-${ev.id}`}
          >
            <span className="text-[10px] text-muted-foreground w-16 shrink-0 mt-0.5">
              {hh}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-32 shrink-0 mt-0.5 truncate">
              {ev.eventType}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block truncate">{eventSummary(ev)}</span>
              {ev.changeRequestTitle && (
                <span className="block text-[10px] text-muted-foreground/70 truncate">
                  CR #{ev.changeRequestId} · {ev.changeRequestTitle}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function LogTab({
  label,
  active,
  onClick,
  testId,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={
        "px-2 h-6 inline-flex items-center rounded text-[10px] font-mono uppercase tracking-wider transition " +
        (active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/30")
      }
    >
      {label}
    </button>
  );
}

function StubDialog({
  open,
  onOpenChange,
  title,
  phase,
  description,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  phase: string;
  description: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs uppercase tracking-wider text-primary">
              {phase}
            </span>
            <p className="mt-2">{description}</p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
