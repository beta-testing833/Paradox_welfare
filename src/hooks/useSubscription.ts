/**
 * useSubscription.ts
 * ----------------------------------------------------------------------------
 * Reads the user's active Saathi Plus annual subscription (if any) and
 * exposes summary fields for the navbar / Profile / Status pages.
 *
 * Returns:
 *   • isActive       — true when the user has an active Saathi Plus row that
 *                      hasn't yet expired
 *   • expiresAt      — ISO string of when the Plus sub expires (null if none)
 *   • daysRemaining  — integer days until expiry (null when no sub)
 *   • callsTotal/callsUsed/visitsTotal/visitsUsed — quota counters
 *   • subscription   — the full row, or null
 *   • loading        — true until the first round-trip resolves
 *   • refresh()      — manual re-fetch (call after a successful payment)
 *
 * Note on legacy rows: any pre-existing annual_1500 subscriptions were
 * grandfathered as plan_type='saathi_plus_annual' in the migration, so
 * they show up here automatically with default 15 calls / 3 visits.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SubscriptionRow {
  id: string;
  expires_at: string;
  is_active: boolean;
  calls_total: number;
  calls_used: number;
  visits_total: number;
  visits_used: number;
}

export interface SubscriptionState {
  isActive: boolean;
  expiresAt: string | null;
  daysRemaining: number | null;
  callsTotal: number;
  callsUsed: number;
  visitsTotal: number;
  visitsUsed: number;
  subscription: SubscriptionRow | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useSubscription(): SubscriptionState {
  const { user } = useAuth();
  const [row, setRow] = useState<SubscriptionRow | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setRow(null); setIsActive(false); setExpiresAt(null); setDaysRemaining(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // RLS ensures we only see this user's own row.
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id, expires_at, is_active, calls_total, calls_used, visits_total, visits_used")
        .eq("user_id", user.id)
        .eq("plan_type", "saathi_plus_annual")
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      if (!data) {
        setRow(null); setIsActive(false); setExpiresAt(null); setDaysRemaining(null);
        return;
      }

      const expires = new Date(data.expires_at);
      const now = new Date();
      const stillValid = data.is_active && expires.getTime() > now.getTime();

      const msPerDay = 1000 * 60 * 60 * 24;
      const days = stillValid
        ? Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / msPerDay))
        : 0;

      setRow(data as SubscriptionRow);
      setIsActive(stillValid);
      setExpiresAt(data.expires_at);
      setDaysRemaining(days);
    } catch {
      // Fail closed.
      setRow(null); setIsActive(false); setExpiresAt(null); setDaysRemaining(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  return {
    isActive,
    expiresAt,
    daysRemaining,
    callsTotal: row?.calls_total ?? 0,
    callsUsed: row?.calls_used ?? 0,
    visitsTotal: row?.visits_total ?? 0,
    visitsUsed: row?.visits_used ?? 0,
    subscription: row,
    loading,
    refresh,
  };
}
