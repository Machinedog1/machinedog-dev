import { useGetAdminMetrics } from "@workspace/api-client-react";
import {
  ShieldAlert,
  Users,
  Coins,
  Briefcase,
  Activity,
  FolderGit2,
  HeartPulse,
  Rocket,
  Hammer,
  Github,
  FileWarning,
  Package,
  ShieldCheck,
} from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function AdminDashboard() {
  const { data: metrics, isLoading } = useGetAdminMetrics();

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-6xl mx-auto w-full gap-8 overflow-y-auto">
      <div className="flex flex-col gap-2 shrink-0">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-primary" />
          SYSTEM_OVERVIEW
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          Machinedog.Dev operations and platform metrics. Cached up to 60s.
        </p>
      </div>

      {isLoading || !metrics ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-28 glass rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/admin/orders">
              <StatCard
                title="MRR_USD"
                value={`$${(metrics.mrrCents / 100).toLocaleString()}`}
                icon={<Briefcase className="h-4 w-4 text-primary" />}
              />
            </Link>
            <Link href="/admin/tokens">
              <StatCard
                title="TOKEN_REVENUE"
                value={`$${(metrics.tokenRevenueCents / 100).toLocaleString()}`}
                icon={<Coins className="h-4 w-4 text-primary" />}
              />
            </Link>
            <Link href="/admin/organizations">
              <StatCard
                title="ORGS"
                value={`${metrics.activeSubscriptions} / ${metrics.totalOrganizations}`}
                icon={<ShieldAlert className="h-4 w-4 text-primary" />}
              />
            </Link>
            <Link href="/admin/users">
              <StatCard
                title="USERS"
                value={metrics.totalUsers.toLocaleString()}
                icon={<Users className="h-4 w-4 text-primary" />}
              />
            </Link>
            <Link href="/admin/tokens">
              <StatCard
                title="TOKENS_USED"
                value={metrics.totalTokensUsed.toLocaleString()}
                icon={<Activity className="h-4 w-4 text-primary" />}
              />
            </Link>
            <Link href="/admin/projects">
              <StatCard
                title="PROJECTS"
                value={`${metrics.activeProjects} / ${metrics.totalProjects}`}
                icon={<FolderGit2 className="h-4 w-4 text-primary" />}
              />
            </Link>
            <Link href="/admin/deployments">
              <StatCard
                title="PUBLISHED"
                value={metrics.publishedProjects.toLocaleString()}
                icon={<Rocket className="h-4 w-4 text-primary" />}
              />
            </Link>
            <Link href="/admin/projects">
              <StatCard
                title="GITHUB_IMPORTS"
                value={metrics.githubImportsCount.toLocaleString()}
                icon={<Github className="h-4 w-4 text-primary" />}
              />
            </Link>
            <Link href="/admin/builds">
              <StatCard
                title="BUILDS"
                value={metrics.buildJobsCount.toLocaleString()}
                icon={<Hammer className="h-4 w-4 text-primary" />}
              />
            </Link>
            <Link href="/admin/deployments">
              <StatCard
                title="DEPLOYMENTS"
                value={metrics.deploymentsCount.toLocaleString()}
                icon={<Rocket className="h-4 w-4 text-primary" />}
              />
            </Link>
            <Link href="/admin/compliance">
              <StatCard
                title="HEALTHCARE_PRJ"
                value={metrics.healthcareProjectsCount.toLocaleString()}
                icon={<HeartPulse className="h-4 w-4 text-primary" />}
              />
            </Link>
            <Link href="/admin/compliance">
              <StatCard
                title="BAA_PENDING"
                value={metrics.baaPendingCount.toLocaleString()}
                icon={<FileWarning className="h-4 w-4 text-primary" />}
              />
            </Link>
            <Link href="/admin/compliance">
              <StatCard
                title="PHI_MODE_ON"
                value={metrics.phiModeEnabledCount.toLocaleString()}
                icon={<ShieldCheck className="h-4 w-4 text-primary" />}
              />
            </Link>
            <Link href="/admin/github">
              <StatCard
                title="GITHUB_REPOS"
                value="VIEW"
                icon={<Github className="h-4 w-4 text-primary" />}
              />
            </Link>
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-bold font-mono border-b border-border/20 pb-2 flex items-center justify-between">
              <span>RECENT_ORDERS</span>
              <Link href="/admin/orders">
                <span className="text-xs font-mono text-primary hover:underline cursor-pointer">
                  view all →
                </span>
              </Link>
            </h2>
            <div className="glass rounded-2xl overflow-hidden">
              {metrics.recentOrders.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground font-mono text-sm">
                  NO_ORDERS
                </div>
              ) : (
                <div className="divide-y divide-border/10">
                  {metrics.recentOrders.map((o) => (
                    <div
                      key={o.id}
                      className="p-4 flex items-center justify-between hover:bg-muted/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Package className="h-4 w-4 text-primary" />
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs uppercase glass-subtle px-2 py-0.5 rounded">
                              {o.kind}
                            </span>
                            <span className="font-mono text-xs uppercase text-muted-foreground">
                              {o.status}
                            </span>
                          </div>
                          <span className="text-xs font-mono text-muted-foreground">
                            {o.email ?? o.company ?? `#${o.id}`}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-mono text-sm">
                          ${(o.amountCents / 100).toLocaleString()}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">
                          {format(new Date(o.createdAt), "MMM d, HH:mm")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-bold font-mono border-b border-border/20 pb-2 flex items-center justify-between">
              <span>SYSTEM_LOG</span>
              <Link href="/admin/audit">
                <span className="text-xs font-mono text-primary hover:underline cursor-pointer">
                  view all →
                </span>
              </Link>
            </h2>
            <div className="glass rounded-2xl overflow-hidden">
              {metrics.recentAuditEvents.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground font-mono text-sm">
                  NO_ACTIVITY
                </div>
              ) : (
                <div className="divide-y divide-border/10">
                  {metrics.recentAuditEvents.map((e) => (
                    <div
                      key={e.id}
                      className="p-4 flex items-center justify-between hover:bg-muted/10 transition-colors"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-primary glass-subtle px-2 py-0.5 rounded uppercase">
                            {e.category}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {e.action}
                          </span>
                          {e.targetType && (
                            <span className="font-mono text-xs text-muted-foreground">
                              {e.targetType}#{e.targetId}
                            </span>
                          )}
                        </div>
                        {e.actorEmail && (
                          <span className="text-xs font-mono text-muted-foreground">
                            {e.actorEmail}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">
                        {format(new Date(e.createdAt), "MMM d, HH:mm")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="glass p-5 rounded-2xl flex flex-col justify-between cursor-pointer hover:bg-muted/10 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-mono text-muted-foreground font-bold">
          {title}
        </span>
        {icon}
      </div>
      <div className="text-2xl font-mono font-bold text-foreground truncate">
        {value}
      </div>
    </div>
  );
}
