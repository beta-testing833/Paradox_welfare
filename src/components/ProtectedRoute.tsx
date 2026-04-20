/**
 * ProtectedRoute.tsx
 * ----------------------------------------------------------------------------
 * Wrapper that gates a route behind authentication. If the user is not signed
 * in, redirect them to /auth and remember where they came from so we can send
 * them back after login. Used for /profile, /dashboard, /status, /notifications.
 */
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ReactNode } from "react";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

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
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
