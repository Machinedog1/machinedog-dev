import { useState } from "react";
import {
  useSetProjectHostingCredentials,
  useTestProjectHosting,
  getListProjectSecretsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  projectId: number;
  provider: "vercel" | "render";
  /** Names of required secrets that are still missing on the project. */
  missingSecrets: string[];
  /** Visible heading style: "panel" (publish pane) vs "settings" (compact). */
  variant?: "panel" | "settings";
}

const REQUIRED: Record<"vercel" | "render", string[]> = {
  vercel: ["VERCEL_API_TOKEN", "VERCEL_WEBHOOK_SECRET"],
  render: ["RENDER_API_TOKEN", "RENDER_WEBHOOK_SECRET"],
};

/**
 * Owner-only inline form to paste host API token + webhook signing secret.
 * Used both in the Publish pane (when secrets are missing) and in Project
 * Settings (so admins can configure the host without bouncing to /publish).
 */
export function HostingCredentialsForm({
  projectId,
  provider,
  missingSecrets,
  variant = "panel",
}: Props) {
  const setCreds = useSetProjectHostingCredentials();
  const testConn = useTestProjectHosting();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [apiToken, setApiToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const required = REQUIRED[provider];
  const status =
    missingSecrets.length === 0
      ? `${provider} configured (${required.join(", ")} present)`
      : `Missing: ${missingSecrets.join(", ")}`;

  const handleSave = async () => {
    if (!apiToken && !webhookSecret) return;
    try {
      const res = await setCreds.mutateAsync({
        id: projectId,
        data: {
          provider,
          apiToken: apiToken || undefined,
          webhookSecret: webhookSecret || undefined,
        },
      });
      toast({
        title: "Credentials saved",
        description: `Stored: ${res.storedNames.join(", ")}`,
      });
      setApiToken("");
      setWebhookSecret("");
      qc.invalidateQueries({
        queryKey: getListProjectSecretsQueryKey(projectId),
      });
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleTest = async () => {
    try {
      const r = await testConn.mutateAsync({ id: projectId });
      toast({
        title: r.ok ? "Connection OK" : "Connection failed",
        description: r.message,
        variant: r.ok ? "default" : "destructive",
      });
    } catch (err) {
      toast({
        title: "Test failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const containerClass =
    variant === "panel"
      ? "rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex flex-col gap-2 text-xs font-mono text-amber-300"
      : "rounded-md border border-border/40 bg-background/40 p-3 flex flex-col gap-2 text-xs font-mono text-muted-foreground";

  return (
    <div className={containerClass} data-testid={`hosting-creds-${variant}`}>
      <p>
        {variant === "panel" ? "Connect" : "Host credentials"} {provider}: paste the API token and
        webhook signing secret. They'll be encrypted and stored as project secrets (
        {required.join(", ")}).
      </p>
      <p className="text-[10px] uppercase tracking-[0.16em]">{status}</p>
      <input
        type="password"
        placeholder={`${provider.toUpperCase()} API token`}
        value={apiToken}
        onChange={(e) => setApiToken(e.target.value)}
        className="rounded-md border border-border/40 bg-background px-2 py-1.5 text-xs font-mono text-foreground"
        data-testid={`input-host-api-token-${variant}`}
      />
      <input
        type="password"
        placeholder={`${provider.toUpperCase()} webhook signing secret`}
        value={webhookSecret}
        onChange={(e) => setWebhookSecret(e.target.value)}
        className="rounded-md border border-border/40 bg-background px-2 py-1.5 text-xs font-mono text-foreground"
        data-testid={`input-host-webhook-secret-${variant}`}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={setCreds.isPending || (!apiToken && !webhookSecret)}
          data-testid={`button-save-host-credentials-${variant}`}
        >
          {setCreds.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
          Save credentials
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleTest}
          disabled={testConn.isPending}
          data-testid={`button-test-host-${variant}`}
        >
          {testConn.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
          Test connection
        </Button>
      </div>
    </div>
  );
}
