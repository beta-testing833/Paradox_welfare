/**
 * eligibilityScorer.ts
 * ----------------------------------------------------------------------------
 * Pure module that calculates how well a user's profile matches a welfare
 * scheme's eligibility criteria.
 *
 * Scoring weights (updated for Sprint 4 — geographic + economic targeting):
 *   • Income match      → 25 points  (was 30)
 *   • Age match         → 15 points  (was 20)
 *   • Category match    → 15 points  (was 20)  — PVTG/DNT count as ST sub-groups
 *   • Occupation match  → 15 points  (was 20)
 *   • Disability match  → 10 points  (unchanged)
 *   • State match       → 10 points  (NEW)
 *   • Area type match   →  5 points  (NEW)
 *   • BPL match         →  5 points  (NEW)
 * Total possible: 100. A scheme is "eligible" if score ≥ 60.
 *
 * The Eligibility page treats schemes <60 as not-eligible; the priority-search
 * UI on /eligibility surfaces them in a separate "not eligible" rail.
 *
 * This module is intentionally PURE — no Supabase calls, no React hooks, no
 * side effects — so it can be unit-tested and reused on the Dashboard.
 */

export interface UserForm {
  name?: string;
  age: number;
  gender?: string;
  annualIncome: number;
  category: string;          // General | OBC | SC | ST | PVTG | DNT
  occupation: string;        // free-text
  disability: boolean;
  // ---- Sprint 4 additions ----
  stateOfResidence?: string; // e.g. "West Bengal"
  areaType?: "Urban" | "Rural" | ""; // empty = not yet answered
  isBpl?: boolean;
  // ---- Sprint 5 BPL-conditional additions ----
  isDistressed?: boolean;            // only meaningful when isBpl === true
  familyAnnualIncome?: number | null; // only when isBpl === false
  guardianAnnualIncome?: number | null; // only when isBpl === false
  guardianNotApplicable?: boolean;   // pairs with guardianAnnualIncome
  prioritySearch?: string;   // free-text, used by the page (not by scorer)
}

export interface EligibilityCriteria {
  min_age?: number;
  max_age?: number;
  max_income?: number;
  categories?: string[];     // may include "PVTG" / "DNT" or rely on "ST" fallback
  occupations?: string[];
  disability_required?: boolean;
  gender_required?: string;
}

/**
 * Eligibility threshold — schemes scoring strictly below this are considered
 * "not eligible" and hidden from the primary match list. Exposed so the
 * Eligibility page and Dashboard stay in sync.
 */
export const ELIGIBILITY_THRESHOLD = 60;

/**
 * Codes that are treated as ST sub-groups during category scoring.
 * PVTG = Particularly Vulnerable Tribal Group, DNT = Denotified / Nomadic.
 * If a scheme lists "ST" in its categories array, users in these sub-groups
 * still receive full category points.
 */
const ST_SUBGROUPS = new Set(["PVTG", "DNT"]);

/**
 * Lightweight shape of the scheme columns the scorer needs. We accept this
 * narrower type so callers can pass the raw Supabase row without casting
 * every nullable column.
 */
export interface ScoreableScheme {
  eligibility_criteria: EligibilityCriteria | null | undefined;
  allowed_states?: string[] | null;     // empty / null = central scheme
  target_area?: "Any" | "Urban" | "Rural" | string | null;
  requires_bpl?: boolean | null;
  category?: string | null;             // used for the BPL+distress bonus
}

/**
 * calculateScore
 * ----------------------------------------------------------------------------
 * Score a single user/scheme pair on the 0–100 scale described above.
 *
 * @param form   User-entered eligibility form values.
 * @param scheme Either a full scheme row OR (legacy) just an EligibilityCriteria
 *               object. The legacy form is supported so existing call sites
 *               that pass `s.eligibility_criteria` directly keep working.
 * @returns      Integer score from 0 to 100 (higher = better match).
 */
export function calculateScore(
  form: UserForm,
  scheme: ScoreableScheme | EligibilityCriteria | null | undefined,
): number {
  // Bail out cleanly when the caller has nothing for us.
  if (!scheme) return 0;

  // Normalise the two accepted shapes into { crit, schemeMeta }.
  const isFullScheme = scheme && typeof scheme === "object" && "eligibility_criteria" in scheme;
  const crit: EligibilityCriteria | null | undefined = isFullScheme
    ? (scheme as ScoreableScheme).eligibility_criteria
    : (scheme as EligibilityCriteria);
  const schemeMeta: ScoreableScheme = isFullScheme ? (scheme as ScoreableScheme) : {} as ScoreableScheme;

  // No criteria object at all → can't score; treat as 0 to be safe.
  if (!crit) return 0;

  let score = 0;

  // ================== Income (25 pts) ==================
  // Heaviest single weight — most common disqualifier in welfare schemes.
  if (typeof crit.max_income === "number") {
    if (form.annualIncome <= crit.max_income) score += 25;
  } else {
    score += 25; // No income limit → automatic full points.
  }

  // ================== Age (15 pts) ==================
  // Both bounds must hold; missing bound = unbounded on that side.
  const minOk = typeof crit.min_age !== "number" || form.age >= crit.min_age;
  const maxOk = typeof crit.max_age !== "number" || form.age <= crit.max_age;
  if (minOk && maxOk) score += 15;

  // ================== Category (15 pts) ==================
  // Empty / missing categories list ⇒ "any category". Otherwise the user's
  // category code must appear in the list, with a special fallback so PVTG
  // and DNT users qualify whenever a scheme accepts "ST".
  if (!crit.categories || crit.categories.length === 0) {
    score += 15;
  } else if (crit.categories.includes(form.category)) {
    score += 15;
  } else if (ST_SUBGROUPS.has(form.category) && crit.categories.includes("ST")) {
    score += 15; // PVTG / DNT are ST sub-groups — accept ST-only schemes too.
  }

  // ================== Occupation (15 pts) ==================
  // Empty list = any occupation. Otherwise we accept a case-insensitive
  // substring match so "Marginal Farmer" still satisfies a "Farmer" rule.
  if (!crit.occupations || crit.occupations.length === 0) {
    score += 15;
  } else {
    const occLower = (form.occupation || "").toLowerCase();
    if (crit.occupations.some((o) => occLower.includes(o.toLowerCase()))) {
      score += 15;
    }
  }

  // ================== Disability (10 pts) ==================
  // If the scheme requires a disability certificate, only disabled users get
  // the points. Otherwise it's a free 10.
  if (crit.disability_required) {
    if (form.disability) score += 10;
  } else {
    score += 10;
  }

  // ================== State (10 pts — NEW) ==================
  // A scheme is "central" when allowed_states is empty/null → full points
  // for everybody. Otherwise the user's state must appear in the list.
  const allowedStates = schemeMeta.allowed_states ?? [];
  if (!allowedStates || allowedStates.length === 0) {
    score += 10;
  } else if (form.stateOfResidence && allowedStates.includes(form.stateOfResidence)) {
    score += 10;
  }

  // ================== Area type (5 pts — NEW) ==================
  // "Any" target area always matches. Otherwise the user's selection must
  // equal the scheme's target_area exactly.
  const targetArea = (schemeMeta.target_area ?? "Any") as string;
  if (targetArea === "Any" || (form.areaType && targetArea === form.areaType)) {
    score += 5;
  }

  // ================== BPL (5 pts — NEW) ==================
  // If the scheme is BPL-restricted, only BPL users qualify. Non-BPL schemes
  // give full points to everyone.
  if (schemeMeta.requires_bpl) {
    if (form.isBpl) score += 5;
  } else {
    score += 5;
  }

  // ================== Gender hard-gate (not weighted) ==================
  // A gender mismatch disqualifies entirely, so we return 0 regardless of
  // the points accumulated above.
  if (crit.gender_required && form.gender && crit.gender_required !== form.gender) {
    return 0;
  }

  // Clamp into [0, 100] just in case future weight tweaks break the math.
  return Math.max(0, Math.min(100, score));
}

/**
 * explainIneligibility
 * ----------------------------------------------------------------------------
 * Produce a single short, human-readable reason a user is ineligible for a
 * scheme. Used by the "Other schemes in your preferred field" rail so the
 * user understands why a priority-search hit was demoted.
 *
 * Returns the FIRST failing rule we find, in priority order: state → income
 * → age → category → occupation → disability → area type → BPL → gender.
 * Returns null if the user is actually eligible (score ≥ threshold).
 */
export function explainIneligibility(
  form: UserForm,
  scheme: ScoreableScheme,
): string | null {
  // If the score is high enough, there's nothing to explain.
  if (calculateScore(form, scheme) >= ELIGIBILITY_THRESHOLD) return null;

  const crit = scheme.eligibility_criteria ?? {};

  // State first — most binary disqualifier.
  const allowedStates = scheme.allowed_states ?? [];
  if (allowedStates.length > 0 && form.stateOfResidence && !allowedStates.includes(form.stateOfResidence)) {
    return "State not eligible";
  }

  // Income exceeds the scheme's cap.
  if (typeof crit.max_income === "number" && form.annualIncome > crit.max_income) {
    return "Income exceeds limit";
  }

  // Age outside [min_age, max_age].
  if (typeof crit.min_age === "number" && form.age < crit.min_age) return "Below minimum age";
  if (typeof crit.max_age === "number" && form.age > crit.max_age) return "Above maximum age";

  // Category not accepted (with the PVTG/DNT → ST fallback).
  if (crit.categories && crit.categories.length > 0) {
    const catOk =
      crit.categories.includes(form.category) ||
      (ST_SUBGROUPS.has(form.category) && crit.categories.includes("ST"));
    if (!catOk) return "Category not eligible";
  }

  // Occupation mismatch.
  if (crit.occupations && crit.occupations.length > 0) {
    const occLower = (form.occupation || "").toLowerCase();
    const ok = crit.occupations.some((o) => occLower.includes(o.toLowerCase()));
    if (!ok) return "Occupation requirement not met";
  }

  // Disability required but user is not disabled.
  if (crit.disability_required && !form.disability) return "Disability certificate required";

  // Area type mismatch (Urban vs Rural).
  const targetArea = (scheme.target_area ?? "Any") as string;
  if (targetArea !== "Any" && form.areaType && targetArea !== form.areaType) {
    return `Available only for ${targetArea} areas`;
  }

  // BPL-only scheme but user is not BPL.
  if (scheme.requires_bpl && !form.isBpl) return "BPL households only";

  // Gender hard-gate.
  if (crit.gender_required && form.gender && crit.gender_required !== form.gender) {
    return `Available only for ${crit.gender_required} applicants`;
  }

  // Generic fallback if nothing specific surfaced.
  return "Eligibility criteria not fully met";
}
