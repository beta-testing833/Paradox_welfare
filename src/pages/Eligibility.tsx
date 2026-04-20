/**
 * Eligibility.tsx
 * ----------------------------------------------------------------------------
 * Route: /eligibility
 *
 * Sprint 4 update — adds 6 new capabilities while preserving the existing
 * navy + white visual language:
 *   1. State of Residence dropdown (required)
 *   2. Urban / Rural pill toggle      (required)
 *   3. Expanded Category list including PVTG and DNT (required)
 *   4. Below Poverty Line Yes/No toggle (required)
 *   5. Results-filter pill inside the "Your Matches" header
 *   6. "Looking for something specific?" optional priority-search field
 *      → boosts matching schemes to the top AND surfaces ineligible schemes
 *        in a dedicated "Other schemes in your preferred field" rail.
 *
 * Form state is persisted to sessionStorage so the user can revisit the page
 * without retyping. All scheme data is fetched live from Supabase via
 * react-query — no localStorage caching of server data.
 */
import { useEffect, useMemo, useState } from "react";
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
import {
  calculateScore,
  explainIneligibility,
  ELIGIBILITY_THRESHOLD,
  type UserForm,
  type ScoreableScheme,
} from "@/lib/eligibilityScorer";
import { INDIAN_STATES_AND_UTS } from "@/lib/indianStates";
import { BadgeCheck, Sparkles, ArrowRight, Search } from "lucide-react";
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

export default function Eligibility() {
  const { t } = useLanguage();
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
  // The results filter only renders after the first submission, per spec.
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Active value of the "Filter results by" dropdown in the Matches panel.
  const [filterCategory, setFilterCategory] =
    useState<typeof FILTER_OPTIONS[number]>("All Categories");

  // ---- Live Supabase query: load every scheme once, score them client-side. ----
  // We select the four new Sprint-4 columns explicitly so the scorer has them.
  const { data: schemes = [], isLoading } = useQuery({
    queryKey: ["schemes", "eligibility"],
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
   * Build the visible match list:
   *   1. Apply the category filter if not "All Categories".
   *   2. Keep only eligible schemes (score ≥ threshold).
   *   3. If a priority search is set, push schemes matching the term to the
   *      top regardless of score order. Within each rail (priority hits vs
   *      everything else), sort by score descending.
   */
  const visibleMatches = useMemo(() => {
    const term = (form.prioritySearch ?? "").trim().toLowerCase();

    // Step 1: client-side category filter (no extra Supabase round-trip).
    let list = scoredAll;
    if (filterCategory !== "All Categories") {
      list = list.filter((s) => (s.category ?? "") === filterCategory);
    }

    // Step 2: only eligible schemes appear in the primary list.
    list = list.filter((s) => s.score >= ELIGIBILITY_THRESHOLD);

    // Step 3: priority boost.
    if (term) {
      const matchesTerm = (s: SchemeRow) =>
        (s.category ?? "").toLowerCase().includes(term) ||
        (s.name ?? "").toLowerCase().includes(term) ||
        (s.description ?? "").toLowerCase().includes(term);

      const priority = list.filter(matchesTerm).sort((a, b) => b.score - a.score);
      const rest = list.filter((s) => !matchesTerm(s)).sort((a, b) => b.score - a.score);
      return [...priority, ...rest];
    }

    // No priority term → just sort by score descending.
    return [...list].sort((a, b) => b.score - a.score);
  }, [scoredAll, filterCategory, form.prioritySearch]);

  /**
   * "Other schemes in the {term} field you are not currently eligible for."
   * Only computed when prioritySearch is non-empty; lists schemes that match
   * the term by category/name/description but failed the score threshold.
   */
  const ineligiblePriorityMatches = useMemo(() => {
    const term = (form.prioritySearch ?? "").trim().toLowerCase();
    if (!term) return [];
    return scoredAll
      .filter((s) => s.score < ELIGIBILITY_THRESHOLD)
      .filter(
        (s) =>
          (s.category ?? "").toLowerCase().includes(term) ||
          (s.name ?? "").toLowerCase().includes(term) ||
          (s.description ?? "").toLowerCase().includes(term),
      )
      .map((s) => ({ ...s, reason: explainIneligibility(form, s) ?? "Not eligible" }));
  }, [scoredAll, form]);

  /**
   * Submit handler. We DO NOT navigate away — the matches panel on the right
   * already shows live results. We simply flip `hasSubmitted` so the filter
   * pill reveals itself, and scroll the matches into view on small screens.
   */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setHasSubmitted(true);
    // On mobile, jump down to the matches panel so the user sees the result.
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      document.getElementById("matches-panel")?.scrollIntoView({ behavior: "smooth" });
    }
  }

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
            <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
              {/* Full Name (existing) */}
              <Field label={t("elig.name")} id="name">
                <Input id="name" required value={form.name ?? ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>

              {/* Age (existing) — required */}
              <Field label={t("elig.age")} id="age" required>
                <Input id="age" type="number" min={0} max={120} required value={form.age || ""}
                  onChange={(e) => setForm({ ...form, age: Number(e.target.value) })} />
              </Field>

              {/* NEW #1 — State of Residence (required) */}
              <Field label="State of Residence" id="state" required>
                <Select
                  value={form.stateOfResidence ?? ""}
                  onValueChange={(v) => setForm({ ...form, stateOfResidence: v })}
                >
                  <SelectTrigger id="state"><SelectValue placeholder="Select state / UT" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {INDIAN_STATES_AND_UTS.map((st) => (
                      <SelectItem key={st} value={st}>{st}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {/* NEW #2 — Area Type (Urban / Rural) pill toggle, required */}
              <Field label="Area Type" id="area" required>
                <PillToggle
                  value={form.areaType ?? ""}
                  options={["Urban", "Rural"]}
                  onChange={(v) => setForm({ ...form, areaType: v as "Urban" | "Rural" })}
                />
              </Field>

              {/* Gender (existing) */}
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

              {/* Annual Income (existing) — required */}
              <Field label={t("elig.income")} id="income" required>
                <Input id="income" type="number" min={0} required value={form.annualIncome || ""}
                  onChange={(e) => setForm({ ...form, annualIncome: Number(e.target.value) })} />
              </Field>

              {/* NEW #4 — Below Poverty Line (BPL) Yes/No toggle, required.
                  Renders full-width so the labels breathe on mobile. */}
              <div className="sm:col-span-2">
                <Field label="Below Poverty Line (BPL)" id="bpl" required>
                  <YesNoToggle
                    value={form.isBpl}
                    onChange={(v) => setForm({ ...form, isBpl: v })}
                  />
                </Field>
              </div>

              {/* Category (existing, expanded) — required */}
              <Field label={t("elig.category")} id="cat" required>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger id="cat"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {/* Occupation (existing) */}
              <Field label={t("elig.occupation")} id="occ">
                <Input id="occ" placeholder="e.g. Farmer, Student" value={form.occupation}
                  onChange={(e) => setForm({ ...form, occupation: e.target.value })} />
              </Field>

              {/* Disability switch (existing) — full row */}
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

              {/* NEW #6 — Optional "Looking for something specific?" section.
                  Sits BELOW the submit button as per spec. No asterisk. */}
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
              </div>
            </form>
          </CardContent>
        </Card>

        {/* =============================================================
             RIGHT COLUMN — Live matches + filter + ineligible rail
             ============================================================= */}
        <div id="matches-panel" className="space-y-4">
          <Card className="shadow-elegant">
            <CardHeader className="bg-secondary rounded-t-lg">
              <CardTitle className="flex items-center justify-between gap-3 text-primary">
                <span className="truncate">{t("elig.matches")}</span>

                <div className="flex items-center gap-2">
                  {/* NEW #5 — Filter dropdown lives in the panel header.
                      Only revealed once the user has submitted at least once. */}
                  {hasSubmitted && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="filter" className="hidden text-xs font-medium text-primary sm:inline">
                        <span className="text-destructive">*</span> Filter results by
                      </Label>
                      <Select
                        value={filterCategory}
                        onValueChange={(v) => setFilterCategory(v as typeof FILTER_OPTIONS[number])}
                      >
                        <SelectTrigger
                          id="filter"
                          className="h-8 w-[160px] bg-card text-xs"
                        >
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
                    {visibleMatches.length}
                  </Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 max-h-[640px] overflow-auto space-y-3">
              {isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}

              {/* Empty-state copy — shown until the user starts entering data. */}
              {!isLoading && !hasSubmitted && visibleMatches.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("elig.matches.empty")}</p>
              )}

              {!isLoading && hasSubmitted && visibleMatches.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No eligible schemes for this filter. Try "All Categories" or adjust your form.
                </p>
              )}

              {visibleMatches.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-secondary/40"
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

          {/* "Other schemes in the {term} field" — only when priority search active */}
          {ineligiblePriorityMatches.length > 0 && (
            <Card className="border-border/70 bg-muted/40 shadow-sm">
              <CardHeader className="rounded-t-lg bg-muted/60">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Other schemes in the "{form.prioritySearch?.trim()}" field you are not currently eligible for
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                {ineligiblePriorityMatches.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-md border border-border/60 bg-card/70 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground/80">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.category}</p>
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                        {s.score}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground italic">Reason: {s.reason}</p>
                  </div>
                ))}
                <Button
                  variant="link"
                  size="sm"
                  className="px-0 text-xs"
                  onClick={() => navigate("/schemes")}
                >
                  Browse all schemes →
                </Button>
              </CardContent>
            </Card>
          )}
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
    isBpl: false,
    prioritySearch: "",
  };
}

/**
 * Field
 * ------------------------------------------------------------
 * Tiny labelled-field helper to keep the form JSX readable.
 * When `required` is true we render a small red asterisk before
 * the label text, matching the spec's #DC2626 colour.
 */
function Field({
  label, id, required, children,
}: {
  label: string;
  id: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {required && <span className="mr-0.5 text-destructive">*</span>}
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * PillToggle
 * ------------------------------------------------------------
 * Generic two/three-option pill segmented control. Used by the
 * Area Type field (Urban / Rural). Visually mirrors the Disability
 * Switch container so the form feels consistent.
 */
function PillToggle({
  value, options, onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex w-full rounded-lg border border-border bg-secondary/40 p-1">
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
 * Two-button Yes/No control for the BPL field. Per spec:
 *   • Both buttons are white with a thin grey border.
 *   • Selected option gets a green border (#16A34A) + pale green
 *     fill (#F0FDF4) and bold green text.
 *   • Unselected stays white with grey text.
 * We hard-code the green here because the project's success token
 * is a different shade reserved for the Verified badge.
 */
function YesNoToggle({
  value, onChange,
}: {
  value: boolean | undefined;
  onChange: (v: boolean) => void;
}) {
  // Shared base for both pills — white background, rounded corners, etc.
  const base =
    "flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={cn(
          base,
          value === true
            ? "border-[#16A34A] bg-[#F0FDF4] font-bold text-[#16A34A]"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
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
          value === false
            ? "border-[#16A34A] bg-[#F0FDF4] font-bold text-[#16A34A]"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={value === false}
      >
        No
      </button>
    </div>
  );
}
