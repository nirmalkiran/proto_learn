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

// 🔹 Automation / Lovable pages
import Dashboard from "./pages/Dashboard";
import TerminalPanel from "./pages/TerminalPanel";
import Recorder from "./pages/Recorder";
import Inspector from "./pages/Inspector";
import TestGenerator from "./pages/TestGenerator";
import Config from "./pages/Config";

// --------------------------------------------------
// Wrapper to inject projectId into ProtectedRoute
// --------------------------------------------------
const ProjectRoute = () => {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <ProtectedRoute projectId={projectId}>
      <Project />
    </ProtectedRoute>
  );
};

// --------------------------------------------------
// React Query Client
// --------------------------------------------------
const queryClient = new QueryClient();

// --------------------------------------------------
// App
// --------------------------------------------------
const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        <BrowserRouter>
          <Routes>
            {/* -------------------- PUBLIC ROUTES -------------------- */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/sales-deck" element={<SalesDeck />} />

            {/* -------------------- PROTECTED ROOT -------------------- */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />

            {/* -------------------- PROJECT ROUTES -------------------- */}
            <Route path="/project/:projectId" element={<ProjectRoute />} />
            <Route path="/project/:projectId/:view" element={<ProjectRoute />} />

            {/* -------------------- AUTOMATION / LOVABLE ROUTES -------------------- */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/terminal"
              element={
                <ProtectedRoute>
                  <TerminalPanel />
                </ProtectedRoute>
              }
            />

            <Route
              path="/recorder"
              element={
                <ProtectedRoute>
                  <Recorder />
                </ProtectedRoute>
              }
            />

            <Route
              path="/inspector"
              element={
                <ProtectedRoute>
                  <Inspector />
                </ProtectedRoute>
              }
            />

            <Route
              path="/generator"
              element={
                <ProtectedRoute>
                  <TestGenerator />
                </ProtectedRoute>
              }
            />

            <Route
              path="/config"
              element={
                <ProtectedRoute>
                  <Config />
                </ProtectedRoute>
              }
            />

            {/* -------------------- ADMIN -------------------- */}
            <Route
              path="/menu-config"
              element={
                <ProtectedRoute>
                  <MenuConfigPanel />
                </ProtectedRoute>
              }
            />

            {/* -------------------- CATCH ALL (KEEP LAST) -------------------- */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
