/**
 * Phase 4 — Admin AI registry page. Lists providers + models, lets the
 * operator toggle enabled, set defaults per category, edit cost multipliers,
 * test a provider, and review usage.
 */
import { useMemo, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Loader2,
  Check,
  Power,
  PlugZap,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface Provider {
  id: number;
  slug: string;
  name: string;
  enabled: boolean;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsLongContext: boolean;
  supportsHealthcare: boolean;
  requiresBaaForPhi: boolean;
  notes: string | null;
}

interface Model {
  id: number;
  providerId: number;
  providerSlug: string;
  providerName: string;
  providerEnabled: boolean;
  modelKey: string;
  name: string;
  category: string;
  enabled: boolean;
  defaultForCategory: boolean;
  inputCostPerKToken: number;
  outputCostPerKToken: number;
  costMultiplierBp: number;
  contextWindow: number;
  supportsPhi: boolean;
  requiresHealthcarePlan: boolean;
  requiresSignedBaa: boolean;
  notes: string | null;
}

interface UsageRow {
  providerSlug: string;
  modelKey: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  blocked: number;
}

interface UsageResponse {
  aggregate: UsageRow[];
  byCategory: Record<
    string,
    { calls: number; cost: number; blocked: number }
  >;
  recent: Array<{
    id: number;
    providerSlug: string;
    modelKey: string;
    category: string;
    inputTokens: number;
    outputTokens: number;
    tokenCost: number;
    status: string;
    blockedForPhi: boolean;
    blockedForHealthcareGating: boolean;
    mocked: boolean;
    createdAt: string;
  }>;
}

export default function AdminAiModelsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const providersQuery = useQuery({
    queryKey: ["admin-ai-providers"],
    queryFn: async () =>
      await customFetch<{ data: Provider[]; hasEnabledProviders: boolean }>(
        "/api/admin/ai/providers",
      ),
  });
  const modelsQuery = useQuery({
    queryKey: ["admin-ai-models"],
    queryFn: async () =>
      await customFetch<{ data: Model[] }>("/api/admin/ai/models"),
  });
  const usageQuery = useQuery({
    queryKey: ["admin-ai-usage"],
    queryFn: async () =>
      await customFetch<UsageResponse>("/api/admin/ai/usage"),
  });

  const patchProviderMut = useMutation({
    mutationFn: async (vars: { id: number; patch: Record<string, unknown> }) =>
      await customFetch<Provider>(`/api/admin/ai/providers/${vars.id}`, {
        method: "PATCH",
        body: JSON.stringify(vars.patch),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin-ai-providers"] }),
    onError: (err: Error) =>
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      }),
  });

  const patchModelMut = useMutation({
    mutationFn: async (vars: { id: number; patch: Record<string, unknown> }) =>
      await customFetch<Model>(`/api/admin/ai/models/${vars.id}`, {
        method: "PATCH",
        body: JSON.stringify(vars.patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ai-models"] });
    },
    onError: (err: Error) =>
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      }),
  });

  const testModelMut = useMutation({
    mutationFn: async (id: number) =>
      await customFetch<{ ok: boolean; latencyMs: number; message: string }>(
        `/api/admin/ai/models/${id}/test`,
        { method: "POST" },
      ),
    onSuccess: (data) => {
      toast({
        title: data.ok ? `OK (${data.latencyMs}ms)` : "Test failed",
        description: data.message,
        variant: data.ok ? "default" : "destructive",
      });
    },
  });

  const providers = providersQuery.data?.data ?? [];
  const models = modelsQuery.data?.data ?? [];
  const usage = usageQuery.data;

  const modelsByCategory = useMemo(() => {
    const m = new Map<string, Model[]>();
    for (const r of models) {
      const arr = m.get(r.category) ?? [];
      arr.push(r);
      m.set(r.category, arr);
    }
    return m;
  }, [models]);

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full gap-6 overflow-y-auto">
      <div className="flex flex-col gap-2 shrink-0">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          AI_REGISTRY
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          Manage AI providers, models, defaults per lane, multipliers, and
          healthcare flags.
          {providersQuery.data?.hasEnabledProviders === false ? (
            <span className="ml-2 px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40">
              Mock mode (no enabled providers)
            </span>
          ) : null}
        </p>
      </div>

      {/* Providers */}
      <section className="glass rounded-2xl p-4 ring-1 ring-border/30">
        <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-3">
          Providers
        </h2>
        {providersQuery.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {providers.map((p) => (
              <div
                key={p.id}
                className="rounded-lg ring-1 ring-border/30 p-3 bg-background/40"
                data-testid={`provider-card-${p.slug}`}
              >
                <div className="flex items-center gap-2">
                  <div className="font-mono text-sm">{p.name}</div>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {p.slug}
                  </span>
                  <button
                    onClick={() =>
                      patchProviderMut.mutate({
                        id: p.id,
                        patch: { enabled: !p.enabled },
                      })
                    }
                    className={`ml-auto px-2 py-0.5 rounded text-[10px] font-mono ring-1 transition flex items-center gap-1 ${
                      p.enabled
                        ? "bg-green-500/20 ring-green-500/40 text-green-300"
                        : "bg-muted/40 ring-border/30 text-muted-foreground"
                    }`}
                    data-testid={`button-provider-toggle-${p.slug}`}
                  >
                    <Power className="h-3 w-3" />
                    {p.enabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-mono text-muted-foreground">
                  {p.supportsHealthcare ? <Tag>healthcare</Tag> : null}
                  {p.supportsLongContext ? <Tag>long-ctx</Tag> : null}
                  {p.supportsVision ? <Tag>vision</Tag> : null}
                  {p.supportsTools ? <Tag>tools</Tag> : null}
                  {p.requiresBaaForPhi ? <Tag>requires BAA</Tag> : null}
                </div>
                {p.notes ? (
                  <div className="mt-2 text-[11px] font-mono text-muted-foreground/80">
                    {p.notes}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Models grouped by category */}
      <section className="glass rounded-2xl p-4 ring-1 ring-border/30">
        <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-3">
          Models by lane
        </h2>
        {modelsQuery.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-4">
            {Array.from(modelsByCategory.entries()).map(([cat, list]) => (
              <div key={cat}>
                <div className="text-xs font-mono uppercase tracking-wider text-foreground/80 mb-2">
                  {cat}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border/30">
                        <th className="text-left py-1.5 pr-2">Model</th>
                        <th className="text-left py-1.5 pr-2">Provider</th>
                        <th className="text-right py-1.5 pr-2">In/K</th>
                        <th className="text-right py-1.5 pr-2">Out/K</th>
                        <th className="text-right py-1.5 pr-2">Mult bp</th>
                        <th className="text-center py-1.5 pr-2">PHI</th>
                        <th className="text-center py-1.5 pr-2">Default</th>
                        <th className="text-center py-1.5 pr-2">Enabled</th>
                        <th className="text-right py-1.5">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((m) => (
                        <ModelRow
                          key={m.id}
                          model={m}
                          onPatch={(patch) =>
                            patchModelMut.mutate({ id: m.id, patch })
                          }
                          onTest={() => testModelMut.mutate(m.id)}
                          testing={testModelMut.isPending}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Usage */}
      <section className="glass rounded-2xl p-4 ring-1 ring-border/30">
        <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-3">
          Usage
        </h2>
        {usageQuery.isLoading || !usage ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-mono uppercase text-muted-foreground mb-2">
                By category (recent 50)
              </div>
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/30">
                    <th className="text-left py-1.5">Category</th>
                    <th className="text-right py-1.5">Calls</th>
                    <th className="text-right py-1.5">Tokens</th>
                    <th className="text-right py-1.5">Blocked</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(usage.byCategory).map(([cat, b]) => (
                    <tr key={cat} className="border-b border-border/20">
                      <td className="py-1">{cat}</td>
                      <td className="text-right">{b.calls}</td>
                      <td className="text-right">{b.cost}</td>
                      <td className="text-right">{b.blocked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div className="text-xs font-mono uppercase text-muted-foreground mb-2">
                By provider/model (all-time)
              </div>
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/30">
                    <th className="text-left py-1.5">Provider</th>
                    <th className="text-left py-1.5">Model</th>
                    <th className="text-right py-1.5">Calls</th>
                    <th className="text-right py-1.5">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.aggregate.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-2 text-center text-muted-foreground"
                      >
                        No usage yet.
                      </td>
                    </tr>
                  ) : null}
                  {usage.aggregate.map((r) => (
                    <tr
                      key={`${r.providerSlug}/${r.modelKey}`}
                      className="border-b border-border/20"
                    >
                      <td className="py-1">{r.providerSlug}</td>
                      <td>{r.modelKey}</td>
                      <td className="text-right">{r.totalCalls}</td>
                      <td className="text-right">{r.totalCost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-1.5 py-0.5 rounded bg-muted/40 ring-1 ring-border/30">
      {children}
    </span>
  );
}

function ModelRow({
  model,
  onPatch,
  onTest,
  testing,
}: {
  model: Model;
  onPatch: (patch: Record<string, unknown>) => void;
  onTest: () => void;
  testing: boolean;
}) {
  const [inCost, setInCost] = useState(String(model.inputCostPerKToken));
  const [outCost, setOutCost] = useState(String(model.outputCostPerKToken));
  const [mult, setMult] = useState(String(model.costMultiplierBp));
  const dirty =
    inCost !== String(model.inputCostPerKToken) ||
    outCost !== String(model.outputCostPerKToken) ||
    mult !== String(model.costMultiplierBp);
  return (
    <tr
      className="border-b border-border/20 hover:bg-muted/20"
      data-testid={`model-row-${model.id}`}
    >
      <td className="py-1.5 pr-2">
        <div className="text-foreground/90">{model.name}</div>
        <div className="text-[10px] text-muted-foreground">{model.modelKey}</div>
      </td>
      <td className="pr-2">{model.providerSlug}</td>
      <td className="pr-2">
        <Input
          type="number"
          value={inCost}
          onChange={(e) => setInCost(e.target.value)}
          className="h-6 w-16 text-right text-xs font-mono"
        />
      </td>
      <td className="pr-2">
        <Input
          type="number"
          value={outCost}
          onChange={(e) => setOutCost(e.target.value)}
          className="h-6 w-16 text-right text-xs font-mono"
        />
      </td>
      <td className="pr-2">
        <Input
          type="number"
          value={mult}
          onChange={(e) => setMult(e.target.value)}
          className="h-6 w-16 text-right text-xs font-mono"
        />
      </td>
      <td className="text-center pr-2">
        <button
          onClick={() =>
            onPatch({ supportsPhi: !model.supportsPhi })
          }
          className={`px-1.5 py-0.5 rounded text-[10px] ${
            model.supportsPhi
              ? "bg-cyan-500/20 text-cyan-300"
              : "text-muted-foreground"
          }`}
          data-testid={`toggle-phi-${model.id}`}
        >
          {model.supportsPhi ? "PHI" : "—"}
        </button>
      </td>
      <td className="text-center pr-2">
        <button
          onClick={() => {
            // Radio-style: only ALLOW promoting a model to default. To
            // change the default for a category, pick a different model
            // and click "set" — the backend demotes the previous default
            // automatically. This prevents accidentally leaving a
            // category with no default.
            if (model.defaultForCategory) return;
            onPatch({ defaultForCategory: true });
          }}
          disabled={model.defaultForCategory}
          title={
            model.defaultForCategory
              ? "Default for this category. Set another model to change."
              : "Make this the default for the category"
          }
          className={`px-1.5 py-0.5 rounded text-[10px] ${
            model.defaultForCategory
              ? "bg-primary/20 text-primary-foreground cursor-default"
              : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid={`toggle-default-${model.id}`}
        >
          {model.defaultForCategory ? "DEFAULT" : "set"}
        </button>
      </td>
      <td className="text-center pr-2">
        <button
          onClick={() => onPatch({ enabled: !model.enabled })}
          className={`px-1.5 py-0.5 rounded text-[10px] ring-1 ${
            model.enabled
              ? "bg-green-500/20 ring-green-500/40 text-green-300"
              : "bg-muted/40 ring-border/30 text-muted-foreground"
          }`}
          data-testid={`toggle-model-enabled-${model.id}`}
        >
          {model.enabled ? "on" : "off"}
        </button>
      </td>
      <td className="text-right">
        <div className="flex items-center gap-1 justify-end">
          {dirty ? (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={() =>
                onPatch({
                  inputCostPerKToken: Number(inCost),
                  outputCostPerKToken: Number(outCost),
                  costMultiplierBp: Number(mult),
                })
              }
              data-testid={`button-save-model-${model.id}`}
            >
              <Check className="h-3 w-3 mr-1" /> Save
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={onTest}
            disabled={testing || !model.enabled}
            data-testid={`button-test-model-${model.id}`}
          >
            {testing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <PlugZap className="h-3 w-3 mr-1" />
            )}
            Test
          </Button>
        </div>
      </td>
    </tr>
  );
}
