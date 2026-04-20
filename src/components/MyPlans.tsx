/**
 * MyPlans.tsx
 * ----------------------------------------------------------------------------
 * Section embedded on /profile listing the user's active paid plans:
 *   • Active Saathi Plus subscription (if any)
 *   • Every active Saathi Pack (one card per pack)
 *
 * Each card shows: plan name, expiry, calls remaining (X of Y) with a
 * progress bar, visits remaining with a progress bar, and two top-up
 * buttons (₹50 per call, ₹249 per visit) that open PaymentModal scoped
 * to that specific row.
 *
 * If the user has no paid plan, we show a single "no plans" card linking
 * to /subscription.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import PaymentModal, { PaymentPurpose } from "@/components/PaymentModal";
import { PRICES } from "@/lib/concession";
import { Sparkles, Package } from "lucide-react";

interface PlusRow {
  id: string;
  expires_at: string;
  calls_total: number; calls_used: number;
  visits_total: number; visits_used: number;
}
interface PackRow extends PlusRow {
  scheme_id: string;
  schemes: { name: string } | null;
}

export default function MyPlans() {
  const { user } = useAuth();
  const [plus, setPlus] = useState<PlusRow | null>(null);
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Top-up modal state — selects WHICH row + which type of top-up.
  const [topup, setTopup] = useState<null | {
    purpose: PaymentPurpose;
    targetId: string;
    appliesTo: "saathi_plus_annual" | "scheme_pack";
    amount: number;
  }>(null);

  /** Fetch active Plus + active Packs in parallel. */
  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const nowIso = new Date().toISOString();
    const [plusRes, packsRes] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("id, expires_at, calls_total, calls_used, visits_total, visits_used")
        .eq("user_id", user.id)
        .eq("plan_type", "saathi_plus_annual")
        .eq("is_active", true)
        .gt("expires_at", nowIso)
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("scheme_packs")
        .select("id, scheme_id, expires_at, calls_total, calls_used, visits_total, visits_used, schemes(name)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .gt("expires_at", nowIso)
        .order("purchased_at", { ascending: false }),
    ]);
    setPlus((plusRes.data ?? null) as PlusRow | null);
    setPacks((packsRes.data ?? []) as unknown as PackRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading) return null;

  const hasAnyPlan = !!plus || packs.length > 0;

  return (
    <>
      <Card className="shadow-elegant">
        <CardHeader className="bg-primary text-primary-foreground rounded-t-lg">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> My Plans
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {!hasAnyPlan && (
            <div className="rounded-md border border-[#AACDE0] bg-[#D6E4F0]/30 p-4 text-center">
              <p className="text-sm text-primary font-semibold">No active plans</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Scheme discovery stays free. Upgrade when you're ready to apply.
              </p>
              <Button asChild className="mt-3" size="sm">
                <Link to="/subscription">View Plans</Link>
              </Button>
            </div>
          )}

          {/* Saathi Plus card */}
          {plus && (
            <PlanCard
              title="Saathi Plus (Annual)"
              subtitle={`Expires ${new Date(plus.expires_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`}
              callsTotal={plus.calls_total}
              callsUsed={plus.calls_used}
              visitsTotal={plus.visits_total}
              visitsUsed={plus.visits_used}
              onTopUpCall={() => setTopup({ purpose: "topup_call", targetId: plus.id, appliesTo: "saathi_plus_annual", amount: PRICES.topup_call })}
              onTopUpVisit={() => setTopup({ purpose: "topup_visit", targetId: plus.id, appliesTo: "saathi_plus_annual", amount: PRICES.topup_visit })}
            />
          )}

          {/* One card per active Pack */}
          {packs.map((p) => (
            <PlanCard
              key={p.id}
              icon="pack"
              title={`Pack — ${p.schemes?.name ?? "Scheme"}`}
              subtitle={`Expires ${new Date(p.expires_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`}
              callsTotal={p.calls_total}
              callsUsed={p.calls_used}
              visitsTotal={p.visits_total}
              visitsUsed={p.visits_used}
              onTopUpCall={() => setTopup({ purpose: "topup_call", targetId: p.id, appliesTo: "scheme_pack", amount: PRICES.topup_call })}
              onTopUpVisit={() => setTopup({ purpose: "topup_visit", targetId: p.id, appliesTo: "scheme_pack", amount: PRICES.topup_visit })}
            />
          ))}
        </CardContent>
      </Card>

      {topup && (
        <PaymentModal
          open
          onClose={() => setTopup(null)}
          amount={topup.amount}
          fullPrice={topup.amount}
          concessionApplied={false}
          concessionReason={null}
          purpose={topup.purpose}
          topupTargetId={topup.targetId}
          topupAppliesTo={topup.appliesTo}
          onSuccess={async () => {
            setTopup(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}

/** Reusable card body for one active plan. */
function PlanCard(props: {
  title: string; subtitle: string;
  callsTotal: number; callsUsed: number;
  visitsTotal: number; visitsUsed: number;
  onTopUpCall: () => void;
  onTopUpVisit: () => void;
  icon?: "plus" | "pack";
}) {
  const callsLeft = Math.max(0, props.callsTotal - props.callsUsed);
  const visitsLeft = Math.max(0, props.visitsTotal - props.visitsUsed);
  const callPct = props.callsTotal === 0 ? 0 : (props.callsUsed / props.callsTotal) * 100;
  const visitPct = props.visitsTotal === 0 ? 0 : (props.visitsUsed / props.visitsTotal) * 100;

  return (
    <div className="rounded-lg border border-[#AACDE0] bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold text-primary">
            {props.icon === "pack" ? <Package className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {props.title}
          </h3>
          <p className="text-xs text-muted-foreground">{props.subtitle}</p>
        </div>
        <Badge className="bg-[#16A34A] text-white hover:bg-[#16A34A]">Active</Badge>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Calls remaining</span>
            <span className="font-semibold text-primary">{callsLeft} of {props.callsTotal}</span>
          </div>
          <Progress value={callPct} className="mt-1 h-2" />
        </div>
        <div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Visits remaining</span>
            <span className="font-semibold text-primary">{visitsLeft} of {props.visitsTotal}</span>
          </div>
          <Progress value={visitPct} className="mt-1 h-2" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={props.onTopUpCall}>
          Top Up Calls (₹{PRICES.topup_call})
        </Button>
        <Button size="sm" variant="outline" onClick={props.onTopUpVisit}>
          Top Up Visit (₹{PRICES.topup_visit})
        </Button>
      </div>
    </div>
  );
}
