import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { featureFlags, publicProjectIds } from "@/config/features";

interface ProtectedRouteProps {
  children: React.ReactNode;
  projectId?: string;
}

const ProtectedRoute = ({ children, projectId }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();

  // Allow access to public projects without authentication
  if (projectId && publicProjectIds.includes(projectId as any)) {
    return <>{children}</>;
  }

  // Bypass authentication if feature flag is enabled
  if (featureFlags.bypassAuth) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;