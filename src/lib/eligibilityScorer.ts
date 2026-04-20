/**
 * eligibilityScorer.ts
 * ----------------------------------------------------------------------------
 * Pure module that calculates how well a user's profile matches a welfare
 * scheme's eligibility criteria.
 *
 * Scoring weights (per spec):
 *   • Income match      → 30 points
 *   • Age match         → 20 points
 *   • Category match    → 20 points
 *   • Occupation match  → 20 points
 *   • Disability match  → 10 points
 * Total possible: 100.
 *
 * Used by /eligibility (live match panel) and /dashboard (recommendations).
 */

export interface UserForm {
  name?: string;
  age: number;
  gender?: string;
  annualIncome: number;
  category: string;       // General | OBC | SC | ST
  occupation: string;     // free-text
  disability: boolean;
}

export interface EligibilityCriteria {
  min_age?: number;
  max_age?: number;
  max_income?: number;
  categories?: string[];
  occupations?: string[];
  disability_required?: boolean;
  gender_required?: string;
}

/**
 * Calculate a 0–100 eligibility score for a user against a single scheme.
 * @param form    The user's eligibility form input.
 * @param crit    The scheme's eligibility_criteria JSON blob.
 * @returns       Integer score from 0 to 100 (higher = better match).
 */
export function calculateScore(form: UserForm, crit: EligibilityCriteria | null | undefined): number {
  if (!crit) return 0;
  let score = 0;

  // ---- Income (30 pts): heaviest weight — most common disqualifier. ----
  if (typeof crit.max_income === "number") {
    if (form.annualIncome <= crit.max_income) score += 30;
  } else {
    score += 30; // No income limit on this scheme → automatic full points.
  }

  // ---- Age (20 pts): both bounds must be satisfied. ----
  const minOk = typeof crit.min_age !== "number" || form.age >= crit.min_age;
  const maxOk = typeof crit.max_age !== "number" || form.age <= crit.max_age;
  if (minOk && maxOk) score += 20;

  // ---- Category (20 pts). Empty list means "any category". ----
  if (!crit.categories || crit.categories.length === 0 || crit.categories.includes(form.category)) {
    score += 20;
  }

  // ---- Occupation (20 pts). Case-insensitive substring match accepted. ----
  if (!crit.occupations || crit.occupations.length === 0) {
    score += 20;
  } else {
    const occLower = (form.occupation || "").toLowerCase();
    if (crit.occupations.some((o) => occLower.includes(o.toLowerCase()))) {
      score += 20;
    }
  }

  // ---- Disability (10 pts). If required, user must have one. ----
  if (crit.disability_required) {
    if (form.disability) score += 10;
  } else {
    score += 10; // Not required → automatic full points.
  }

  // ---- Gender gate (not weighted — disqualifies entirely). ----
  if (crit.gender_required && form.gender && crit.gender_required !== form.gender) {
    return 0;
  }

  return Math.max(0, Math.min(100, score));
}
