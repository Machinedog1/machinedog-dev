import { ClerkProvider, ClerkLoaded, RedirectToSignIn, useUser } from "@clerk/react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { dark } from "@clerk/themes";
import NotFound from "@/pages/not-found";

import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import NotInvitedPage from "@/pages/not-invited";
import PricingPage from "@/pages/pricing";
import ThankYouPage from "@/pages/thank-you";
import IntakePage from "@/pages/intake";
import PromptConsole from "@/pages/index";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import HistoryPage from "@/pages/history";
import TokensPage from "@/pages/tokens";
import ProjectsPage from "@/pages/projects";
import ProjectDetailPage from "@/pages/project-detail";
import WorkPage from "@/pages/work";
import ConsultingPage from "@/pages/consulting";
import AdminDashboard from "@/pages/admin/index";
import AdminClients from "@/pages/admin/clients";
import AdminProjects from "@/pages/admin/projects";
import AdminOrders from "@/pages/admin/orders";
import SettingsPage from "@/pages/settings";

import { useGetMe, useListMyProjects, getListMyProjectsQueryKey } from "@workspace/api-client-react";
import { useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Loader2 } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

const queryClient = new QueryClient();

function SignedIn({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useUser();
  return isSignedIn ? <>{children}</> : null;
}

function SignedOut({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useUser();
  return isLoaded && !isSignedIn ? <>{children}</> : null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading, error } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const [location, setLocation] = useLocation();

  const { data: myProjects } = useListMyProjects({
    query: {
      queryKey: getListMyProjectsQueryKey(),
      enabled: !!me && !me.isAdmin && location === "/",
      retry: false,
    },
  });

  useEffect(() => {
    if (!me || me.isAdmin) return;
    if (location !== "/") return;
    const list = myProjects?.data ?? [];
    if (list.length === 1 && list[0]?.viewerRole === "collaborator") {
      setLocation(`/projects/${list[0].id}`);
    }
  }, [me, myProjects, location, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center text-foreground relative">
        <div className="bg-mesh" />
        <div className="bg-grid" />
        <div className="glass p-8 flex flex-col items-center justify-center rounded-2xl">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground font-mono">INITIALIZING_WORKSPACE...</p>
        </div>
      </div>
    );
  }

  if (error || !me) {
    if (location !== "/not-invited") {
      setLocation("/not-invited");
    }
    return null;
  }

  return <AppLayout>{children}</AppLayout>;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const [location, setLocation] = useLocation();

  if (me && !me.isAdmin) {
    setLocation("/");
    return null;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />
      <Route path="/not-invited" component={NotInvitedPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/thank-you" component={ThankYouPage} />
      <Route path="/intake" component={IntakePage} />
      <Route path="/work" component={WorkPage} />

      <Route path="/">
        <AuthGuard><PromptConsole /></AuthGuard>
      </Route>
      <Route path="/history">
        <AuthGuard><HistoryPage /></AuthGuard>
      </Route>
      <Route path="/tokens">
        <AuthGuard><TokensPage /></AuthGuard>
      </Route>
      <Route path="/projects">
        <AuthGuard><ProjectsPage /></AuthGuard>
      </Route>
      <Route path="/projects/:id">
        <AuthGuard><ProjectDetailPage /></AuthGuard>
      </Route>
      <Route path="/consulting">
        <AuthGuard><ConsultingPage /></AuthGuard>
      </Route>
      <Route path="/settings">
        <AuthGuard><SettingsPage /></AuthGuard>
      </Route>

      <Route path="/admin">
        <AuthGuard><AdminGuard><AdminDashboard /></AdminGuard></AuthGuard>
      </Route>
      <Route path="/admin/clients">
        <AuthGuard><AdminGuard><AdminClients /></AdminGuard></AuthGuard>
      </Route>
      <Route path="/admin/projects">
        <AuthGuard><AdminGuard><AdminProjects /></AdminGuard></AuthGuard>
      </Route>
      <Route path="/admin/orders">
        <AuthGuard><AdminGuard><AdminOrders /></AdminGuard></AuthGuard>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function App() {
  const { theme } = useTheme();

  if (!clerkPubKey) {
    return <div className="p-8 text-destructive">Missing VITE_CLERK_PUBLISHABLE_KEY</div>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ClerkProvider
            publishableKey={clerkPubKey}
            appearance={{
              baseTheme: theme === "dark" ? dark : undefined,
              variables: {
                colorPrimary: "#3FB1F0",
                colorBackground: "transparent",
                colorInput: theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                colorInputForeground: theme === "dark" ? "#FFFFFF" : "#000000",
                colorForeground: theme === "dark" ? "#E2EAF2" : "#1A2636",
                fontFamily: "'Inter', sans-serif",
                borderRadius: "0.875rem",
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
                footerActionLink: "text-primary hover:text-primary/80",
                identityPreviewText: "text-foreground",
                identityPreviewEditButtonIcon: "text-muted-foreground hover:text-foreground",
              },
            }}
          >
            <ClerkLoaded>
              <SignedIn>
                <Router />
              </SignedIn>
              <SignedOut>
                <Switch>
                  <Route path="/sign-up" component={SignUpPage} />
                  <Route path="/pricing" component={PricingPage} />
                  <Route path="/thank-you" component={ThankYouPage} />
                  <Route path="/intake" component={IntakePage} />
                  <Route path="/work" component={WorkPage} />
                  <Route path="*" component={SignInPage} />
                </Switch>
              </SignedOut>
            </ClerkLoaded>
          </ClerkProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

// Keep a reference so unused-import lint stays quiet for the redirect helper.
void RedirectToSignIn;

export default App;
