import { useGetMe } from "@workspace/api-client-react";
import { UserProfile } from "@clerk/react";
import { dark } from "@clerk/themes";
import { Settings, ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

export default function SettingsPage() {
  const { data: me } = useGetMe();
  const { theme } = useTheme();

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-5xl mx-auto w-full gap-8 overflow-y-auto">
      <div className="flex flex-col gap-2 shrink-0">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          SETTINGS
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          Manage your Machinedog identity and security.
        </p>
      </div>

      {me?.isAdmin && (
        <div className="glass-subtle rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-primary" />
            <div>
              <div className="font-mono font-bold text-primary text-sm">ADMIN_PRIVILEGES_ACTIVE</div>
              <div className="text-xs text-muted-foreground font-mono">You have access to the Machinedog management console.</div>
            </div>
          </div>
          <Link href="/admin">
            <Button size="sm" className="font-mono bg-primary/20 text-primary hover:bg-primary/30 border-0 shadow-none">
              OPEN_ADMIN
            </Button>
          </Link>
        </div>
      )}

      <div className="flex justify-center w-full">
        <div className="w-full max-w-[800px] glass-strong rounded-2xl p-6 [&>.cl-rootBox]:w-full [&_.cl-card]:w-full [&_.cl-card]:max-w-full [&_.cl-pageScrollBox]:p-0">
          <UserProfile 
            appearance={{
              baseTheme: theme === 'dark' ? dark : undefined,
              variables: {
                colorPrimary: "#FF6600",
                colorBackground: "transparent",
                colorInput: theme === 'dark' ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                colorInputForeground: theme === 'dark' ? "#FFFFFF" : "#000000",
                colorForeground: theme === 'dark' ? "#C3CBD5" : "#1A2636",
                fontFamily: "'Inter', sans-serif",
                borderRadius: "0.75rem",
              },
              elements: {
                cardBox: "border-0 shadow-none bg-transparent",
                card: "bg-transparent shadow-none",
                navbar: "hidden",
                pageScrollBox: "p-0",
                profileSection: "border-b border-border/20",
                headerTitle: "font-mono font-bold text-foreground",
                headerSubtitle: "font-mono text-muted-foreground",
                profileSectionTitleText: "font-mono text-foreground font-bold",
                profileSectionPrimaryButton: "text-primary hover:bg-primary/10",
                formButtonPrimary: "bg-primary text-primary-foreground font-mono font-bold",
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
