import { useState, type FormEvent } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { Settings, ShieldAlert, KeyRound, LogOut, Loader2, CheckCircle2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export default function SettingsPage() {
  const { data: me } = useGetMe();
  const { signOut } = useAuth();
  const [, setLocation] = useLocation();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirm &&
    !isSubmitting;

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not update password.");
        return;
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setLocation("/sign-in");
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-3xl mx-auto w-full gap-8 overflow-y-auto">
      <div className="flex flex-col gap-2 shrink-0">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          SETTINGS
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          Manage your Machinedog.Dev identity and security.
        </p>
      </div>

      {me?.isAdmin && (
        <div className="glass-subtle rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-primary" />
            <div>
              <div className="font-mono font-bold text-primary text-sm">ADMIN_PRIVILEGES_ACTIVE</div>
              <div className="text-xs text-muted-foreground font-mono">
                You have access to the Machinedog.Dev management console.
              </div>
            </div>
          </div>
          <Link href="/admin">
            <Button size="sm" className="font-mono bg-primary/20 text-primary hover:bg-primary/30 border-0 shadow-none">
              OPEN_ADMIN
            </Button>
          </Link>
        </div>
      )}

      <section className="glass-strong rounded-2xl p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-foreground">
            Account
          </h2>
          <p className="text-xs text-muted-foreground font-mono">
            Signed in as <span className="text-foreground">{me?.email}</span>
          </p>
        </div>
        <div className="flex">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="font-mono"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </section>

      <section className="glass-strong rounded-2xl p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-foreground">
            Change password
          </h2>
        </div>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-4 max-w-md">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
              Current password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-md px-3 py-2 text-sm bg-muted/30 border border-border/40 text-foreground outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
              New password (min 8 chars)
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-md px-3 py-2 text-sm bg-muted/30 border border-border/40 text-foreground outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
              Confirm new password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-md px-3 py-2 text-sm bg-muted/30 border border-border/40 text-foreground outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {error && (
            <div className="rounded-md px-3 py-2 text-xs text-rose-100 bg-rose-500/10 border border-rose-500/30">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md px-3 py-2 text-xs text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Password updated.
            </div>
          )}

          <div>
            <Button
              type="submit"
              disabled={!canSubmit}
              size="sm"
              className="font-mono"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
