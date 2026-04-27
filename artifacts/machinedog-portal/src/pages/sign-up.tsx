import { SignUp } from "@clerk/react";
import { Terminal } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { dark } from "@clerk/themes";

export default function SignUpPage() {
  const { theme } = useTheme();

  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-4 relative">
      <div className="bg-mesh" />
      <div className="bg-grid" />
      <div className="mb-8 flex items-center gap-3 font-mono font-bold tracking-tight text-2xl z-10 text-foreground">
        <Terminal className="h-8 w-8 text-primary" />
        <span>MACHINEDOG.DEV</span>
      </div>
      <div className="w-full max-w-md z-10">
        <SignUp 
          routing="path" 
          path="/sign-up" 
          signInUrl="/sign-in" 
          fallbackRedirectUrl="/"
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
              cardBox: "glass-strong border-0 shadow-xl",
              card: "bg-transparent shadow-none",
              headerTitle: "font-mono font-bold text-foreground",
              headerSubtitle: "font-mono text-muted-foreground",
              socialButtonsBlockButton: "glass-subtle border-0 text-foreground hover:bg-muted/50",
              formFieldLabel: "font-mono text-xs font-bold text-muted-foreground",
              formFieldInput: "glass-input border-0 focus:ring-primary",
              footerActionText: "text-muted-foreground",
              footerActionLink: "text-primary hover:text-primary/80"
            }
          }}
        />
      </div>
    </div>
  );
}
