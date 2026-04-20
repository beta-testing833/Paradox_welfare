/**
 * Status.tsx
 * ----------------------------------------------------------------------------
 * Route: /status (protected, paid-plan-gated visibility).
 *
 * The new Status Tracking Overview. Two sections:
 *
 *   1. Plan Summary — pooled quota for active Saathi Plus + per-pack cards
 *      for any active Saathi Pack. Includes Top-Up shortcuts.
 *
 *   2. My Applications — every application this user has submitted, joined
 *      with the assigned agent, scheme metadata, and aggregate counts of
 *      booked vs completed calls/visits sourced from `interactions`.
 *
 * The old horizontal pipeline (Draft → Submitted → …) is gone — the new
 * timeline lives on /status/:applicationId. We keep the raw `status` text
 * out of the headline here; it's a small grey pill on the detail page only.
 *
 * If the user has no active paid plan, we fall back to the Sprint-6 paywall
 * upgrade prompt — application history is still part of the paid service.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Lock, Sparkles, UserCircle2, ArrowRight, CalendarClock, AlertTriangle } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import PaymentModal from "@/components/PaymentModal";
import BookNextCallModal from "@/components/BookNextCallModal";
import { PRICES } from "@/lib/concession";

/** A formatted-for-display row used in the application cards. */
interface AppCardRow {
  id: string;
  scheme_id: string;
  scheme_name: string;
  scheme_category: string | null;
  applied_at: string;
  status: string;
  consultation_date: string | null;
  consultation_time_slot: string | null;
  support_expires_at: string | null;
  agent_name: string | null;
  assigned_agent_id: string | null;
  /** Source plan: 'plus' or 'pack' (per scheme). */
  plan_source: "plus" | "pack" | "unknown";
  calls_count: number;
  calls_done: number;
  visits_count: number;
  visits_done: number;
  next_call_at: string | null;
}

interface PackRow {
  id: string;
  scheme_id: string;
  scheme_name: string;
  expires_at: string;
  calls_total: number;
  calls_used: number;
  visits_total: number;
  visits_used: number;
}

export default function Status() {
  const { user } = useAuth();
  const { isActive: hasPlus, loading: subLoading, subscription } = useSubscription();

  // ─────────── 1. Active packs (also counts as paid access) ───────────
  const { data: packs = [], isLoading: packsLoading, refetch: refetchPacks } = useQuery({
    queryKey: ["activePacks", user?.id],
    queryFn: async (): Promise<PackRow[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("scheme_packs")
        .select(`
          id, scheme_id, expires_at,
          calls_total, calls_used, visits_total, visits_used,
          schemes(name)
        `)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .gt("expires_at", new Date().toISOString())
        .order("purchased_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Array<{
        id: string; scheme_id: string; expires_at: string;
        calls_total: number; calls_used: number;
        visits_total: number; visits_used: number;
        schemes: { name: string } | null;
      }>).map((p) => ({
        id: p.id,
        scheme_id: p.scheme_id,
        scheme_name: p.schemes?.name ?? "Scheme",
        expires_at: p.expires_at,
        calls_total: p.calls_total ?? 0,
        calls_used: p.calls_used ?? 0,
        visits_total: p.visits_total ?? 0,
        visits_used: p.visits_used ?? 0,
      }));
    },
    enabled: !!user,
  });

  const hasAnyPlan = hasPlus || packs.length > 0;

  // ─────────── 2. Applications (only if paid) ───────────
  const { data: apps = [], isLoading: appsLoading, refetch: refetchApps } = useQuery({
    queryKey: ["statusApps", user?.id, packs.length, hasPlus],
    queryFn: async (): Promise<AppCardRow[]> => {
      if (!user) return [];
      // Pull base applications joined with scheme + agent.
      const { data, error } = await supabase
        .from("applications")
        .select(`
          id, scheme_id, applied_at, status,
          consultation_date, consultation_time_slot,
          support_expires_at, assigned_agent_id,
          schemes(name, category),
          agents:assigned_agent_id(full_name)
        `)
        .eq("user_id", user.id)
        .order("applied_at", { ascending: false });
      if (error) throw error;
      const baseRows = (data ?? []) as Array<{
        id: string; scheme_id: string; applied_at: string; status: string;
        consultation_date: string | null; consultation_time_slot: string | null;
        support_expires_at: string | null; assigned_agent_id: string | null;
        schemes: { name: string; category: string | null } | null;
        agents: { full_name: string } | null;
      }>;
      if (baseRows.length === 0) return [];

      const appIds = baseRows.map((r) => r.id);

      // Aggregate counts per application from `interactions`.
      const { data: ints } = await supabase
        .from("interactions")
        .select("application_id, interaction_type, scheduled_at, completed_at")
        .in("application_id", appIds);

      // Build a quick map: appId → { counts + next_call_at }.
      const stats = new Map<string, {
        calls_count: number; calls_done: number;
        visits_count: number; visits_done: number;
        next_call_at: string | null;
      }>();
      for (const id of appIds) {
        stats.set(id, { calls_count: 0, calls_done: 0, visits_count: 0, visits_done: 0, next_call_at: null });
      }
      const nowIso = new Date().toISOString();
      for (const i of (ints ?? []) as Array<{
        application_id: string; interaction_type: string;
        scheduled_at: string | null; completed_at: string | null;
      }>) {
        const s = stats.get(i.application_id);
        if (!s) continue;
        if (i.interaction_type === "call_booked" || i.interaction_type === "call_completed") {
          s.calls_count++;
        }
        if (i.interaction_type === "call_completed") s.calls_done++;
        if (i.interaction_type === "visit_booked" || i.interaction_type === "visit_completed") {
          s.visits_count++;
        }
        if (i.interaction_type === "visit_completed") s.visits_done++;
        // Track the soonest upcoming open call.
        if (
          i.interaction_type === "call_booked" &&
          !i.completed_at &&
          i.scheduled_at &&
          i.scheduled_at > nowIso
        ) {
          if (!s.next_call_at || i.scheduled_at < s.next_call_at) {
            s.next_call_at = i.scheduled_at;
          }
        }
      }

      // Build the active-pack lookup so we can label plan_source per row.
      const activePackSchemeIds = new Set(packs.map((p) => p.scheme_id));

      return baseRows.map((r) => {
        const planSource: AppCardRow["plan_source"] =
          activePackSchemeIds.has(r.scheme_id) ? "pack" : (hasPlus ? "plus" : "unknown");
        const s = stats.get(r.id)!;
        return {
          id: r.id,
          scheme_id: r.scheme_id,
          scheme_name: r.schemes?.name ?? "Scheme",
          scheme_category: r.schemes?.category ?? null,
          applied_at: r.applied_at,
          status: r.status,
          consultation_date: r.consultation_date,
          consultation_time_slot: r.consultation_time_slot,
          support_expires_at: r.support_expires_at,
          agent_name: r.agents?.full_name ?? null,
          assigned_agent_id: r.assigned_agent_id,
          plan_source: planSource,
          ...s,
        };
      });
    },
    enabled: !!user && hasAnyPlan,
  });

  // ─── State for the embedded BookNextCall modal + top-up modals ───
  const [bookFor, setBookFor] = useState<AppCardRow | null>(null);
  const [topupOpen, setTopupOpen] = useState<{
    kind: "call" | "visit";
    target: { id: string; appliesTo: "saathi_plus_annual" | "scheme_pack" };
  } | null>(null);

  // Plus quota figures for the top card.
  const plusCallsLeft  = subscription ? Math.max(0, (subscription.calls_total ?? 0)  - (subscription.calls_used ?? 0))  : 0;
  const plusVisitsLeft = subscription ? Math.max(0, (subscription.visits_total ?? 0) - (subscription.visits_used ?? 0)) : 0;

  const loading = subLoading || packsLoading;

  // Pick the source plan for any given application — used by the BookNextCall modal.
  const sourceFor = useMemo(() => {
    return (a: AppCardRow) => {
      if (a.plan_source === "pack") {
        const p = packs.find((x) => x.scheme_id === a.scheme_id);
        if (!p) return null;
        return {
          kind: "pack" as const,
          id: p.id,
          calls_total: p.calls_total, calls_used: p.calls_used,
          visits_total: p.visits_total, visits_used: p.visits_used,
        };
      }
      if (subscription && hasPlus) {
        return {
          kind: "plus" as const,
          id: subscription.id,
          calls_total: subscription.calls_total ?? 0,
          calls_used: subscription.calls_used ?? 0,
          visits_total: subscription.visits_total ?? 0,
          visits_used: subscription.visits_used ?? 0,
        };
      }
      return null;
    };
  }, [packs, subscription, hasPlus]);

  // ─── Paywall view: no plan + not loading ───
  if (!loading && !hasAnyPlan) {
    return (
      <div className="container py-10 animate-fade-in">
        <Card className="mx-auto max-w-xl shadow-elegant">
          <CardContent className="space-y-4 p-8 text-center">
            <Lock className="mx-auto h-10 w-10 text-primary" />
            <h2 className="text-2xl font-bold text-primary">Paid plan required</h2>
            <p className="text-sm text-muted-foreground">
              Application tracking and your booked consultation calls are part of
              the Saathi Pack and Saathi Plus plans.
            </p>
            <Button asChild size="lg" className="font-semibold">
              <Link to="/subscription">
                <Sparkles className="mr-2 h-4 w-4" /> View plans
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-[960px] py-10 animate-fade-in">
      <header className="mb-6">
        <h1 className="text-[28px] font-bold text-primary">Status Tracking</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your scheme applications, agents, and consultation calls.
        </p>
      </header>

      {/* ───────── SECTION 1: Plan summary ───────── */}
      <section className="mb-8 space-y-4">
        {hasPlus && subscription && (
          <Card className="border-l-4 border-l-primary shadow-sm">
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-primary">Saathi Plus — Annual Plan</h2>
                  <p className="text-xs text-muted-foreground">
                    Plan expires{" "}
                    {new Date(subscription.expires_at).toLocaleDateString(undefined, {
                      day: "2-digit", month: "short", year: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm" variant="outline"
                    onClick={() => setTopupOpen({ kind: "call", target: { id: subscription.id, appliesTo: "saathi_plus_annual" } })}
                  >Top up call</Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => setTopupOpen({ kind: "visit", target: { id: subscription.id, appliesTo: "saathi_plus_annual" } })}
                  >Top up visit</Button>
                </div>
              </div>

              <QuotaBar
                label="Calls"
                used={subscription.calls_used ?? 0}
                total={subscription.calls_total ?? 0}
                tail={`${plusCallsLeft} calls left this year`}
              />
              <QuotaBar
                label="Visits"
                used={subscription.visits_used ?? 0}
                total={subscription.visits_total ?? 0}
                tail={`${plusVisitsLeft} visits left this year`}
              />
            </CardContent>
          </Card>
        )}

        {packs.map((p) => {
          const cLeft = Math.max(0, p.calls_total - p.calls_used);
          const vLeft = Math.max(0, p.visits_total - p.visits_used);
          return (
            <Card key={p.id} className="border-l-4 border-l-accent shadow-sm">
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-primary">Saathi Pack — {p.scheme_name}</h2>
                    <p className="text-xs text-muted-foreground">
                      Pack expires{" "}
                      {new Date(p.expires_at).toLocaleDateString(undefined, {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="outline"
                      onClick={() => setTopupOpen({ kind: "call", target: { id: p.id, appliesTo: "scheme_pack" } })}
                    >Top up call</Button>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => setTopupOpen({ kind: "visit", target: { id: p.id, appliesTo: "scheme_pack" } })}
                    >Top up visit</Button>
                  </div>
                </div>
                <QuotaBar label="Calls"  used={p.calls_used}  total={p.calls_total}  tail={`${cLeft} calls left`} />
                <QuotaBar label="Visits" used={p.visits_used} total={p.visits_total} tail={`${vLeft} visits left`} />
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* ───────── SECTION 2: Applications ───────── */}
      <section>
        <h2 className="mb-3 text-[22px] font-bold text-primary">My Applications</h2>

        {appsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!appsLoading && apps.length === 0 && (
          <Card className="shadow-sm">
            <CardContent className="space-y-3 p-8 text-center">
              <p className="text-muted-foreground">
                You don't have any active applications yet.
              </p>
              <Button asChild>
                <Link to="/schemes">Browse Schemes <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {apps.map((a) => {
            const supportEnded =
              !!a.support_expires_at && new Date(a.support_expires_at) < new Date();
            const src = sourceFor(a);
            const callsRemaining = src ? src.calls_total - src.calls_used : 0;
            return (
              <Card key={a.id} className="shadow-sm transition-shadow hover:shadow-md">
                <CardContent className="space-y-3 p-5">
                  {/* Row 1 — header */}
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/50 pb-3">
                    <div>
                      <h3 className="text-lg font-bold text-primary">{a.scheme_name}</h3>
                      {a.scheme_category && (
                        <span className="mt-1 inline-block rounded-full bg-[#D6E4F0] px-2 py-0.5 text-xs text-primary">
                          {a.scheme_category}
                        </span>
                      )}
                    </div>
                    <PlanPill source={a.plan_source} />
                  </div>

                  {/* Row 2 — agent */}
                  <div className="flex items-center gap-2 border-b border-border/50 pb-3 text-sm">
                    <UserCircle2 className="h-4 w-4 text-primary" />
                    {a.agent_name ? (
                      <span>Agent assigned: <span className="font-semibold text-primary">{a.agent_name}</span></span>
                    ) : (
                      <span className="italic text-muted-foreground">
                        Agent will be assigned after first call booking
                      </span>
                    )}
                  </div>

                  {/* Row 3 — usage */}
                  <div className="flex flex-wrap gap-2 border-b border-border/50 pb-3">
                    <span className="rounded-md border border-[#AACDE0] bg-[#D6E4F0]/40 px-2.5 py-1 text-xs text-primary">
                      Calls: {a.calls_done} done / {a.calls_count} booked
                    </span>
                    <span className="rounded-md border border-[#AACDE0] bg-[#D6E4F0]/40 px-2.5 py-1 text-xs text-primary">
                      Visits: {a.visits_done} done / {a.visits_count} booked
                    </span>
                  </div>

                  {/* Row 4 — milestone */}
                  <div className="border-b border-border/50 pb-3 text-sm">
                    {supportEnded ? (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        Support window ended on{" "}
                        {new Date(a.support_expires_at!).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    ) : a.next_call_at ? (
                      <span className="flex items-center gap-1.5">
                        <CalendarClock className="h-4 w-4 text-accent" />
                        Next call:{" "}
                        {new Date(a.next_call_at).toLocaleString(undefined, {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">No upcoming call scheduled</span>
                    )}
                  </div>

                  {/* Row 5 — actions */}
                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <Link to={`/status/${a.id}`}>View Details</Link>
                    </Button>
                    <Button
                      variant="outline"
                      disabled={supportEnded}
                      onClick={() => setBookFor(a)}
                      title={supportEnded ? "Support window for this scheme has ended." : undefined}
                    >
                      Book Next Call
                    </Button>
                    {callsRemaining <= 0 && !supportEnded && (
                      <span className="self-center text-xs text-amber-700">Calls quota exhausted</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Book Next Call modal */}
      {bookFor && (
        <BookNextCallModal
          open={!!bookFor}
          onClose={() => setBookFor(null)}
          applicationId={bookFor.id}
          schemeId={bookFor.scheme_id}
          schemeName={bookFor.scheme_name}
          schemeCategory={bookFor.scheme_category}
          assignedAgentId={bookFor.assigned_agent_id}
          assignedAgentName={bookFor.agent_name}
          supportExpiresAt={bookFor.support_expires_at}
          source={sourceFor(bookFor)}
          onBooked={() => { refetchApps(); refetchPacks(); }}
        />
      )}

      {/* Top-up modals (calls / visits) */}
      {topupOpen && (
        <PaymentModal
          open={!!topupOpen}
          onClose={() => setTopupOpen(null)}
          amount={topupOpen.kind === "call" ? PRICES.topup_call : PRICES.topup_visit}
          fullPrice={topupOpen.kind === "call" ? PRICES.topup_call : PRICES.topup_visit}
          concessionApplied={false}
          concessionReason={null}
          purpose={topupOpen.kind === "call" ? "topup_call" : "topup_visit"}
          topupTargetId={topupOpen.target.id}
          topupAppliesTo={topupOpen.target.appliesTo}
          onSuccess={() => { refetchApps(); refetchPacks(); }}
        />
      )}
    </div>
  );
}

/** Small horizontal "Calls used / Total" progress bar. */
function QuotaBar({ label, used, total, tail }: { label: string; used: number; total: number; tail: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs text-muted-foreground">
        <span><span className="font-semibold text-primary">{label}:</span> {used} / {total} used</span>
        <span>{tail}</span>
      </div>
      <Progress value={pct} className="h-2 bg-secondary [&>div]:bg-[#16A34A]" />
    </div>
  );
}

/** Small pill badge identifying the plan source for an application. */
function PlanPill({ source }: { source: "plus" | "pack" | "unknown" }) {
  if (source === "plus") {
    return <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">Saathi Plus</span>;
  }
  if (source === "pack") {
    return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Saathi Pack</span>;
  }
  return <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">No plan</span>;
}
