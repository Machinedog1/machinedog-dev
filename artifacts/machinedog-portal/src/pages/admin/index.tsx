import { useGetAdminStats } from "@workspace/api-client-react";
import { ShieldAlert, Users, Coins, Briefcase, Activity, FolderGit2, Package, Repeat } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function AdminDashboard() {
  const { data: stats, isLoading } = useGetAdminStats();

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-6xl mx-auto w-full gap-8 overflow-y-auto">
      <div className="flex flex-col gap-2 shrink-0">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-primary" />
          SYSTEM_OVERVIEW
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          Machinedog.Dev operations and platform metrics.
        </p>
      </div>

      {isLoading || !stats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="h-28 glass rounded-2xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard 
              title="REVENUE_CENTS" 
              value={`$${(stats.totalRevenueCents / 100).toLocaleString()}`}
              icon={<Briefcase className="h-4 w-4 text-primary" />}
            />
            <StatCard 
              title="ACTIVE_CLIENTS" 
              value={`${stats.activeClients} / ${stats.totalClients}`}
              icon={<Users className="h-4 w-4 text-primary" />}
            />
            <StatCard 
              title="TOKENS_USED" 
              value={stats.totalTokensUsed.toLocaleString()}
              icon={<Activity className="h-4 w-4 text-primary" />}
            />
            <StatCard 
              title="TOKENS_SOLD" 
              value={stats.totalTokensPurchased.toLocaleString()}
              icon={<Coins className="h-4 w-4 text-primary" />}
            />
            <StatCard 
              title="TOTAL_PROMPTS" 
              value={stats.totalPrompts.toLocaleString()}
              icon={<Activity className="h-4 w-4 text-primary" />}
            />
            <StatCard 
              title="ACTIVE_PROJECTS" 
              value={stats.totalProjects.toLocaleString()}
              icon={<FolderGit2 className="h-4 w-4 text-primary" />}
            />
            <StatCard 
              title="CONSULTING_HRS" 
              value={stats.totalConsultingHoursBooked.toString()}
              icon={<Briefcase className="h-4 w-4 text-primary" />}
            />
            <Link href="/admin/orders">
              <div className="cursor-pointer">
                <StatCard
                  title="PAID_BUILDS"
                  value={stats.totalPaidBuilds.toLocaleString()}
                  icon={<Package className="h-4 w-4 text-primary" />}
                />
              </div>
            </Link>
            <Link href="/admin/orders">
              <div className="cursor-pointer">
                <StatCard
                  title="ACTIVE_RETAINERS"
                  value={stats.activeRetainers.toLocaleString()}
                  icon={<Repeat className="h-4 w-4 text-primary" />}
                />
              </div>
            </Link>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-bold font-mono border-b border-border/20 pb-2">SYSTEM_LOG</h2>
            <div className="glass rounded-2xl overflow-hidden">
              {stats.recentActivity.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground font-mono text-sm">NO_ACTIVITY</div>
              ) : (
                <div className="divide-y divide-border/10">
                  {stats.recentActivity.map((activity, i) => (
                    <div key={i} className="p-4 flex items-center justify-between hover:bg-muted/10 transition-colors">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-primary glass-subtle px-2 py-0.5 rounded uppercase">{activity.type}</span>
                          <span className="text-sm text-foreground">{activity.description}</span>
                        </div>
                        {activity.clientEmail && (
                          <span className="text-xs font-mono text-muted-foreground">{activity.clientEmail}</span>
                        )}
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">{format(new Date(activity.createdAt), "MMM d, HH:mm")}</span>
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

function StatCard({ title, value, icon }: { title: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="glass p-5 rounded-2xl flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-mono text-muted-foreground font-bold">{title}</span>
        {icon}
      </div>
      <div className="text-2xl font-mono font-bold text-foreground truncate">{value}</div>
    </div>
  );
}
