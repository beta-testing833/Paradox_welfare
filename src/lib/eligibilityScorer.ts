/**
 * eligibilityScorer.ts
 * ----------------------------------------------------------------------------
 * Pure module that calculates how well a user's profile matches a welfare
 * scheme's eligibility criteria.
 *
 * Scoring weights (rebalanced for Sprint 6 — totals to exactly 100):
 *   • Income match           → 20 points
 *   • Age match              → 10 points
 *   • Category match         → 15 points
 *   • Occupation match       → 10 points
 *   • Disability match       →  5 points
 *   • State match            → 10 points
 *   • Area type match        →  5 points
 *   • BPL match              →  5 points
 *   • Marital status match   →  5 points  (NEW)
 *   • Gov. employee match    →  5 points  (NEW)
 *   • Minority match         →  3 points  (NEW)
 *   • DBT eligibility match  →  3 points  (NEW)
 *   • Benefit type match     →  4 points  (NEW)
 * Total possible: 100. Threshold for "eligible" remains ≥ 60.
 *
 * The Eligibility page treats schemes <60 as not-eligible; the priority-search
 * UI surfaces them in a separate "not eligible" rail.
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
  // ---- Sprint 6 additions ----
  maritalStatus?: string;            // Single | Married | Widowed | Divorced | Separated
  isGovEmployee?: boolean;           // pill toggle
  govEmployeeId?: string;            // conditional, only when isGovEmployee=true
  isMinority?: boolean;              // pill toggle
  isDbtEligible?: boolean;           // pill toggle
  preferredBenefitType?: "Cash" | "Kind" | "Composite"; // segmented control
}

export interface EligibilityCriteria {
  min_age?: number;
  max_age?: number;
  max_income?: number;
  categories?: string[];     // may include "PVTG" / "DNT" or rely on "ST" fallback
  occupations?: string[];
  disability_required?: boolean;
  gender_required?: string;
  // ---- Sprint 6 additions (all optional) ----
  marital_statuses?: string[];          // accepted statuses; missing/empty = any
  requires_gov_employee?: boolean;      // true = scheme is for gov employees only
  requires_minority?: boolean;          // true = minority applicants only
  requires_dbt?: boolean;               // true = needs Aadhar-linked DBT account
  benefit_type?: "Cash" | "Kind" | "Composite" | "Any"; // default "Any"
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

  // ================== Income (20 pts) ==================
  // BPL fast-path: schemes that explicitly require BPL OR have no income
  // ceiling automatically grant the full income points to BPL households.
  if (form.isBpl && (schemeMeta.requires_bpl || typeof crit.max_income !== "number")) {
    score += 20;
  } else if (typeof crit.max_income === "number") {
    if (form.annualIncome <= crit.max_income) score += 20;
  } else {
    score += 20; // No income limit → automatic full points.
  }

  // ================== Age (10 pts) ==================
  // Both bounds must hold; missing bound = unbounded on that side.
  const minOk = typeof crit.min_age !== "number" || form.age >= crit.min_age;
  const maxOk = typeof crit.max_age !== "number" || form.age <= crit.max_age;
  if (minOk && maxOk) score += 10;

  // ================== Category (15 pts) ==================
  if (!crit.categories || crit.categories.length === 0) {
    score += 15;
  } else if (crit.categories.includes(form.category)) {
    score += 15;
  } else if (ST_SUBGROUPS.has(form.category) && crit.categories.includes("ST")) {
    score += 15; // PVTG / DNT are ST sub-groups — accept ST-only schemes too.
  }

  // ================== Occupation (10 pts) ==================
  if (!crit.occupations || crit.occupations.length === 0) {
    score += 10;
  } else {
    const occLower = (form.occupation || "").toLowerCase();
    if (crit.occupations.some((o) => occLower.includes(o.toLowerCase()))) {
      score += 10;
    }
  }

  // ================== Disability (5 pts) ==================
  if (crit.disability_required) {
    if (form.disability) score += 5;
  } else {
    score += 5;
  }

  // ================== State (10 pts) ==================
  const allowedStates = schemeMeta.allowed_states ?? [];
  if (!allowedStates || allowedStates.length === 0) {
    score += 10;
  } else if (form.stateOfResidence && allowedStates.includes(form.stateOfResidence)) {
    score += 10;
  }

  // ================== Area type (5 pts) ==================
  const targetArea = (schemeMeta.target_area ?? "Any") as string;
  if (targetArea === "Any" || (form.areaType && targetArea === form.areaType)) {
    score += 5;
  }

  // ================== BPL (5 pts) ==================
  if (schemeMeta.requires_bpl) {
    if (form.isBpl) score += 5;
  } else {
    score += 5;
  }

  // ================== Marital status (5 pts — NEW) ==================
  // Empty / missing list = any status accepted.
  if (!crit.marital_statuses || crit.marital_statuses.length === 0) {
    score += 5;
  } else if (form.maritalStatus && crit.marital_statuses.includes(form.maritalStatus)) {
    score += 5;
  }

  // ================== Government employee (5 pts — NEW) ==================
  // No constraint OR user matches the constraint → full points.
  if (crit.requires_gov_employee === undefined || crit.requires_gov_employee === null) {
    score += 5;
  } else if (crit.requires_gov_employee === !!form.isGovEmployee) {
    score += 5;
  }

  // ================== Minority (3 pts — NEW) ==================
  // No requirement → free points. Otherwise applicant must be a minority.
  if (!crit.requires_minority) {
    score += 3;
  } else if (form.isMinority) {
    score += 3;
  }

  // ================== DBT (3 pts — NEW) ==================
  if (!crit.requires_dbt) {
    score += 3;
  } else if (form.isDbtEligible) {
    score += 3;
  }

  // ================== Benefit type (4 pts — NEW) ==================
  // 'Any' (or missing) always matches; otherwise must equal user's preference.
  const bType = (crit.benefit_type ?? "Any") as string;
  if (bType === "Any" || !form.preferredBenefitType || bType === form.preferredBenefitType) {
    score += 4;
  }

  // ================== Gender hard-gate (not weighted) ==================
  if (crit.gender_required && form.gender && crit.gender_required !== form.gender) {
    return 0;
  }

  // ================== Distress bonus (Sprint 5, +5 pts, capped at 100) ==================
  if (form.isBpl && form.isDistressed) {
    const cat = (schemeMeta.category ?? "").toLowerCase();
    if (cat === "food security" || cat === "disability" || cat === "health") {
      score += 5;
    }
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
 * Returns the FIRST failing rule we find, in priority order:
 *   state → income → age → category → occupation → disability → area type
 *   → BPL → marital → gov-employee → minority → DBT → benefit type → gender.
 * Returns null if the user is actually eligible (score ≥ threshold).
 */
export function explainIneligibility(
  form: UserForm,
  scheme: ScoreableScheme,
): string | null {
  if (calculateScore(form, scheme) >= ELIGIBILITY_THRESHOLD) return null;

  const crit = scheme.eligibility_criteria ?? {};

  const allowedStates = scheme.allowed_states ?? [];
  if (allowedStates.length > 0 && form.stateOfResidence && !allowedStates.includes(form.stateOfResidence)) {
    return "State not eligible";
  }
  if (typeof crit.max_income === "number" && form.annualIncome > crit.max_income) {
    return "Income exceeds limit";
  }
  if (typeof crit.min_age === "number" && form.age < crit.min_age) return "Below minimum age";
  if (typeof crit.max_age === "number" && form.age > crit.max_age) return "Above maximum age";
  if (crit.categories && crit.categories.length > 0) {
    const catOk =
      crit.categories.includes(form.category) ||
      (ST_SUBGROUPS.has(form.category) && crit.categories.includes("ST"));
    if (!catOk) return "Category not eligible";
  }
  if (crit.occupations && crit.occupations.length > 0) {
    const occLower = (form.occupation || "").toLowerCase();
    const ok = crit.occupations.some((o) => occLower.includes(o.toLowerCase()));
    if (!ok) return "Occupation requirement not met";
  }
  if (crit.disability_required && !form.disability) return "Disability certificate required";
  const targetArea = (scheme.target_area ?? "Any") as string;
  if (targetArea !== "Any" && form.areaType && targetArea !== form.areaType) {
    return `Available only for ${targetArea} areas`;
  }
  if (scheme.requires_bpl && !form.isBpl) return "BPL households only";
  if (crit.marital_statuses && crit.marital_statuses.length > 0 && form.maritalStatus
      && !crit.marital_statuses.includes(form.maritalStatus)) {
    return "Marital status not eligible";
  }
  if (crit.requires_gov_employee === true && !form.isGovEmployee) return "Government employees only";
  if (crit.requires_gov_employee === false && form.isGovEmployee) return "Not for government employees";
  if (crit.requires_minority && !form.isMinority) return "Minority applicants only";
  if (crit.requires_dbt && !form.isDbtEligible) return "Requires DBT-linked account";
  const bType = (crit.benefit_type ?? "Any") as string;
  if (bType !== "Any" && form.preferredBenefitType && bType !== form.preferredBenefitType) {
    return `Benefit type is ${bType}, not your preference`;
  }
  if (crit.gender_required && form.gender && crit.gender_required !== form.gender) {
    return `Available only for ${crit.gender_required} applicants`;
  }
  return "Eligibility criteria not fully met";
}
