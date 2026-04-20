/**
 * useSubscription.ts
 * ----------------------------------------------------------------------------
 * Single source of truth for premium subscription status.
 *
 * Returns:
 *   • isActive       — true when the current user has an active, non-expired sub
 *   • expiresAt      — ISO date string of when the sub expires, or null
 *   • daysRemaining  — integer days until expiry (≥ 0), or null when no sub
 *   • loading        — true until the first Supabase round-trip resolves
 *   • refresh()      — manual re-fetch (call after a successful payment)
 *
 * Usage:
 *   const { isActive, daysRemaining, refresh } = useSubscription();
 *
 * Implementation notes:
 *   • All Supabase calls are wrapped in try/catch so transient failures
 *     surface as "no active subscription" rather than crashing the UI.
 *   • Re-runs whenever the auth user changes so a fresh sign-in immediately
 *     picks up that user's subscription row.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SubscriptionState {
  isActive: boolean;
  expiresAt: string | null;
  daysRemaining: number | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useSubscription(): SubscriptionState {
  const { user } = useAuth();
  const [isActive, setIsActive] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Fetch the user's most recent subscription row and decide whether it is
   * still valid. We treat "no row" and "expired row" identically — both mean
   * the user is not premium.
   */
  const refresh = useCallback(async () => {
    if (!user) {
      // Anonymous visitor — never premium.
      setIsActive(false);
      setExpiresAt(null);
      setDaysRemaining(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // RLS makes sure we only ever read this user's own row.
      const { data, error } = await supabase
        .from("subscriptions")
        .select("expires_at, is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setIsActive(false);
        setExpiresAt(null);
        setDaysRemaining(null);
        return;
      }

      const expires = new Date(data.expires_at);
      const now = new Date();
      const stillValid = data.is_active && expires.getTime() > now.getTime();

      // Round to whole days; never go negative.
      const msPerDay = 1000 * 60 * 60 * 24;
      const days = stillValid
        ? Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / msPerDay))
        : 0;

      setIsActive(stillValid);
      setExpiresAt(data.expires_at);
      setDaysRemaining(days);
    } catch {
      // Treat any failure as "not premium" — fail closed so we never
      // accidentally unlock paid features when the DB call breaks.
      setIsActive(false);
      setExpiresAt(null);
      setDaysRemaining(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Re-fetch whenever the signed-in user changes.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { isActive, expiresAt, daysRemaining, loading, refresh };
}
