import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import {
  Terminal,
  History,
  Coins,
  CreditCard,
  Briefcase,
  FolderGit2,
  LayoutTemplate,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";
import { Logo } from "@/components/Logo";
import { ActiveBuildProvider } from "@/components/ActiveBuildContext";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { data: me } = useGetMe();
  const { signOut } = useAuth();
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("md.sidebarCollapsed") === "1";
  });
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("md.sidebarCollapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);

  const handleSignOut = async () => {
    await signOut();
    setLocation("/sign-in");
  };

  const navItems = [
    { href: "/", label: "Console", icon: Terminal },
    { href: "/projects", label: "Projects", icon: FolderGit2 },
    { href: "/templates", label: "Templates", icon: LayoutTemplate },
    { href: "/history", label: "History", icon: History },
    { href: "/tokens", label: "Tokens", icon: Coins },
    { href: "/billing", label: "Billing", icon: CreditCard },
    { href: "/consulting", label: "Consulting", icon: Briefcase },
    { href: "/compliance", label: "Compliance", icon: ShieldCheck },
  ];

  const adminItems = [
    { href: "/admin", label: "Dashboard", icon: ShieldAlert },
    { href: "/admin/organizations", label: "Organizations", icon: ShieldAlert },
    { href: "/admin/users", label: "Users", icon: ShieldAlert },
    { href: "/admin/projects", label: "All Projects", icon: ShieldAlert },
    { href: "/admin/orders", label: "Orders", icon: ShieldAlert },
    { href: "/admin/leads", label: "Leads", icon: ShieldAlert },
    { href: "/admin/builds", label: "Builds", icon: ShieldAlert },
    { href: "/admin/deployments", label: "Deployments", icon: ShieldAlert },
    { href: "/admin/tokens", label: "Tokens", icon: ShieldAlert },
    { href: "/admin/compliance", label: "Compliance", icon: ShieldAlert },
    { href: "/admin/github", label: "GitHub", icon: ShieldAlert },
    { href: "/admin/audit", label: "Audit", icon: ShieldAlert },
    { href: "/admin/ai-models", label: "AI Models", icon: ShieldAlert },
  ];

  const initial = me?.email ? me.email.charAt(0).toUpperCase() : "?";

  return (
    <div className="flex h-screen bg-transparent overflow-hidden text-foreground selection:bg-primary/30 selection:text-primary-foreground font-sans relative">
      <div className="bg-mesh" />
      <div className="bg-grid" />

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 border-b border-border/20 glass z-50 flex items-center justify-between px-4">
        <Logo size="sm" />
        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} className="p-2 text-muted-foreground hover:text-foreground">
            {theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 -mr-2 text-muted-foreground hover:text-foreground"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed md:static inset-y-0 left-0 z-40 border-r border-border/20 glass flex flex-col transition-[width,transform] duration-300 ease-in-out md:translate-x-0",
          collapsed ? "md:w-16 w-64" : "w-64",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className={cn(
          "h-14 items-center border-b border-border/20 hidden md:flex",
          collapsed ? "justify-center px-2" : "justify-between px-6",
        )}>
          {!collapsed && <Logo size="sm" />}
          <div className="flex items-center gap-1">
            {!collapsed && (
              <button
                onClick={toggleTheme}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
                title={theme === "dark" ? "Light mode" : "Dark mode"}
              >
                {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              data-testid="button-toggle-sidebar"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className={cn(
          "flex-1 overflow-y-auto py-6 flex flex-col gap-8",
          collapsed ? "md:px-2" : "px-4",
        )}>
          {me && (
            collapsed ? (
              <Link href="/tokens">
                <div
                  className="hidden md:flex items-center justify-center h-10 w-10 mx-auto rounded-full glass-subtle border border-border/20 cursor-pointer hover:bg-muted/10 transition-colors relative overflow-hidden"
                  title={`${me.tokenBalance.toLocaleString()} TKNS · Buy tokens`}
                >
                  <div
                    className="absolute inset-0 bg-primary/10 transition-all duration-500 ease-out"
                    style={{ width: `${Math.min(100, (me.tokenBalance / 50000) * 100)}%` }}
                  />
                  <Coins className="h-4 w-4 text-primary relative z-10" />
                </div>
              </Link>
            ) : (
              <div className="px-2 flex flex-col gap-2">
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Fuel</div>
                <Link href="/tokens">
                  <div className="glass-subtle rounded-full px-3 py-2 flex items-center gap-3 border border-border/20 cursor-pointer hover:bg-muted/10 transition-colors relative overflow-hidden group">
                    <div
                      className="absolute inset-0 bg-primary/10 transition-all duration-500 ease-out"
                      style={{ width: `${Math.min(100, (me.tokenBalance / 50000) * 100)}%` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/20 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]" />
                    <Coins className="h-4 w-4 text-primary relative z-10" />
                    <div className="flex items-baseline gap-1.5 relative z-10 flex-1">
                      <span className="text-lg font-bold font-mono text-foreground tracking-tighter tabular-nums leading-none">
                        {me.tokenBalance.toLocaleString()}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground leading-none">TKNS</span>
                    </div>
                  </div>
                </Link>
                <Link href="/tokens">
                  <button
                    type="button"
                    className="w-full rounded-full px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-white shadow-lg shadow-primary/30 hover:opacity-95 transition-opacity"
                    style={{
                      background:
                        "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
                    }}
                  >
                    Buy tokens
                  </button>
                </Link>
              </div>
            )
          )}

          <nav className="flex flex-col gap-1">
            {!collapsed && (
              <div className="text-xs font-mono text-muted-foreground px-2 mb-2 uppercase tracking-wider">
                Workspace
              </div>
            )}
            {navItems.map((item) => {
              const isActive =
                location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                    collapsed
                      ? "md:justify-center md:px-0 md:py-2.5 px-3 py-2 gap-3"
                      : "gap-3 px-3 py-2",
                    isActive
                      ? "bg-primary/10 text-primary glass-subtle border-primary/20 shadow-sm"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {collapsed ? <span className="md:hidden">{item.label}</span> : item.label}
                </Link>
              );
            })}
          </nav>

          {me?.isAdmin && (
            <nav className="flex flex-col gap-1">
              {!collapsed && (
                <div className="text-xs font-mono text-muted-foreground px-2 mb-2 uppercase tracking-wider">
                  Admin
                </div>
              )}
              {adminItems.map((item) => {
                const isActive =
                  location === item.href || (item.href !== "/admin" && location.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                      collapsed
                        ? "md:justify-center md:px-0 md:py-2.5 px-3 py-2 gap-3"
                        : "gap-3 px-3 py-2",
                      isActive
                        ? "bg-primary/10 text-primary glass-subtle border-primary/20 shadow-sm"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {collapsed ? <span className="md:hidden">{item.label}</span> : item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        <div className={cn(
          "border-t border-border/20 mt-auto glass-subtle",
          collapsed ? "md:p-2 p-4" : "p-4",
        )}>
          <Link
            href="/settings"
            title={collapsed ? "Settings" : undefined}
            className={cn(
              "flex items-center rounded-lg text-sm font-medium transition-all duration-200 mb-3",
              collapsed
                ? "md:justify-center md:px-0 md:py-2.5 px-3 py-2 gap-3"
                : "gap-3 px-3 py-2",
              location.startsWith("/settings")
                ? "bg-primary/10 text-primary glass-subtle border-primary/20 shadow-sm"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent",
            )}
          >
            <Settings className="h-4 w-4 shrink-0" />
            {collapsed ? <span className="md:hidden">Settings</span> : "Settings"}
          </Link>
          {collapsed ? (
            <div className="hidden md:flex flex-col items-center gap-2">
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-mono font-bold text-white ring-1 ring-border/50"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(200 95% 55%) 0%, hsl(254 90% 65%) 100%)",
                }}
                title={me?.email ?? ""}
              >
                {initial}
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-3 py-2">
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-mono font-bold text-white shrink-0 ring-1 ring-border/50"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(200 95% 55%) 0%, hsl(254 90% 65%) 100%)",
                }}
              >
                {initial}
              </div>
              <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                <span className="text-sm font-medium truncate">{me?.email}</span>
                <span className="text-xs text-muted-foreground truncate font-mono opacity-70">
                  {me?.id ? `ID:${me.id}` : ""}
                </span>
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}

          {collapsed && (
            <button
              onClick={toggleTheme}
              className="hidden md:flex w-full justify-center p-1.5 mt-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative pt-14 md:pt-0">
        <ActiveBuildProvider>
          <div className="flex-1 overflow-y-auto">{children}</div>
        </ActiveBuildProvider>
      </main>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/40 backdrop-blur-sm z-30 md:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
