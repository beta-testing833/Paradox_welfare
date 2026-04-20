/**
 * Eligibility.tsx
 * ----------------------------------------------------------------------------
 * Route: /eligibility
 *
 * Left:  Form capturing Name, Age, Gender, Annual Income, Category, Occupation,
 *        Disability Status. Submit ("Find Schemes") routes to /schemes — never
 *        to NGO Partners (this was the Week-3 routing bug we explicitly fix).
 * Right: Live "Your Matches" panel re-computing 0–100 scores per scheme as the
 *        user types, using calculateScore() from src/lib/eligibilityScorer.ts.
 *
 * The matched-form is also saved to sessionStorage so the Dashboard's
 * "Eligibility Score Summary" and "Recommended Schemes" cards can reuse it.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { calculateScore, type UserForm, type EligibilityCriteria } from "@/lib/eligibilityScorer";
import { BadgeCheck, Sparkles, ArrowRight } from "lucide-react";

const SESSION_KEY = "welfareconnect.elig.form";

export default function Eligibility() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Hydrate the form from sessionStorage so the user can return without retyping.
  const [form, setForm] = useState<UserForm>(() => {
    if (typeof window === "undefined") return defaultForm();
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? { ...defaultForm(), ...JSON.parse(raw) } : defaultForm();
  });

  // Persist every keystroke so the data survives navigation.
  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(form));
  }, [form]);

  // Fetch all schemes for live scoring. Cached by react-query.
  const { data: schemes = [], isLoading } = useQuery({
    queryKey: ["schemes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schemes").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Compute scores for every scheme. Memoised so we don't redo the work
  // unnecessarily on every keystroke when nothing relevant changed.
  const scored = useMemo(() => {
    return schemes
      .map((s) => ({
        ...s,
        score: calculateScore(form, s.eligibility_criteria as EligibilityCriteria),
      }))
      .sort((a, b) => b.score - a.score);
  }, [schemes, form]);

  /** Submit handler. Per spec: route to /schemes, NOT to NGO Partners. */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigate("/schemes");
  }

  return (
    <div className="container py-10 animate-fade-in">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-primary">{t("elig.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("elig.subtitle")}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* ---------- Form ---------- */}
        <Card className="shadow-elegant">
          <CardHeader className="bg-primary text-primary-foreground rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" /> Eligibility form
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
              <Field label={t("elig.name")} id="name">
                <Input id="name" required value={form.name ?? ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>

              <Field label={t("elig.age")} id="age">
                <Input id="age" type="number" min={0} max={120} required value={form.age || ""}
                  onChange={(e) => setForm({ ...form, age: Number(e.target.value) })} />
              </Field>

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

              <Field label={t("elig.income")} id="income">
                <Input id="income" type="number" min={0} required value={form.annualIncome || ""}
                  onChange={(e) => setForm({ ...form, annualIncome: Number(e.target.value) })} />
              </Field>

              <Field label={t("elig.category")} id="cat">
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger id="cat"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General">General</SelectItem>
                    <SelectItem value="OBC">OBC</SelectItem>
                    <SelectItem value="SC">SC</SelectItem>
                    <SelectItem value="ST">ST</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label={t("elig.occupation")} id="occ">
                <Input id="occ" placeholder="e.g. Farmer, Student" value={form.occupation}
                  onChange={(e) => setForm({ ...form, occupation: e.target.value })} />
              </Field>

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
            </form>
          </CardContent>
        </Card>

        {/* ---------- Live matches ---------- */}
        <Card className="shadow-elegant">
          <CardHeader className="bg-secondary rounded-t-lg">
            <CardTitle className="flex items-center justify-between text-primary">
              <span>{t("elig.matches")}</span>
              <Badge variant="secondary" className="bg-primary text-primary-foreground">{scored.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 max-h-[640px] overflow-auto space-y-3">
            {isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
            {!isLoading && (form.age === 0 && form.annualIncome === 0) && (
              <p className="text-sm text-muted-foreground">{t("elig.matches.empty")}</p>
            )}
            {scored.map((s) => (
              <div key={s.id} className="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-secondary/40">
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
      </div>
    </div>
  );
}

/** Default empty form values. */
function defaultForm(): UserForm {
  return { name: "", age: 0, gender: "", annualIncome: 0, category: "General", occupation: "", disability: false };
}

/** Tiny labelled-field helper to keep the form JSX readable. */
function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}
