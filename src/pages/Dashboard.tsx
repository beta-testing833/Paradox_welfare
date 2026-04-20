/**
 * Dashboard.tsx
 * ----------------------------------------------------------------------------
 * Route: /dashboard (protected)
 *
 * Cards (in the order specified by the spec):
 *   1. Schemes Applied         — total count of the user's applications.
 *   2. Application History     — table of scheme + applied date + status.
 *   3. Eligibility Score Summary — per-scheme 0–100 progress bars based on the
 *      most recent eligibility form (read from sessionStorage).
 *   4. Recommended Schemes     — schemes the user has not applied to yet,
 *      ranked by eligibility score.
 *   5. Quick Actions           — Check Eligibility Again, Update Profile.
 *   6. Document Vault          — every document the user has ever uploaded.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { calculateScore, type UserForm, type EligibilityCriteria } from "@/lib/eligibilityScorer";
import { FileText, Folder, History, ListChecks, Sparkles, Zap, BadgeCheck } from "lucide-react";
import ApplyButton from "@/components/ApplyButton";

const SESSION_KEY = "welfareconnect.elig.form";

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();

  // --- Applications + joined scheme name ---
  const { data: apps = [] } = useQuery({
    queryKey: ["dash-apps", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("id,status,applied_at,scheme_id,schemes(name)")
        .eq("user_id", user!.id)
        .order("applied_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  // --- All schemes ---
  const { data: schemes = [] } = useQuery({
    queryKey: ["dash-schemes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schemes").select("*");
      if (error) throw error;
      return data as any[];
    },
  });

  // --- Document vault: files across all the user's applications ---
  const { data: docs = [] } = useQuery({
    queryKey: ["dash-docs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("application_documents")
        .select("id,file_name,file_size_bytes,uploaded_at,application_id,applications!inner(user_id)")
        .eq("applications.user_id", user!.id)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  // Read the saved eligibility form from sessionStorage so we can score schemes.
  const form = useMemo<UserForm | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }, []);

  // Compute scores once, then split into "applied" vs "recommended".
  const scored = useMemo(() => {
    if (!form) return [];
    return schemes.map((s) => ({
      ...s,
      score: calculateScore(form, s.eligibility_criteria as EligibilityCriteria),
    })).sort((a, b) => b.score - a.score);
  }, [schemes, form]);

  const appliedSchemeIds = new Set(apps.map((a) => a.scheme_id));
  const recommended = scored.filter((s) => !appliedSchemeIds.has(s.id) && s.score >= 50).slice(0, 5);

  return (
    <div className="container py-10 animate-fade-in">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-primary">{t("dash.title")}</h1>
        <p className="mt-2 text-muted-foreground">Welcome back. Here's your activity at a glance.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 1. Schemes Applied */}
        <Card className="shadow-elegant lg:col-span-1 bg-gradient-hero text-primary-foreground">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-primary-foreground/80 text-sm">
              <ListChecks className="h-4 w-4" /> {t("dash.applied")}
            </div>
            <p className="mt-3 text-5xl font-extrabold tabular-nums">{apps.length}</p>
            <p className="mt-1 text-xs text-primary-foreground/70">total applications</p>
          </CardContent>
        </Card>

        {/* 5. Quick Actions */}
        <Card className="shadow-elegant lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Zap className="h-4 w-4 text-accent" /> {t("dash.quickActions")}</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild className="tap-target"><Link to="/eligibility">{t("dash.checkAgain")}</Link></Button>
            <Button asChild variant="outline" className="tap-target"><Link to="/profile">{t("dash.updateProfile")}</Link></Button>
            <Button asChild variant="ghost" className="tap-target"><Link to="/schemes">Browse all schemes</Link></Button>
          </CardContent>
        </Card>

        {/* 2. Application History */}
        <Card className="shadow-elegant lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-accent" /> {t("dash.history")}</CardTitle></CardHeader>
          <CardContent>
            {apps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No applications yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-secondary/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-primary">Scheme</th>
                      <th className="px-3 py-2 text-left font-medium text-primary">Applied</th>
                      <th className="px-3 py-2 text-left font-medium text-primary">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apps.map((a) => (
                      <tr key={a.id} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2">{a.schemes?.name ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{new Date(a.applied_at).toLocaleDateString()}</td>
                        <td className="px-3 py-2"><Badge variant="secondary">{a.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Eligibility Score Summary */}
        <Card className="shadow-elegant lg:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-accent" /> {t("dash.scoreSummary")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!form && <p className="text-sm text-muted-foreground">Fill the eligibility form to see your scores.</p>}
            {form && scored.slice(0, 5).map((s) => (
              <div key={s.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate">{s.name}</span>
                  <span className="font-bold tabular-nums text-primary">{s.score}</span>
                </div>
                <Progress value={s.score} className="mt-1 h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 4. Recommended Schemes */}
        <Card className="shadow-elegant lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><BadgeCheck className="h-4 w-4 text-accent" /> {t("dash.recommended")}</CardTitle></CardHeader>
          <CardContent>
            {recommended.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {form ? "No new recommendations right now — you've applied to your top matches." : "Fill the eligibility form to get tailored recommendations."}
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {recommended.map((s) => (
                  <li key={s.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium">{s.name}</p>
                      <Badge className="bg-success text-success-foreground">{s.score}% match</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.category}</p>
                    <div className="mt-2">
                      <ApplyButton scheme={{ id: s.id, name: s.name }} size="sm" className="w-full font-semibold" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 6. Document Vault */}
        <Card className="shadow-elegant lg:col-span-3">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Folder className="h-4 w-4 text-accent" /> {t("dash.docVault")}</CardTitle></CardHeader>
          <CardContent>
            {docs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate">{d.file_name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(d.uploaded_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
