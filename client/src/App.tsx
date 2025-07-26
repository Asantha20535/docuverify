import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import StudentDashboard from "@/pages/dashboard/student";
import WorkflowDashboard from "@/pages/dashboard/workflow";
import AdminDashboard from "@/pages/dashboard/admin";
import VerifyPortal from "@/pages/verify";
import { AuthProvider } from "@/lib/auth";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard/student" component={StudentDashboard} />
      <Route path="/dashboard/workflow" component={WorkflowDashboard} />
      <Route path="/dashboard/admin" component={AdminDashboard} />
      <Route path="/verify" component={VerifyPortal} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
