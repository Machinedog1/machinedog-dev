import { useState } from "react";
import { useListClients, useInviteClient, useAdjustClientBalance } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Plus, ShieldAlert, Coins } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { getListClientsQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function AdminClients() {
  const { data, isLoading } = useListClients();
  const inviteClient = useInviteClient();
  const adjustBalance = useAdjustClientBalance();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  
  const [adjustOpen, setAdjustOpen] = useState<number | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    inviteClient.mutate(
      { data: { email } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
          setInviteOpen(false);
          setEmail("");
          toast({ title: "Client Invited", description: "Access granted for " + email });
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Error", description: err?.error || "Failed to invite" });
        }
      }
    );
  };

  const handleAdjust = (e: React.FormEvent, clientId: number) => {
    e.preventDefault();
    const parsedDelta = parseInt(delta);
    if (isNaN(parsedDelta)) return;

    adjustBalance.mutate(
      { id: clientId, data: { delta: parsedDelta, reason } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
          setAdjustOpen(null);
          setDelta("");
          setReason("");
          toast({ title: "Balance Adjusted", description: `${parsedDelta > 0 ? '+' : ''}${parsedDelta} TKNS` });
        }
      }
    );
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-6xl mx-auto w-full gap-6">
      <div className="flex justify-between items-start gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            CLIENT_ROSTER
          </h1>
        </div>

        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Plus className="h-4 w-4 mr-2" /> INVITE_CLIENT
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="font-mono flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> GRANT_ACCESS
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-xs font-mono font-bold text-muted-foreground">EMAIL ADDRESS</label>
                <Input 
                  type="email"
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="founder@startup.com"
                  className="font-mono"
                />
              </div>
              <Button type="submit" className="w-full font-mono bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20" disabled={inviteClient.isPending || !email.trim()}>
                {inviteClient.isPending ? "PROCESSING..." : "INVITE"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="glass rounded-2xl overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="grid grid-cols-6 text-xs font-mono text-muted-foreground p-4 border-b border-border/20 glass-subtle uppercase shrink-0">
          <div className="col-span-2">Client</div>
          <div>Status</div>
          <div>Balance</div>
          <div>Lifetime</div>
          <div className="text-right">Actions</div>
        </div>
        
        <div className="divide-y divide-border/10 overflow-y-auto flex-1">
          {isLoading ? (
            [1, 2, 3].map(i => <div key={i} className="p-4"><Skeleton className="h-6 w-full glass" /></div>)
          ) : !data?.data?.length ? (
            <div className="p-8 text-center text-muted-foreground font-mono text-sm">NO_CLIENTS</div>
          ) : (
            data.data.map(client => (
              <div key={client.id} className="grid grid-cols-6 text-sm items-center p-4 hover:bg-muted/10 transition-colors">
                <div className="col-span-2 flex flex-col">
                  <span className="font-mono font-bold flex items-center gap-2 text-foreground">
                    {client.email}
                    {client.isAdmin && <ShieldAlert className="h-3 w-3 text-primary" />}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">ID: {client.id}</span>
                </div>
                <div>
                  <span className={`text-xs font-mono px-2 py-0.5 rounded uppercase glass-subtle ${
                    client.status === 'active' ? 'text-primary ring-primary/30' : 
                    client.status === 'invited' ? 'text-yellow-500 ring-yellow-500/30' : 
                    'text-destructive ring-destructive/30'
                  }`}>
                    {client.status}
                  </span>
                </div>
                <div className="font-mono font-bold text-foreground">
                  {client.tokenBalance.toLocaleString()}
                </div>
                <div className="font-mono text-muted-foreground">
                  {client.totalTokensUsed.toLocaleString()}
                </div>
                <div className="flex justify-end">
                  <Dialog open={adjustOpen === client.id} onOpenChange={(v) => setAdjustOpen(v ? client.id : null)}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="font-mono text-xs h-8 glass-subtle text-foreground hover:bg-muted/50 border-0 shadow-none">
                        <Coins className="h-3 w-3 mr-1" /> ADJUST
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle className="font-mono flex items-center gap-2">
                          <Coins className="h-5 w-5 text-primary" /> ADJUST_BALANCE
                        </DialogTitle>
                      </DialogHeader>
                      <div className="text-sm font-mono text-muted-foreground mb-4">
                        Target: {client.email}
                      </div>
                      <form onSubmit={(e) => handleAdjust(e, client.id)} className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-xs font-mono font-bold text-muted-foreground">DELTA (e.g. 5000 or -1000)</label>
                          <Input 
                            type="number"
                            value={delta} 
                            onChange={(e) => setDelta(e.target.value)} 
                            className="font-mono"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-mono font-bold text-muted-foreground">REASON (optional)</label>
                          <Input 
                            value={reason} 
                            onChange={(e) => setReason(e.target.value)} 
                            className="font-mono"
                            placeholder="e.g. Courtesy refill"
                          />
                        </div>
                        <Button type="submit" className="w-full font-mono bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20" disabled={adjustBalance.isPending || !delta}>
                          {adjustBalance.isPending ? "PROCESSING..." : "CONFIRM"}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
