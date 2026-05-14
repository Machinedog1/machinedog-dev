import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import {
  useGetProject,
  useListProjectBuilds,
  useListProjectDeployments,
  useTriggerProjectBuild,
  useTestProjectHosting,
  useListProjectSecrets,
  getListProjectBuildsQueryKey,
  getListProjectDeploymentsQueryKey,
  getListProjectSecretsQueryKey,
} from "@workspace/api-client-react";
import { HostingCredentialsForm } from "@/components/HostingCredentialsForm";
import { useActiveBuild } from "@/components/ActiveBuildContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Rocket, GitBranch, RefreshCw, ArrowLeft, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type Env = "preview" | "staging" | "production";

const REQUIRED_SECRETS: Record<"vercel" | "render", string[]> = {
  vercel: ["VERCEL_API_TOKEN", "VERCEL_WEBHOOK_SECRET"],
  render: ["RENDER_API_TOKEN", "RENDER_WEBHOOK_SECRET"],
};

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "live" || status === "succeeded"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
      : status === "failed" || status === "canceled"
        ? "bg-red-500/10 text-red-400 border-red-500/30"
        : status === "running" || status === "building"
          ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
          : "bg-muted/30 text-muted-foreground border-border/40";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wider ${tone}`}
    >
      {status}
    </span>
  );
}

export default function ProjectPublishPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const projectQuery = useGetProject(projectId);
  const project = projectQuery.data;
  const isOwner = project?.viewerRole === "owner";
  const provider = (project?.hostingProvider ?? "replit") as "replit" | "vercel" | "render";

  const [environment, setEnvironment] = useState<Env>("production");
  const [branch, setBranch] = useState("");
  const [streamingBuildId, setStreamingBuildId] = useState<number | null>(null);
  const [streamLogs, setStreamLogs] = useState<string[]>([]);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (project?.githubDefaultBranch && !branch) setBranch(project.githubDefaultBranch);
  }, [project?.githubDefaultBranch, branch]);

  const buildsQuery = useListProjectBuilds(
    projectId,
    {},
    {
      query: {
        queryKey: getListProjectBuildsQueryKey(projectId, {}),
        refetchInterval: 5000,
      },
    },
  );
  const deploymentsQuery = useListProjectDeployments(
    projectId,
    {},
    {
      query: {
        queryKey: getListProjectDeploymentsQueryKey(projectId, {}),
        refetchInterval: 5000,
      },
    },
  );
  const secretsQuery = useListProjectSecrets(projectId, {
    query: {
      queryKey: getListProjectSecretsQueryKey(projectId),
      enabled: isOwner && provider !== "replit",
    },
  });

  const required = provider === "replit" ? [] : REQUIRED_SECRETS[provider];
  const presentSecrets = new Set((secretsQuery.data?.data ?? []).map((s) => s.name));
  const missingSecrets = required.filter((s) => !presentSecrets.has(s));

  const triggerBuild = useTriggerProjectBuild();
  const testConn = useTestProjectHosting();
  const { setActiveBuild } = useActiveBuild();

  const handleDeploy = async () => {
    try {
      const res = await triggerBuild.mutateAsync({
        id: projectId,
        data: { environment, branch: branch || undefined },
      });
      setStreamingBuildId(res.data.id);
      setStreamLogs([
        `[${new Date().toISOString()}] Build #${res.data.id} queued on ${res.data.provider}.`,
      ]);
      // Surface the build in the workspace bottom log panel so the stream
      // follows the user across pages, not just /publish.
      setActiveBuild({
        projectId,
        buildId: res.data.id,
        label: `${res.data.provider} ${environment}`,
      });
      toast({ title: "Build queued", description: `Build #${res.data.id} started.` });
      qc.invalidateQueries({ queryKey: getListProjectBuildsQueryKey(projectId, {}) });
      qc.invalidateQueries({ queryKey: getListProjectDeploymentsQueryKey(projectId, {}) });
    } catch (err) {
      toast({
        title: "Build failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleTest = async () => {
    try {
      const res = await testConn.mutateAsync({ id: projectId });
      toast({
        title: res.ok ? "Connection OK" : "Connection failed",
        description: res.message,
        variant: res.ok ? "default" : "destructive",
      });
    } catch (err) {
      toast({
        title: "Test failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  // SSE log stream — auto-closes on terminal status events from the server.
  useEffect(() => {
    if (!streamingBuildId) return;
    const url = `/api/projects/${projectId}/builds/${streamingBuildId}/logs/stream`;
    const es = new EventSource(url, { withCredentials: true });
    sourceRef.current = es;
    const append = (line: string) =>
      setStreamLogs((prev) => [...prev.slice(-200), `[${new Date().toISOString()}] ${line}`]);
    es.addEventListener("log", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { lines: string[] };
        for (const line of data.lines ?? []) append(line);
      } catch {
        append("(unparseable log frame)");
      }
    });
    es.addEventListener("status", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        append(`status → ${data.status}${data.errorMessage ? ` (${data.errorMessage})` : ""}`);
      } catch {
        append("status update");
      }
    });
    es.addEventListener("done", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        append(`done: ${data.status}`);
      } catch {
        append("done");
      }
      es.close();
      sourceRef.current = null;
      qc.invalidateQueries({ queryKey: getListProjectBuildsQueryKey(projectId, {}) });
      qc.invalidateQueries({ queryKey: getListProjectDeploymentsQueryKey(projectId, {}) });
    });
    es.onerror = () => {
      append("stream error — closed");
      es.close();
      sourceRef.current = null;
    };
    return () => {
      es.close();
      sourceRef.current = null;
    };
  }, [streamingBuildId, projectId, qc]);

  const builds = useMemo(() => buildsQuery.data?.data ?? [], [buildsQuery.data]);
  const deployments = useMemo(() => deploymentsQuery.data?.data ?? [], [deploymentsQuery.data]);
  // Live card surfaces the most recent *production* deployment so it
  // matches the project's actual production URL — not a preview/staging
  // one that happens to be live.
  const liveDeployment = deployments.find(
    (d) => d.status === "live" && d.environment === "production",
  );

  if (projectQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="glass rounded-xl p-8 text-center">
          <p className="font-mono text-sm text-muted-foreground">PROJECT_NOT_FOUND</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6" data-testid="page-project-publish">
      <div className="flex items-center gap-3">
        <Link href={`/projects/${projectId}`}>
          <Button size="sm" variant="ghost" data-testid="link-back-to-project">
            <ArrowLeft className="h-4 w-4 mr-1" /> back
          </Button>
        </Link>
        <Rocket className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-mono font-bold uppercase tracking-wider">
          Publish · {project.title}
        </h1>
        <span className="text-xs font-mono text-muted-foreground ml-auto">
          provider: <span className="text-primary">{provider}</span>
          {project.hostingProjectId ? ` · ${project.hostingProjectId}` : ""}
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 glass rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h2 className="font-mono uppercase tracking-wider text-sm">Trigger build & deploy</h2>
            {!isOwner && (
              <span className="text-[10px] font-mono text-muted-foreground">view-only</span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
                Environment
              </span>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as Env)}
                className="rounded-md border border-border/40 bg-background px-2 py-1.5 text-sm font-mono"
                disabled={!isOwner}
                data-testid="select-environment"
              >
                <option value="production">production</option>
                <option value="staging">staging</option>
                <option value="preview">preview</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
                Branch
              </span>
              <div className="flex items-center gap-2">
                <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder={project.githubDefaultBranch}
                  className="flex-1 rounded-md border border-border/40 bg-background px-2 py-1.5 text-sm font-mono"
                  disabled={!isOwner}
                  data-testid="input-branch"
                />
              </div>
            </label>
          </div>

          {provider !== "replit" && isOwner && missingSecrets.length > 0 && (
            <HostingCredentialsForm
              projectId={projectId}
              provider={provider}
              missingSecrets={missingSecrets}
              variant="panel"
            />
          )}

          <div className="flex items-center gap-2">
            <Button
              onClick={handleDeploy}
              disabled={!isOwner || triggerBuild.isPending}
              data-testid="button-deploy"
            >
              {triggerBuild.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Deploy now (5 + 10 TKNS)
            </Button>
            {provider !== "replit" && (
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={!isOwner || testConn.isPending}
                data-testid="button-test-connection"
              >
                {testConn.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                Test connection
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                buildsQuery.refetch();
                deploymentsQuery.refetch();
              }}
              data-testid="button-refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {streamingBuildId && (
            <div className="rounded-md border border-border/40 bg-black/40 p-3 font-mono text-[11px] max-h-48 overflow-y-auto">
              <div className="text-muted-foreground mb-1">
                Live log stream · build #{streamingBuildId}
              </div>
              {streamLogs.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap text-foreground/90">
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass rounded-xl p-5 flex flex-col gap-3">
          <h2 className="font-mono uppercase tracking-wider text-sm">Live</h2>
          {liveDeployment ? (
            <>
              <div className="flex items-center gap-2 text-sm font-mono">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>{liveDeployment.environment}</span>
              </div>
              {liveDeployment.url && (
                <a
                  href={liveDeployment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary text-xs font-mono break-all underline"
                >
                  {liveDeployment.url}
                </a>
              )}
              {liveDeployment.deployedAt && (
                <p className="text-[11px] text-muted-foreground font-mono">
                  Deployed {format(new Date(liveDeployment.deployedAt), "yyyy-MM-dd HH:mm")}
                </p>
              )}
              {liveDeployment.commitSha && (
                <p className="text-[11px] text-muted-foreground font-mono">
                  {liveDeployment.commitSha.slice(0, 12)}
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled
                title="Rollback coming soon — re-deploy a prior commit instead."
                data-testid="button-rollback-placeholder"
              >
                Rollback (soon)
              </Button>
            </>
          ) : (
            <p className="text-xs font-mono text-muted-foreground">
              No production deployment recorded yet.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="glass rounded-xl p-5 flex flex-col gap-3">
          <h2 className="font-mono uppercase tracking-wider text-sm">Build configuration</h2>
          <p className="text-[11px] font-mono text-muted-foreground">
            Adapter currently uses host defaults; configure these on the host dashboard until
            project-side overrides land.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
              Build command
            </span>
            <input
              placeholder={provider === "render" ? "npm run build" : "(host default)"}
              disabled
              className="rounded-md border border-border/40 bg-background/40 px-2 py-1.5 text-xs font-mono text-muted-foreground"
              data-testid="input-build-command"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
              Start command
            </span>
            <input
              placeholder={provider === "render" ? "npm run start" : "(host default)"}
              disabled
              className="rounded-md border border-border/40 bg-background/40 px-2 py-1.5 text-xs font-mono text-muted-foreground"
              data-testid="input-start-command"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
              Custom domain
            </span>
            <input
              placeholder="app.example.com (configure on host)"
              disabled
              className="rounded-md border border-border/40 bg-background/40 px-2 py-1.5 text-xs font-mono text-muted-foreground"
              data-testid="input-custom-domain"
            />
          </label>
        </div>

        <div className="glass rounded-xl p-5 flex flex-col gap-3">
          <h2 className="font-mono uppercase tracking-wider text-sm">Status timeline</h2>
          {deployments.length === 0 && builds.length === 0 && (
            <p className="text-xs font-mono text-muted-foreground">
              No activity yet — trigger your first deploy.
            </p>
          )}
          <ol className="flex flex-col gap-2 text-[11px] font-mono">
            {[
              ...builds.slice(0, 5).map((b) => ({
                id: `b-${b.id}`,
                ts: b.createdAt,
                label: `Build #${b.id} ${b.status}`,
                status: b.status,
              })),
              ...deployments.slice(0, 5).map((d) => ({
                id: `d-${d.id}`,
                ts: d.createdAt,
                label: `Deploy ${d.environment} ${d.status}`,
                status: d.status,
              })),
            ]
              .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
              .slice(0, 8)
              .map((evt) => (
                <li key={evt.id} className="flex items-center gap-2 border-b border-border/20 pb-1">
                  <span className="text-muted-foreground w-[110px]">
                    {format(new Date(evt.ts), "MM-dd HH:mm:ss")}
                  </span>
                  <StatusBadge status={evt.status} />
                  <span className="text-foreground/80">{evt.label}</span>
                </li>
              ))}
          </ol>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="glass rounded-xl p-5 flex flex-col gap-3">
          <h2 className="font-mono uppercase tracking-wider text-sm">Recent builds</h2>
          {builds.length === 0 && (
            <p className="text-xs font-mono text-muted-foreground">No builds yet.</p>
          )}
          {builds.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-2 text-xs font-mono border-b border-border/20 pb-2"
              data-testid={`row-build-${b.id}`}
            >
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">
                {format(new Date(b.createdAt), "MM-dd HH:mm:ss")}
              </span>
              <StatusBadge status={b.status} />
              <span className="text-muted-foreground">{b.provider}</span>
              <span className="ml-auto truncate max-w-[140px]" title={b.commitSha ?? ""}>
                {b.commitSha?.slice(0, 7) ?? b.branch ?? "—"}
              </span>
              {b.logsUrl && (
                <a
                  href={b.logsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  logs
                </a>
              )}
            </div>
          ))}
        </div>

        <div className="glass rounded-xl p-5 flex flex-col gap-3">
          <h2 className="font-mono uppercase tracking-wider text-sm">Deployment history</h2>
          {deployments.length === 0 && (
            <p className="text-xs font-mono text-muted-foreground">No deployments yet.</p>
          )}
          {deployments.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-2 text-xs font-mono border-b border-border/20 pb-2"
              data-testid={`row-deployment-${d.id}`}
            >
              {d.status === "live" ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              ) : d.status === "failed" ? (
                <XCircle className="h-3 w-3 text-red-400" />
              ) : (
                <Clock className="h-3 w-3 text-amber-400" />
              )}
              <span className="text-muted-foreground">
                {format(new Date(d.createdAt), "MM-dd HH:mm:ss")}
              </span>
              <StatusBadge status={d.status} />
              <span className="text-muted-foreground">{d.environment}</span>
              {d.url && (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline truncate max-w-[180px]"
                >
                  {d.url.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
