/**
 * AuthContext.tsx
 * ----------------------------------------------------------------------------
 * Provides the authenticated user, session, and auth helpers app-wide.
 *
 * IMPORTANT: We register the onAuthStateChange listener BEFORE calling
 * getSession(), per Supabase best-practice, to avoid missing auth events.
 *
 * Exposes:
 *   - `user`, `session`, `loading`
 *   - `signIn(email, password)`
 *   - `signUp(email, password, fullName)`
 *   - `signOut()`
 *   - `resetPassword(email)`
 */
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe FIRST so we never miss SIGNED_IN / SIGNED_OUT events.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    // Then hydrate the existing session (e.g. on page reload).
    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  /** Sign in with email + password. Returns an error string or null on success. */
  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  /** Sign up a new user. Sends them a confirmation email if email confirm is on. */
  async function signUp(email: string, password: string, fullName: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // CRITICAL: route the verification link through /auth/callback on
        // the *current* origin so it always points at the live app the user
        // is signing up from — never localhost.
        emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}auth/callback`.replace(/\/\//g, '/'),
        data: { full_name: fullName },
      },
    });
    return { error: error?.message ?? null };
  }

  /** Trigger Supabase's password-reset email. */
  async function resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  }

  /** Clear the local session and sign the user out. */
  async function signOut() {
    await supabase.auth.signOut();
  }

  const value = useMemo(
    () => ({ user, session, loading, signIn, signUp, signOut, resetPassword }),
    [user, session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook for consuming the auth context. Throws if used outside the provider. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
