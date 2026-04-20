/**
 * Status.tsx
 * ----------------------------------------------------------------------------
 * Route: /status (protected)
 *
 * Lists every application the current user has submitted, with a horizontal
 * pipeline visual: Draft → Submitted → Under Review → Approved / Rejected.
 * The current stage is highlighted in navy.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = ["Draft", "Submitted", "Under Review", "Approved"] as const;

interface AppRow {
  id: string;
  status: string;
  applied_at: string;
  message: string | null;
  schemes: { name: string } | null;
  ngos: { name: string } | null;
}

export default function Status() {
  const { user } = useAuth();
  const { t } = useLanguage();

  // Fetch the user's applications joined with scheme + ngo for the labels.
  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["applications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("id,status,applied_at,message,schemes(name),ngos(name)")
        .eq("user_id", user!.id)
        .order("applied_at", { ascending: false });
      if (error) throw error;
      return data as unknown as AppRow[];
    },
    enabled: !!user,
  });

  return (
    <div className="container py-10 animate-fade-in">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-primary">{t("status.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("status.subtitle")}</p>
      </header>

      {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}
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
                  <p className="text-sm text-muted-foreground">
                    via <span className="font-medium text-foreground">{a.ngos?.name ?? "—"}</span>
                  </p>
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
                        isCurrent && "ring-2 ring-primary/30"
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
