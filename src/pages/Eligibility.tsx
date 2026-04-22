/**
 * Eligibility.tsx
 * ----------------------------------------------------------------------------
 * Route: /eligibility
 *
 * Sprint 5 changes (on top of Sprint 4):
 *   1. BPL Yes/No now drives conditional rendering:
 *        - BPL = Yes  → reveal "Destitute / Penury / Distress" Yes/No
 *        - BPL = No   → reveal Annual Family Income + Parent/Guardian Income
 *          (with auto "Not Applicable" if age < 18)
 *   2. "Looking for something specific?" is now a HARD FILTER. When non-empty
 *      the right panel only shows schemes whose category/name/description
 *      contains the term, sorted by score desc, and the "Filter results by"
 *      dropdown is hidden.
 *   3. "Filter results by" no longer shows a red asterisk.
 *   4. Inline required-field validation on submit ("Needs to be filled in").
 *   5. Each match card is clickable → navigates to /schemes/:id.
 *   6. "Browse all schemes" section is always visible on the right panel.
 *
 * Logged-in submissions persist to public.eligibility_submissions; guests
 * keep their data only in React state (sessionStorage is used purely as a
 * convenience cache so refreshing doesn't wipe in-progress typing).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  calculateScore,
  ELIGIBILITY_THRESHOLD,
  type UserForm,
  type ScoreableScheme,
} from "@/lib/eligibilityScorer";
import { INDIAN_STATES_AND_UTS } from "@/lib/indianStates";
import { BadgeCheck, Sparkles, ArrowRight, Search, Compass } from "lucide-react";
import { cn } from "@/lib/utils";

/** sessionStorage key for the persisted form. */
const SESSION_KEY = "welfareconnect.elig.form";

/**
 * Filter dropdown options for the "Your Matches" panel. The first entry
 * resets the filter; the rest correspond exactly to scheme.category values
 * after the Sprint-4 re-categorisation migration.
 */
const FILTER_OPTIONS = [
  "All Categories",
  "Health",
  "Education",
  "Agriculture",
  "Women Empowerment",
  "Disability",
  "Food Security",
  "Skill Development",
] as const;

/**
 * Category dropdown options. The user sees the long descriptive label, but
 * we store only the short code (`value`) in form state — that's what the
 * scorer compares against scheme.eligibility_criteria.categories.
 */
const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "General", label: "General" },
  { value: "OBC", label: "OBC (Other Backward Classes)" },
  { value: "SC", label: "SC (Scheduled Caste)" },
  { value: "ST", label: "ST (Scheduled Tribe)" },
  { value: "PVTG", label: "PVTG (Particularly Vulnerable Tribal Group)" },
  { value: "DNT", label: "DNT (Denotified, Nomadic and Semi-Nomadic Tribes)" },
];

/**
 * Shape of a scheme row as returned by Supabase. Kept local to avoid
 * over-coupling with the auto-generated Database types.
 */
interface SchemeRow extends ScoreableScheme {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  is_verified: boolean;
}

/** Names of the keys we validate on submit. Drives both UI errors and scroll. */
type RequiredKey =
  | "name"
  | "age"
  | "stateOfResidence"
  | "areaType"
  | "annualIncome"
  | "category"
  | "isBpl"
  | "isDistressed"
  | "familyAnnualIncome"
  | "guardianAnnualIncome";

export default function Eligibility() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  // ---- Hydrate the form from sessionStorage so the user can return without retyping. ----
  const [form, setForm] = useState<UserForm>(() => {
    if (typeof window === "undefined") return defaultForm();
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? { ...defaultForm(), ...JSON.parse(raw) } : defaultForm();
  });

  // Persist every keystroke so the data survives navigation.
  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(form));
  }, [form]);

  // Tracks whether the user has clicked "Find Schemes" at least once.
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Active value of the "Filter results by" dropdown in the Matches panel.
  const [filterCategory, setFilterCategory] =
    useState<typeof FILTER_OPTIONS[number]>("All Categories");

  // Map of validation errors by required-field key. Empty = form is valid.
  const [errors, setErrors] = useState<Partial<Record<RequiredKey, string>>>({});

  // Refs to required field containers — used to scroll the first error into view.
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ---- Sprint 5 Change #1: auto-toggle Guardian "Not Applicable" by age. ----
  // When age < 18 → force guardianNotApplicable = true and clear the income.
  // When age >= 18 → if it was previously auto-set, undo it. We use a ref to
  // remember whether the flag was set by the auto rule (so we don't trample
  // a manual user override the next time they change their age).
  const autoSetByAgeRef = useRef(false);
  useEffect(() => {
    if (!form.age || form.age <= 0) return; // ignore the empty initial state
    if (form.age < 18 && !form.guardianNotApplicable) {
      autoSetByAgeRef.current = true;
      setForm((f) => ({ ...f, guardianNotApplicable: true, guardianAnnualIncome: null }));
    } else if (form.age >= 18 && form.guardianNotApplicable && autoSetByAgeRef.current) {
      autoSetByAgeRef.current = false;
      setForm((f) => ({ ...f, guardianNotApplicable: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.age]);

  // ---- Sprint 5 Change #1: when BPL flips, clear the now-irrelevant fields ----
  function setBpl(v: boolean) {
    clearError("isBpl");
    setForm((f) => {
      if (v) {
        // Switched to YES → wipe the No-side fields so stale values don't leak.
        return {
          ...f,
          isBpl: true,
          familyAnnualIncome: null,
          guardianAnnualIncome: null,
          guardianNotApplicable: false,
        };
      }
      // Switched to NO → wipe the Yes-side field.
      return { ...f, isBpl: false, isDistressed: undefined };
    });
  }

  // ---- Live Supabase query: load every scheme once, score them client-side. ----
  const { data: schemes = [], isLoading } = useQuery({
    queryKey: ["schemes", "eligibility"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Pull every scheme — RLS already restricts to "Schemes are public".
      const { data, error } = await supabase
        .from("schemes")
        .select("id, name, category, description, is_verified, eligibility_criteria, allowed_states, target_area, requires_bpl")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as SchemeRow[];
    },
  });

  /**
   * Compute every scheme's score against the current form values.
   * Memoised so the work is redone only when the form or the scheme list
   * actually changes — important because this runs on every keystroke.
   */
  const scoredAll = useMemo(() => {
    return schemes.map((s) => ({
      ...s,
      score: calculateScore(form, s),
    }));
  }, [schemes, form]);

  /**
   * Build the visible match list.
   *
   * Sprint 5 Change #2 — when prioritySearch is non-empty it becomes a HARD
   * FILTER: only schemes that match the term by category/name/description
   * appear, sorted by score desc (including score 0). The category filter
   * dropdown is hidden in this mode and is bypassed here defensively.
   */
  const visibleMatches = useMemo(() => {
    const term = (form.prioritySearch ?? "").trim().toLowerCase();

    if (term) {
      // HARD FILTER MODE — restrict to category/name/desc matches.
      const matchesTerm = (s: SchemeRow) =>
        (s.category ?? "").toLowerCase().includes(term) ||
        (s.name ?? "").toLowerCase().includes(term) ||
        (s.description ?? "").toLowerCase().includes(term);
      return scoredAll.filter(matchesTerm).sort((a, b) => b.score - a.score);
    }

    // NORMAL RANKING MODE — apply the category dropdown then threshold.
    let list = scoredAll;
    if (filterCategory !== "All Categories") {
      list = list.filter((s) => (s.category ?? "") === filterCategory);
    }
    list = list.filter((s) => s.score >= ELIGIBILITY_THRESHOLD);
    return [...list].sort((a, b) => b.score - a.score);
  }, [scoredAll, filterCategory, form.prioritySearch]);

  // -------- Validation helpers --------

  /**
   * Validate the form. Returns the first invalid field key (so we can scroll
   * to it) and populates the `errors` state with every missing field.
   */
  function validate(): RequiredKey | null {
    const next: Partial<Record<RequiredKey, string>> = {};
    const MISSING = "Needs to be filled in";

    if (!form.name?.trim()) next.name = MISSING;
    if (!form.age || form.age <= 0) next.age = MISSING;
    if (!form.stateOfResidence) next.stateOfResidence = MISSING;
    if (!form.areaType) next.areaType = MISSING;
    if (!form.annualIncome && form.annualIncome !== 0) next.annualIncome = MISSING;
    // annualIncome can legitimately be 0; only undefined/empty triggers error
    if (form.annualIncome === undefined || form.annualIncome === null || Number.isNaN(form.annualIncome)) {
      next.annualIncome = MISSING;
    }
    if (!form.category) next.category = MISSING;
    if (form.isBpl === undefined) next.isBpl = MISSING;

    // Conditional required fields driven by BPL answer
    if (form.isBpl === true && form.isDistressed === undefined) {
      next.isDistressed = MISSING;
    }
    if (form.isBpl === false) {
      if (form.familyAnnualIncome === undefined || form.familyAnnualIncome === null || Number.isNaN(form.familyAnnualIncome as number)) {
        next.familyAnnualIncome = MISSING;
      }
      // Guardian: either an income value OR Not Applicable selected.
      const hasGuardianValue =
        form.guardianAnnualIncome !== undefined &&
        form.guardianAnnualIncome !== null &&
        !Number.isNaN(form.guardianAnnualIncome as number);
      if (!hasGuardianValue && !form.guardianNotApplicable) {
        next.guardianAnnualIncome = MISSING;
      }
    }

    setErrors(next);
    // Return the first key in the order they're listed above (object insertion order).
    const first = Object.keys(next)[0] as RequiredKey | undefined;
    return first ?? null;
  }

  /** Clear the error for a single field — called from each onChange. */
  function clearError(key: RequiredKey) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const { [key]: _omit, ...rest } = prev;
      return rest;
    });
  }

  /**
   * Persist the submission to Supabase for logged-in users.
   * Wrapped in try/catch with a toast — never blocks the UX.
   */
  async function persistSubmission() {
    if (!user) return; // guests stay client-side per spec
    try {
      const { error } = await supabase.from("eligibility_submissions").insert({
        user_id: user.id,
        full_name: form.name ?? null,
        age: form.age || null,
        gender: form.gender || null,
        state_of_residence: form.stateOfResidence || null,
        area_type: form.areaType || null,
        category: form.category || null,
        occupation: form.occupation || null,
        disability: !!form.disability,
        annual_income: form.annualIncome ?? null,
        is_bpl: form.isBpl ?? null,
        is_distressed: form.isDistressed ?? null,
        family_annual_income: form.familyAnnualIncome ?? null,
        guardian_annual_income: form.guardianAnnualIncome ?? null,
        guardian_not_applicable: !!form.guardianNotApplicable,
        priority_search: form.prioritySearch?.trim() || null,
      });
      if (error) throw error;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save submission";
      toast({ title: "Saved locally only", description: msg, variant: "destructive" });
    }
  }

  /**
   * Submit handler. Runs validation, scrolls to the first error if any,
   * otherwise reveals the matches panel and persists the row.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const firstBad = validate();
    if (firstBad) {
      // Scroll the first invalid field into view, smoothly.
      const node = fieldRefs.current[firstBad];
      if (node && typeof node.scrollIntoView === "function") {
        node.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    setHasSubmitted(true);
    await persistSubmission();
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      document.getElementById("matches-panel")?.scrollIntoView({ behavior: "smooth" });
    }
  }

  // True when the priority search is acting as a hard filter — we use this
  // to hide the "Filter results by" dropdown per spec change #2.
  const priorityActive = !!(form.prioritySearch ?? "").trim();

  return (
    <div className="container py-10 animate-fade-in">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-primary">{t("elig.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("elig.subtitle")}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* =============================================================
             LEFT COLUMN — Eligibility form
             ============================================================= */}
        <Card className="shadow-elegant">
          <CardHeader className="bg-primary text-primary-foreground rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" /> Eligibility form
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2" noValidate>
              {/* Full Name (required) */}
              <Field
                label={t("elig.name")} id="name" required
                error={errors.name}
                refCb={(el) => (fieldRefs.current.name = el)}
              >
                <Input
                  id="name"
                  value={form.name ?? ""}
                  className={cn(errors.name && "border-destructive")}
                  onChange={(e) => { clearError("name"); setForm({ ...form, name: e.target.value }); }}
                />
              </Field>

              {/* Age (required) */}
              <Field
                label={t("elig.age")} id="age" required
                error={errors.age}
                refCb={(el) => (fieldRefs.current.age = el)}
              >
                <Input
                  id="age" type="number" min={0} max={120}
                  value={form.age || ""}
                  className={cn(errors.age && "border-destructive")}
                  onChange={(e) => { clearError("age"); setForm({ ...form, age: Number(e.target.value) }); }}
                />
              </Field>

              {/* State of Residence (required) */}
              <Field
                label="State of Residence" id="state" required
                error={errors.stateOfResidence}
                refCb={(el) => (fieldRefs.current.stateOfResidence = el)}
              >
                <Select
                  value={form.stateOfResidence ?? ""}
                  onValueChange={(v) => { clearError("stateOfResidence"); setForm({ ...form, stateOfResidence: v }); }}
                >
                  <SelectTrigger id="state" className={cn(errors.stateOfResidence && "border-destructive")}>
                    <SelectValue placeholder="Select state / UT" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {INDIAN_STATES_AND_UTS.map((st) => (
                      <SelectItem key={st} value={st}>{st}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {/* Area Type (Urban / Rural) — required */}
              <Field
                label="Area Type" id="area" required
                error={errors.areaType}
                refCb={(el) => (fieldRefs.current.areaType = el)}
              >
                <PillToggle
                  value={form.areaType ?? ""}
                  options={["Urban", "Rural"]}
                  errored={!!errors.areaType}
                  onChange={(v) => { clearError("areaType"); setForm({ ...form, areaType: v as "Urban" | "Rural" }); }}
                />
              </Field>

              {/* Gender (NOT required — no asterisk) */}
              <Field label={t("elig.gender")} id="gender">
                <Select value={form.gender ?? ""} onValueChange={(v) => setForm({ ...form, gender: v })}>
                  <SelectTrigger id="gender"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {/* Annual Income (personal — required) */}
              <Field
                label={t("elig.income")} id="income" required
                error={errors.annualIncome}
                refCb={(el) => (fieldRefs.current.annualIncome = el)}
              >
                <Input
                  id="income" type="number" min={0}
                  placeholder="Enter amount"
                  value={form.annualIncome || ""}
                  className={cn(errors.annualIncome && "border-destructive")}
                  onChange={(e) => { clearError("annualIncome"); setForm({ ...form, annualIncome: Number(e.target.value) }); }}
                />
              </Field>

              {/* BPL Yes/No — required, drives conditional rendering below */}
              <div className="sm:col-span-2" ref={(el) => (fieldRefs.current.isBpl = el)}>
                <Field label="Below Poverty Line (BPL)" id="bpl" required error={errors.isBpl}>
                  <YesNoToggle
                    value={form.isBpl}
                    errored={!!errors.isBpl}
                    onChange={setBpl}
                  />
                </Field>

                {/* ---- Conditional region: animated open/close (150ms) ---- */}
                <div
                  className={cn(
                    "mt-4 grid gap-4 transition-all duration-150 ease-out",
                    form.isBpl === undefined ? "opacity-0 pointer-events-none max-h-0" : "opacity-100 max-h-[800px]",
                  )}
                  aria-hidden={form.isBpl === undefined}
                >
                  {form.isBpl === true && (
                    <Field
                      label="Are you in any of the following condition — Destitute / Penury / Extreme Hardship / Distress"
                      id="distressed"
                      required
                      error={errors.isDistressed}
                      refCb={(el) => (fieldRefs.current.isDistressed = el)}
                    >
                      <YesNoToggle
                        value={form.isDistressed}
                        errored={!!errors.isDistressed}
                        onChange={(v) => { clearError("isDistressed"); setForm({ ...form, isDistressed: v }); }}
                      />
                    </Field>
                  )}

                  {form.isBpl === false && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {/* Family Annual Income */}
                      <Field
                        label="Annual Family Income (₹)"
                        id="familyIncome"
                        required
                        error={errors.familyAnnualIncome}
                        refCb={(el) => (fieldRefs.current.familyAnnualIncome = el)}
                      >
                        <Input
                          id="familyIncome"
                          type="number"
                          min={0}
                          placeholder="Enter amount"
                          value={form.familyAnnualIncome ?? ""}
                          className={cn(errors.familyAnnualIncome && "border-destructive")}
                          onChange={(e) => {
                            clearError("familyAnnualIncome");
                            const raw = e.target.value;
                            setForm({ ...form, familyAnnualIncome: raw === "" ? null : Number(raw) });
                          }}
                        />
                      </Field>

                      {/* Parent / Guardian Annual Income with inline NA pill */}
                      <Field
                        label="Parent / Guardian Annual Income (₹)"
                        id="guardianIncome"
                        required
                        error={errors.guardianAnnualIncome}
                        refCb={(el) => (fieldRefs.current.guardianAnnualIncome = el)}
                      >
                        <div className="flex gap-2">
                          <Input
                            id="guardianIncome"
                            type="number"
                            min={0}
                            placeholder="Enter amount"
                            disabled={!!form.guardianNotApplicable}
                            value={form.guardianAnnualIncome ?? ""}
                            className={cn(
                              "flex-1",
                              errors.guardianAnnualIncome && "border-destructive",
                              form.guardianNotApplicable && "bg-muted text-muted-foreground",
                            )}
                            onChange={(e) => {
                              clearError("guardianAnnualIncome");
                              const raw = e.target.value;
                              setForm({ ...form, guardianAnnualIncome: raw === "" ? null : Number(raw) });
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              clearError("guardianAnnualIncome");
                              autoSetByAgeRef.current = false; // user is overriding manually
                              const next = !form.guardianNotApplicable;
                              setForm({
                                ...form,
                                guardianNotApplicable: next,
                                // Clear the input value when switching to NA
                                guardianAnnualIncome: next ? null : form.guardianAnnualIncome,
                              });
                            }}
                            className={cn(
                              "rounded-md border px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                              form.guardianNotApplicable
                                ? "border-primary bg-secondary font-bold text-primary"
                                : "border-border bg-card text-muted-foreground hover:text-foreground",
                            )}
                            aria-pressed={!!form.guardianNotApplicable}
                          >
                            Not Applicable
                          </button>
                        </div>
                      </Field>
                    </div>
                  )}
                </div>
              </div>

              {/* Category (required) */}
              <Field
                label={t("elig.category")} id="cat" required
                error={errors.category}
                refCb={(el) => (fieldRefs.current.category = el)}
              >
                <Select
                  value={form.category}
                  onValueChange={(v) => { clearError("category"); setForm({ ...form, category: v }); }}
                >
                  <SelectTrigger id="cat" className={cn(errors.category && "border-destructive")}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {/* Occupation (NOT required) */}
              <Field label={t("elig.occupation")} id="occ">
                <Input id="occ" placeholder="e.g. Farmer, Student" value={form.occupation}
                  onChange={(e) => setForm({ ...form, occupation: e.target.value })} />
              </Field>

              {/* Disability switch — full row, NOT required */}
              <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-4 py-3">
                <div>
                  <Label htmlFor="dis" className="font-medium">{t("elig.disability")}</Label>
                  <p className="text-xs text-muted-foreground">Toggle on if you have a 40%+ disability certificate.</p>
                </div>
                <Switch id="dis" checked={form.disability}
                  onCheckedChange={(v) => setForm({ ...form, disability: v })} />
              </div>

              <Button type="submit" size="lg" className="sm:col-span-2 tap-target font-semibold">
                {t("elig.submit")} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

              {/* Optional "Looking for something specific?" — hard filter mode */}
              <div className="sm:col-span-2 mt-2 rounded-lg border border-border bg-secondary/30 p-4">
                <h3 className="text-base font-bold text-primary">Looking for something specific?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Optional — prioritise a particular scheme or sector in your results.
                </p>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="priority"
                    className="pl-9"
                    placeholder="e.g. agriculture, scholarship, health insurance"
                    value={form.prioritySearch ?? ""}
                    onChange={(e) => setForm({ ...form, prioritySearch: e.target.value })}
                  />
                </div>
                {/* Helper text — small, light grey, explains the hard-filter behaviour. */}
                <p className="mt-2 text-xs text-[#6B7280]">
                  * If filled, only schemes matching this term will be shown — eligibility ranking and the filter will be disabled.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* =============================================================
             RIGHT COLUMN — Live matches + filter + Browse all section
             ============================================================= */}
        <div id="matches-panel" className="space-y-4">
          <Card className="shadow-elegant">
            <CardHeader className="bg-secondary rounded-t-lg">
              <CardTitle className="flex items-center justify-between gap-3 text-primary">
                <span className="truncate">{t("elig.matches")}</span>

                <div className="flex items-center gap-2">
                  {/* Filter dropdown — hidden when priority search is active. */}
                  {hasSubmitted && !priorityActive && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="filter" className="hidden text-xs font-medium text-primary sm:inline">
                        Filter results by
                      </Label>
                      <Select
                        value={filterCategory}
                        onValueChange={(v) => setFilterCategory(v as typeof FILTER_OPTIONS[number])}
                      >
                        <SelectTrigger id="filter" className="h-8 w-[160px] bg-card text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FILTER_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Badge variant="secondary" className="bg-primary text-primary-foreground">
                    {hasSubmitted ? visibleMatches.length : 0}
                  </Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 max-h-[640px] overflow-auto space-y-3">
              {/* Pre-submit state — single explanatory sentence, per spec change #6. */}
              {!hasSubmitted && (
                <p className="text-sm text-muted-foreground">
                  Fill out the form on the left to see schemes tailored to your profile, or browse the full directory below.
                </p>
              )}

              {hasSubmitted && isLoading && (
                <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
              )}

              {hasSubmitted && !isLoading && visibleMatches.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {priorityActive
                    ? `No schemes matched "${form.prioritySearch?.trim()}".`
                    : "No eligible schemes for this filter. Try \"All Categories\" or adjust your form."}
                </p>
              )}

              {hasSubmitted && visibleMatches.map((s) => (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/schemes/${s.id}`)}
                  onKeyDown={(e) => {
                    // Keyboard accessibility — Enter / Space activates the card.
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/schemes/${s.id}`);
                    }
                  }}
                  className="cursor-pointer rounded-lg border border-border bg-card p-3 transition-all hover:border-[#AACDE0] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm flex items-center gap-1.5">
                        {s.name}
                        {s.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-accent shrink-0" />}
                      </p>
                      <p className="text-xs text-muted-foreground">{s.category}</p>
                    </div>
                    <span className="text-sm font-bold text-primary tabular-nums">{s.score}</span>
                  </div>
                  <Progress value={s.score} className="mt-2 h-1.5" />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Sprint 5 Change #6 — "Browse all schemes" — ALWAYS visible. */}
          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <Compass className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-[18px] font-bold text-primary">Browse all schemes</h3>
                  <p className="mt-1 text-[13px] text-[#6B7280]">
                    Explore the full directory of available government welfare schemes.
                  </p>
                  <Button
                    type="button"
                    size="lg"
                    className="mt-4 font-semibold"
                    onClick={() => navigate("/schemes")}
                  >
                    Browse All Schemes <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Local helpers
   ============================================================ */

/** Default empty form values — keeps the constructor in one place. */
function defaultForm(): UserForm {
  return {
    name: "",
    age: 0,
    gender: "",
    annualIncome: 0,
    category: "General",
    occupation: "",
    disability: false,
    stateOfResidence: "",
    areaType: "",
    isBpl: undefined, // explicit undefined so the BPL toggle starts unselected
    isDistressed: undefined,
    familyAnnualIncome: null,
    guardianAnnualIncome: null,
    guardianNotApplicable: false,
    prioritySearch: "",
  };
}

/**
 * Field
 * ------------------------------------------------------------
 * Tiny labelled-field helper. Adds:
 *   • Red asterisk when `required`.
 *   • "Needs to be filled in" red error message when `error` is set.
 *   • Optional ref callback so the parent can scroll to it on submit.
 */
function Field({
  label, id, required, children, error, refCb,
}: {
  label: string;
  id: string;
  required?: boolean;
  children: React.ReactNode;
  error?: string;
  refCb?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="space-y-1.5" ref={refCb}>
      <Label htmlFor={id} className="text-sm font-medium">
        {required && <span className="mr-0.5 text-[#DC2626]">*</span>}
        {label}
      </Label>
      {children}
      {error && (
        <p className="mt-1 text-[12px] text-[#DC2626]">{error}</p>
      )}
    </div>
  );
}

/**
 * PillToggle
 * ------------------------------------------------------------
 * Generic two-option pill segmented control. Used by the Area Type
 * field. When `errored` is true we tint the container border red so
 * the validation message has visual context.
 */
function PillToggle({
  value, options, onChange, errored,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  errored?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex w-full rounded-lg border bg-secondary/40 p-1",
        errored ? "border-[#DC2626]" : "border-border",
      )}
    >
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={active}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/**
 * YesNoToggle
 * ------------------------------------------------------------
 * Two-button Yes/No control used by BPL and the Distress question.
 * Per spec:
 *   • Both buttons are white with a thin grey border.
 *   • Selected option gets a green border (#16A34A) + pale green
 *     fill (#F0FDF4) and bold green text.
 *   • Unselected stays white with grey text.
 *   • When `errored`, the unselected baseline border is red.
 *
 * Accepts `value` of true | false | undefined so an unanswered field
 * can start with neither button selected.
 */
function YesNoToggle({
  value, onChange, errored,
}: {
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  errored?: boolean;
}) {
  const base =
    "flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const inactive = errored
    ? "border-[#DC2626] bg-card text-muted-foreground"
    : "border-border bg-card text-muted-foreground hover:text-foreground";

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={cn(
          base,
          value === true ? "border-[#16A34A] bg-[#F0FDF4] font-bold text-[#16A34A]" : inactive,
        )}
        aria-pressed={value === true}
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={cn(
          base,
          value === false ? "border-[#16A34A] bg-[#F0FDF4] font-bold text-[#16A34A]" : inactive,
        )}
        aria-pressed={value === false}
      >
        No
      </button>
    </div>
  );
}
