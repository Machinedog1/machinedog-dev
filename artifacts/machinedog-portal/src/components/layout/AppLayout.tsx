import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { UserButton } from "@clerk/react";
import { 
  Terminal,
  History, 
  Coins, 
  FolderGit2, 
  Briefcase, 
  Settings, 
  ShieldAlert,
  Menu,
  X,
  Sun,
  Moon
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";
import { Logo } from "@/components/Logo";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { data: me } = useGetMe();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  // Close sidebar on mobile when location changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  const navItems = [
    { href: "/", label: "Console", icon: Terminal },
    { href: "/history", label: "History", icon: History },
    { href: "/tokens", label: "Tokens", icon: Coins },
    { href: "/projects", label: "Projects", icon: FolderGit2 },
    { href: "/consulting", label: "Consulting", icon: Briefcase },
  ];

  const adminItems = [
    { href: "/admin", label: "Dashboard", icon: ShieldAlert },
    { href: "/admin/clients", label: "Clients", icon: ShieldAlert },
    { href: "/admin/projects", label: "All Projects", icon: ShieldAlert },
    { href: "/admin/orders", label: "Orders", icon: ShieldAlert },
  ];

  return (
    <div className="flex h-screen bg-transparent overflow-hidden text-foreground selection:bg-primary/30 selection:text-primary-foreground font-sans relative">
      <div className="bg-mesh" />
      <div className="bg-grid" />
      
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 border-b border-border/20 glass z-50 flex items-center justify-between px-4">
        <Logo size="sm" />
        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} className="p-2 text-muted-foreground hover:text-foreground">
            {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 -mr-2 text-muted-foreground hover:text-foreground">
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:static inset-y-0 left-0 z-40 w-64 border-r border-border/20 glass flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-14 flex items-center justify-between px-6 border-b border-border/20 hidden md:flex">
          <Logo size="sm" />
          <button onClick={toggleTheme} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors">
            {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-8">
          {me && (
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
          )}

          <nav className="flex flex-col gap-1">
            <div className="text-xs font-mono text-muted-foreground px-2 mb-2 uppercase tracking-wider">Workspace</div>
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                location === item.href || (item.href !== "/" && location.startsWith(item.href))
                  ? "bg-primary/10 text-primary glass-subtle border-primary/20 shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
              )}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>

          {me?.isAdmin && (
            <nav className="flex flex-col gap-1">
              <div className="text-xs font-mono text-muted-foreground px-2 mb-2 uppercase tracking-wider">Admin</div>
              {adminItems.map((item) => (
                <Link key={item.href} href={item.href} className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                  location === item.href || (item.href !== "/admin" && location.startsWith(item.href))
                    ? "bg-primary/10 text-primary glass-subtle border-primary/20 shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                )}>
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        <div className="p-4 border-t border-border/20 mt-auto glass-subtle">
          <Link href="/settings" className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 mb-4",
            location.startsWith("/settings")
              ? "bg-primary/10 text-primary glass-subtle border-primary/20 shadow-sm"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
          )}>
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <div className="flex items-center gap-3 px-3">
            <UserButton afterSignOutUrl="/sign-in" appearance={{
              elements: {
                userButtonAvatarBox: "h-8 w-8 ring-1 ring-border/50 ring-offset-1 ring-offset-background"
              }
            }} />
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate">{me?.email}</span>
              <span className="text-xs text-muted-foreground truncate font-mono opacity-70">{me?.id ? `ID:${me.id}` : ''}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative pt-14 md:pt-0">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
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
