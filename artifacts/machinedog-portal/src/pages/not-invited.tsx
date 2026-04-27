import { Link, useLocation } from "wouter";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export default function NotInvitedPage() {
  const { signOut } = useAuth();
  const [, setLocation] = useLocation();

  const handleSignOut = async () => {
    await signOut();
    setLocation("/sign-in");
  };

  return (
    <div
      className="dark relative min-h-screen w-full overflow-hidden text-white flex flex-col"
      style={{ background: "hsl(220 45% 3%)" }}
    >
      <header className="relative z-10 flex items-center justify-between px-5 sm:px-8 lg:px-12 pt-5 sm:pt-7">
        <Logo size="sm" />
        <Button
          variant="outline"
          size="sm"
          onClick={handleSignOut}
          className="font-mono text-white border-white/20 bg-white/5 hover:bg-white/10"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-5 sm:px-8 lg:px-12 py-10">
        <div
          className="w-full max-w-lg rounded-[28px] p-6 sm:p-8 overflow-hidden text-center"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 100%)",
            border: "1px solid rgba(255,255,255,0.14)",
            backdropFilter: "blur(40px) saturate(180%)",
            WebkitBackdropFilter: "blur(40px) saturate(180%)",
          }}
        >
          <div className="text-[11px] font-mono tracking-[0.24em] uppercase text-primary/90 mb-2">
            Account not active
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-3">
            You're signed in, but not on the invite list
          </h1>
          <p className="text-sm text-white/70 mb-6">
            Machinedog.Dev is invite-only. Your account either hasn't been
            activated yet, or has been suspended. Reach out to your contact at
            Machinedog.Dev or request access below.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/intake">
              <a
                className="inline-flex items-center justify-center gap-2 rounded-[14px] px-5 py-3 text-sm font-semibold tracking-wide text-white shadow-lg transition hover:opacity-95"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(200 95% 55%) 0%, hsl(254 90% 65%) 100%)",
                }}
              >
                Request invite
              </a>
            </Link>
            <Button
              variant="outline"
              onClick={handleSignOut}
              className="font-mono text-white border-white/20 bg-white/5 hover:bg-white/10"
            >
              Sign out
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
