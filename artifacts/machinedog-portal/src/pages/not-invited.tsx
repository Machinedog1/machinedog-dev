import { Button } from "@/components/ui/button";
import { SignOutButton } from "@clerk/react";
import { ShieldAlert, Terminal } from "lucide-react";

export default function NotInvitedPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
      <div className="mb-8 flex items-center justify-center gap-3 font-mono font-bold tracking-tight text-2xl opacity-50">
        <Terminal className="h-8 w-8 text-primary" />
        <span>MACHINEDOG</span>
      </div>
      
      <div className="max-w-md w-full bg-card border border-border p-8 rounded-lg shadow-xl flex flex-col items-center">
        <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-6">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" />
        </div>
        
        <h1 className="text-2xl font-bold mb-4 font-mono">ACCESS_DENIED</h1>
        
        <p className="text-muted-foreground mb-8">
          The email address associated with this account has not been approved for access. Machinedog operates on a strictly invite-only basis.
        </p>
        
        <div className="w-full space-y-4">
          <div className="p-4 bg-muted/50 rounded text-sm text-left border border-border font-mono">
            If you recently received an invite, ensure you signed in with the exact email address it was sent to.
          </div>
          
          <SignOutButton>
            <Button variant="outline" className="w-full font-mono">
              SIGN_OUT
            </Button>
          </SignOutButton>
        </div>
      </div>
    </div>
  );
}
