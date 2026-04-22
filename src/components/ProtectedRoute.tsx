/**
 * ProtectedRoute.tsx
 * ----------------------------------------------------------------------------
 * Wrapper that gates a route behind authentication. If the user is not signed
 * in, redirect them to /auth and remember where they came from so we can send
 * them back after login.
 *
 * Optional `requiredRole` prop enforces role-based access via Supabase
 * `app_metadata.role`. If the signed-in user doesn't have the required role,
 * we toast "Access denied." and bounce them home.
 */
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ReactNode, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Required app_metadata.role on the user (e.g. "agent"). */
  requiredRole?: string;
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Side-effect: surface a toast when role check fails. useEffect avoids
  // firing during render.
  const role = (user?.app_metadata as { role?: string } | undefined)?.role;
  const roleMismatch = !!user && !!requiredRole && role !== requiredRole;

  useEffect(() => {
    if (roleMismatch) toast.error("Access denied.");
  }, [roleMismatch]);

  // Show a centred spinner while we determine the auth state on first paint.
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  // Not authenticated → bounce to the auth page, keeping return path in state.
  if (!user) {
    // Agent routes should send agents to the agent portal, not the user one.
    const loginPath = requiredRole === "agent" ? "/agent/login" : "/auth";
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  // Wrong role → home.
  if (roleMismatch) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
