import { Switch, Route, Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import StudentDashboard from "@/pages/dashboard/student";
import StaffDashboard from "@/pages/dashboard/staff";
import WorkflowDashboard from "@/pages/dashboard/workflow";
import AdminDashboard from "@/pages/dashboard/admin";
import CourseUnitDashboard from "@/pages/dashboard/course-unit";
import VerifyPortal from "@/pages/verify";
import { AuthProvider } from "@/lib/auth";
import Profile from "@/pages/dashboard/profile";

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/verify" component={VerifyPortal} />
      <Route path="/dashboard/student">{user ? <StudentDashboard /> : <Redirect to="/login" />}</Route>
      <Route path="/dashboard/staff">{user ? <StaffDashboard /> : <Redirect to="/login" />}</Route>
      <Route path="/dashboard/admin">{user ? <AdminDashboard /> : <Redirect to="/login" />}</Route>
      <Route path="/dashboard/workflow">{user ? <WorkflowDashboard /> : <Redirect to="/login" />}</Route>
      <Route path="/dashboard/course-unit">{user ? <CourseUnitDashboard /> : <Redirect to="/login" />}</Route>
      <Route path="/">
        <Redirect to="/login" />
      </Route>
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
