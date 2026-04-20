/**
 * Status.tsx
 * ----------------------------------------------------------------------------
 * Route: /status (protected + Sprint-6 premium-gated visibility)
 *
 * Lists every application the current user has submitted, with a horizontal
 * pipeline visual: Draft → Submitted → Under Review → Approved / Rejected.
 *
 * Sprint 6 changes:
 *   • Without an active Premium subscription, the page is replaced with an
 *     upgrade prompt — the application history is part of the paid service.
 *   • Now shows the upcoming consultation date + slot when present.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ChevronRight, CalendarClock, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/hooks/useSubscription";

const STAGES = ["Draft", "Submitted", "Under Review", "Approved"] as const;

interface AppRow {
  id: string;
  status: string;
  applied_at: string;
  message: string | null;
  consultation_date: string | null;
  consultation_time_slot: string | null;
  consultation_status: string | null;
  schemes: { name: string } | null;
}

export default function Status() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { isActive, loading: subLoading } = useSubscription();

  // Only fire the query for premium users — saves a round-trip otherwise.
  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["applications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("id,status,applied_at,message,consultation_date,consultation_time_slot,consultation_status,schemes(name)")
        .eq("user_id", user!.id)
        .order("applied_at", { ascending: false });
      if (error) throw error;
      return data as unknown as AppRow[];
    },
    enabled: !!user && isActive,
  });

  // Premium gate — show upgrade prompt instead of the application list.
  if (!subLoading && !isActive) {
    return (
      <div className="container py-10 animate-fade-in">
        <Card className="mx-auto max-w-xl shadow-elegant">
          <CardContent className="space-y-4 p-8 text-center">
            <Lock className="mx-auto h-10 w-10 text-primary" />
            <h2 className="text-2xl font-bold text-primary">Premium feature</h2>
            <p className="text-sm text-muted-foreground">
              Application tracking and your booked consultation calls are part of
              WelfareConnect Premium. Subscribe to keep an eye on every
              application from one place.
            </p>
            <Button asChild size="lg" className="font-semibold">
              <Link to="/subscription">
                <Sparkles className="mr-2 h-4 w-4" /> See Premium plans
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-10 animate-fade-in">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-primary">{t("status.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("status.subtitle")}</p>
      </header>

      {(isLoading || subLoading) && <p className="text-muted-foreground">{t("common.loading")}</p>}
      {!isLoading && apps.length === 0 && (
        <Card className="shadow-elegant">
          <CardContent className="p-10 text-center text-muted-foreground">
            {t("status.empty")}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {apps.map((a) => (
          <Card key={a.id} className="shadow-elegant border-border/70">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-primary">{a.schemes?.name ?? "Scheme"}</h3>
                  {/* Show consultation booking when present (new in Sprint 6). */}
                  {a.consultation_date && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5 text-accent" />
                      Consultation: {new Date(a.consultation_date).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
                      {a.consultation_time_slot && ` · ${a.consultation_time_slot}`}
                      {a.consultation_status && (
                        <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                          {a.consultation_status}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <Badge className={statusColour(a.status)}>{a.status}</Badge>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("status.appliedOn")} {new Date(a.applied_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Pipeline */}
              <ol className="mt-5 flex flex-wrap items-center gap-2">
                {STAGES.map((stage, idx) => {
                  const reached = stageIndex(a.status) >= idx;
                  const isCurrent = a.status === stage || (a.status === "Rejected" && stage === "Approved");
                  return (
                    <li key={stage} className="flex items-center gap-2">
                      <div className={cn(
                        "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium border",
                        reached ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border",
                        isCurrent && "ring-2 ring-primary/30",
                      )}>
                        {reached && <Check className="h-3 w-3" />}
                        {a.status === "Rejected" && stage === "Approved" ? "Rejected" : stage}
                      </div>
                      {idx < STAGES.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** Map status → pipeline index for highlighting. */
function stageIndex(s: string): number {
  switch (s) {
    case "Draft": return 0;
    case "Submitted": return 1;
    case "Under Review": return 2;
    case "Approved":
    case "Rejected": return 3;
    default: return -1;
  }
}

/** Tailwind colour classes per status badge. */
function statusColour(s: string): string {
  switch (s) {
    case "Approved": return "bg-success text-success-foreground hover:bg-success";
    case "Rejected": return "bg-destructive text-destructive-foreground hover:bg-destructive";
    case "Under Review": return "bg-warning text-warning-foreground hover:bg-warning";
    default: return "bg-secondary text-secondary-foreground hover:bg-secondary";
  }
}
