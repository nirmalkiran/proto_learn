import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import SalesDeck from "./pages/SalesDeck";
import Project from "./pages/Project";
import NotFound from "./pages/NotFound";
import { MenuConfigPanel } from "./components/MenuConfigPanel";

// Wrapper component to pass projectId to ProtectedRoute
const ProjectRoute = () => {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <ProtectedRoute projectId={projectId}>
      <Project />
    </ProtectedRoute>
  );
};

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/sales-deck" element={<SalesDeck />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            } />
            <Route path="/project/:projectId" element={
              <ProjectRoute />
            } />
            <Route path="/project/:projectId/:view" element={
              <ProjectRoute />
            } />
            <Route path="/menu-config" element={
              <ProtectedRoute>
                <MenuConfigPanel />
              </ProtectedRoute>
            } />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
