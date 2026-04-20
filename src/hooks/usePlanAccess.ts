/**
 * usePlanAccess.ts
 * ----------------------------------------------------------------------------
 * Resolves which paid plan(s) a user can use to apply for a particular scheme.
 *
 * Two layers, in priority order (a Saathi Plus subscription wins over a
 * scheme-specific Pack because it covers everything):
 *
 *   1. Active Saathi Plus subscription with calls remaining (calls_used <
 *      calls_total). Covers ANY scheme.
 *   2. Active Saathi Pack for THIS scheme with calls remaining. Covers only
 *      that scheme.
 *
 * Returned shape:
 *   • access:        'plus' | 'pack' | 'plus_quota_exhausted' | 'none'
 *   • plus:          the active subscription row (if any)
 *   • pack:          the active scheme-specific pack row (if any)
 *
 * The hook is keyed on (userId, schemeId) so two cards using it for two
 * different schemes don't share state.
 *
 * Use refresh() after a successful purchase to re-evaluate immediately.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ActivePlus {
  id: string;
  expires_at: string;
  calls_total: number;
  calls_used: number;
  visits_total: number;
  visits_used: number;
}
export interface ActivePack {
  id: string;
  scheme_id: string;
  expires_at: string;
  calls_total: number;
  calls_used: number;
  visits_total: number;
  visits_used: number;
}

export type PlanAccess = "plus" | "pack" | "plus_quota_exhausted" | "none";

interface State {
  access: PlanAccess;
  plus: ActivePlus | null;
  pack: ActivePack | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function usePlanAccess(schemeId: string | null): State {
  const { user } = useAuth();
  const [plus, setPlus] = useState<ActivePlus | null>(null);
  const [pack, setPack] = useState<ActivePack | null>(null);
  const [access, setAccess] = useState<PlanAccess>("none");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setPlus(null); setPack(null); setAccess("none"); setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Fetch the user's active Saathi Plus subscription (if any) and any
      // active pack for this specific scheme — in parallel.
      const nowIso = new Date().toISOString();

      const plusPromise = supabase
        .from("subscriptions")
        .select("id, expires_at, calls_total, calls_used, visits_total, visits_used")
        .eq("user_id", user.id)
        .eq("plan_type", "saathi_plus_annual")
        .eq("is_active", true)
        .gt("expires_at", nowIso)
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const packPromise = schemeId
        ? supabase
            .from("scheme_packs")
            .select("id, scheme_id, expires_at, calls_total, calls_used, visits_total, visits_used")
            .eq("user_id", user.id)
            .eq("scheme_id", schemeId)
            .eq("is_active", true)
            .gt("expires_at", nowIso)
            .order("purchased_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as const);

      const [plusRes, packRes] = await Promise.all([plusPromise, packPromise]);

      const plusRow = (plusRes.data ?? null) as ActivePlus | null;
      const packRow = (packRes.data ?? null) as ActivePack | null;

      setPlus(plusRow);
      setPack(packRow);

      // Determine effective access in priority order.
      if (plusRow && plusRow.calls_used < plusRow.calls_total) {
        setAccess("plus");
      } else if (packRow && packRow.calls_used < packRow.calls_total) {
        setAccess("pack");
      } else if (plusRow) {
        // Has Plus but quota fully consumed → special state so the paywall
        // can offer a top-up CTA in addition to the usual options.
        setAccess("plus_quota_exhausted");
      } else {
        setAccess("none");
      }
    } catch {
      // Fail closed: pretend the user has no plan rather than risk
      // unlocking the Apply modal on a transient error.
      setPlus(null); setPack(null); setAccess("none");
    } finally {
      setLoading(false);
    }
  }, [user, schemeId]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { access, plus, pack, loading, refresh };
}
