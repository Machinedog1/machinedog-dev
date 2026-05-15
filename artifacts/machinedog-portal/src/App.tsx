import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import AcceptInvitePage from "@/pages/accept-invite";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import NotInvitedPage from "@/pages/not-invited";
import PricingPage from "@/pages/pricing";
import ThankYouPage from "@/pages/thank-you";
import IntakePage from "@/pages/intake";
import PromptConsole from "@/pages/index";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import HistoryPage from "@/pages/history";
import TokensPage from "@/pages/tokens";
import BillingPage from "@/pages/billing";
import ProjectsPage from "@/pages/projects";
import ProjectNewPage from "@/pages/project-new";
import TemplatesPage from "@/pages/templates";
import ProjectDetailPage from "@/pages/project-detail";
import ProjectWorkspacePage from "@/pages/project-workspace";
import ProjectPublishPage from "@/pages/project-publish";
import WorkPage from "@/pages/work";
import ConsultingPage from "@/pages/consulting";
import AdminDashboard from "@/pages/admin/index";
import AdminClients from "@/pages/admin/clients";
import AdminProjects from "@/pages/admin/projects";
import AdminOrders from "@/pages/admin/orders";
import AdminAuditPage from "@/pages/admin/audit";
import AdminBuildsPage from "@/pages/admin/builds";
import AdminDeploymentsPage from "@/pages/admin/deployments";
import AdminAiModelsPage from "@/pages/admin/ai-models";
import AdminOrganizationsPage from "@/pages/admin/organizations";
import AdminUsersPage from "@/pages/admin/users";
import AdminTokensPage from "@/pages/admin/tokens";
import AdminCompliancePage from "@/pages/admin/compliance";
import AdminGithubPage from "@/pages/admin/github";
import AdminLeadsPage from "@/pages/admin/leads";
import SettingsPage from "@/pages/settings";

import { useGetMe, useListMyProjects, getListMyProjectsQueryKey } from "@workspace/api-client-react";
import { useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ClerkProviderWrapper } from "@/lib/clerk";
import { DemoAuthBanner } from "@/components/DemoAuthBanner";

const queryClient = new QueryClient();

function LoadingScreen() {
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

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { client: authClient, isLoading: authLoading } = useAuth();
  const [location, setLocation] = useLocation();

  const { data: me, isLoading } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      enabled: !!authClient,
      retry: false,
    },
  });

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

  useEffect(() => {
    if (authLoading) return;
    if (!authClient) {
      setLocation("/sign-in");
    }
  }, [authLoading, authClient, setLocation]);

  if (authLoading || (authClient && isLoading)) return <LoadingScreen />;
  if (!authClient) return null;
  if (!me) {
    if (location !== "/not-invited") setLocation("/not-invited");
    return null;
  }

  return <AppLayout>{children}</AppLayout>;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const [, setLocation] = useLocation();

  if (me && !me.isAdmin) {
    setLocation("/");
    return null;
  }

  return <>{children}</>;
}

function PublicOnlyRoutes() {
  return (
    <Switch>
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />
      <Route path="/accept-invite" component={AcceptInvitePage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/thank-you" component={ThankYouPage} />
      <Route path="/intake" component={IntakePage} />
      <Route path="/work" component={WorkPage} />
      <Route path="*" component={SignInPage} />
    </Switch>
  );
}

function AuthedRoutes() {
  return (
    <Switch>
      {/* Public routes still accessible while signed in */}
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />
      <Route path="/accept-invite" component={AcceptInvitePage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
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
      <Route path="/billing">
        <AuthGuard><BillingPage /></AuthGuard>
      </Route>
      <Route path="/projects">
        <AuthGuard><ProjectsPage /></AuthGuard>
      </Route>
      <Route path="/projects/new">
        <AuthGuard><ProjectNewPage /></AuthGuard>
      </Route>
      <Route path="/templates">
        <AuthGuard><TemplatesPage /></AuthGuard>
      </Route>
      <Route path="/projects/:id/workspace">
        <AuthGuard><ProjectWorkspacePage /></AuthGuard>
      </Route>
      <Route path="/projects/:id/secrets">
        <AuthGuard><ProjectDetailPage /></AuthGuard>
      </Route>
      <Route path="/projects/:id/publish">
        <AuthGuard><ProjectPublishPage /></AuthGuard>
      </Route>
      <Route path="/projects/:id/history">
        <AuthGuard><ProjectDetailPage /></AuthGuard>
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
      <Route path="/admin/ai-models">
        <AuthGuard><AdminGuard><AdminAiModelsPage /></AdminGuard></AuthGuard>
      </Route>
      <Route path="/admin/audit">
        <AuthGuard><AdminGuard><AdminAuditPage /></AdminGuard></AuthGuard>
      </Route>
      <Route path="/admin/orders">
        <AuthGuard><AdminGuard><AdminOrders /></AdminGuard></AuthGuard>
      </Route>
      <Route path="/admin/leads">
        <AuthGuard><AdminGuard><AdminLeadsPage /></AdminGuard></AuthGuard>
      </Route>
      <Route path="/admin/builds">
        <AuthGuard><AdminGuard><AdminBuildsPage /></AdminGuard></AuthGuard>
      </Route>
      <Route path="/admin/deployments">
        <AuthGuard><AdminGuard><AdminDeploymentsPage /></AdminGuard></AuthGuard>
      </Route>
      <Route path="/admin/organizations">
        <AuthGuard><AdminGuard><AdminOrganizationsPage /></AdminGuard></AuthGuard>
      </Route>
      <Route path="/admin/users">
        <AuthGuard><AdminGuard><AdminUsersPage /></AdminGuard></AuthGuard>
      </Route>
      <Route path="/admin/tokens">
        <AuthGuard><AdminGuard><AdminTokensPage /></AdminGuard></AuthGuard>
      </Route>
      <Route path="/admin/compliance">
        <AuthGuard><AdminGuard><AdminCompliancePage /></AdminGuard></AuthGuard>
      </Route>
      <Route path="/admin/github">
        <AuthGuard><AdminGuard><AdminGithubPage /></AdminGuard></AuthGuard>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function RoutedApp() {
  const { client, isLoading } = useAuth();
  const qc = useQueryClient();

  // When the auth identity changes, blow away cached server data so that
  // sign-in / sign-out switches user context cleanly.
  useEffect(() => {
    qc.invalidateQueries();
  }, [client?.id, qc]);

  if (isLoading) return <LoadingScreen />;
  return client ? <AuthedRoutes /> : <PublicOnlyRoutes />;
}

function App() {
  return (
    <ClerkProviderWrapper>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <DemoAuthBanner />
              <RoutedApp />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProviderWrapper>
  );
}

export default App;
