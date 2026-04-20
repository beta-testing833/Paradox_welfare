/**
 * concession.ts
 * ----------------------------------------------------------------------------
 * Single source of truth for the automatic 50% concession discount on
 * Saathi Pack and Saathi Plus purchases. Top-ups are NEVER discounted.
 *
 * A user qualifies for concession if ANY of the following is true:
 *   1. Age ≥ 60                                  → "Senior citizen (60+)"
 *   2. BPL = Yes in latest eligibility submission → "BPL cardholder"
 *   3. Age < 25 AND occupation = "Student"       → "Student under 25"
 *   4. Disability flag = true in latest submission → "Person with disability"
 *
 * Why we recompute every time (no caching):
 *   The user might turn 60 tomorrow, mark themselves as BPL, or update their
 *   occupation. Caching the eligibility flag would silently freeze a stale
 *   answer. The cost of one extra Supabase round-trip at payment time is
 *   trivial compared to the risk of charging a senior the full price.
 *
 * Schema notes — we adapted the helper to the columns that actually exist
 * in our project (the spec referenced columns that don't):
 *   • profiles.dob           → DOB-derived age (preferred)
 *   • eligibility_submissions.created_at  ← used as "latest" sort key
 *   • eligibility_submissions.disability  ← (not has_disability)
 *   • eligibility_submissions.age         ← fallback when DOB is empty
 */
import { supabase } from "@/integrations/supabase/client";

export interface ConcessionResult {
  /** True when the user qualifies for the 50% concession price. */
  eligible: boolean;
  /** Human-readable reason — surfaced in the UI banners. Null when not eligible. */
  reason: string | null;
}

/** Compute integer age from an ISO date-of-birth (YYYY-MM-DD). */
function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const ms = Date.now() - new Date(dob).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * Resolve concession eligibility for the given user.
 * Always returns a value — fails closed (eligible = false) on any DB error
 * so we never accidentally hand out a discount to a non-eligible user.
 */
export async function isConcessionEligible(userId: string): Promise<ConcessionResult> {
  try {
    // Fetch profile DOB and the most recent eligibility submission in parallel.
    const [profileRes, submissionRes] = await Promise.all([
      supabase.from("profiles").select("dob").eq("id", userId).maybeSingle(),
      supabase
        .from("eligibility_submissions")
        .select("is_bpl, occupation, disability, age")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const profile = profileRes.data;
    const sub = submissionRes.data;

    // Prefer DOB-derived age (always current); fall back to submission age.
    const dobAge = ageFromDob(profile?.dob);
    const age = dobAge ?? sub?.age ?? null;

    // Check criteria in priority order so the surfaced reason is the
    // most relatable one (seniors > BPL > student > disability).
    if (age !== null && age >= 60) {
      return { eligible: true, reason: "Senior citizen (60+)" };
    }
    if (sub?.is_bpl === true) {
      return { eligible: true, reason: "BPL cardholder" };
    }
    if (
      age !== null &&
      age < 25 &&
      (sub?.occupation ?? "").trim().toLowerCase() === "student"
    ) {
      return { eligible: true, reason: "Student under 25" };
    }
    if (sub?.disability === true) {
      return { eligible: true, reason: "Person with disability" };
    }
  } catch {
    // Any DB failure → fail closed (no discount).
  }
  return { eligible: false, reason: null };
}

/** Apply (or skip) the 50% concession to a full price. Returns whole rupees. */
export function applyConcession(fullPrice: number, eligible: boolean): number {
  return eligible ? Math.round(fullPrice * 0.5) : fullPrice;
}

/** Public price constants — single place to tune them. */
export const PRICES = {
  saathi_pack_full: 199,
  saathi_pack_concession: 99,
  saathi_plus_full: 999,
  saathi_plus_concession: 499,
  saathi_plus_decoy: 1499,
  topup_call: 50,
  topup_visit: 249,
} as const;
