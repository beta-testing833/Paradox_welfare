/**
 * StatusDetail.tsx
 * ----------------------------------------------------------------------------
 * Route: /status/:applicationId (protected, paid-plan-gated).
 *
 * Per-application detail view. Three sections:
 *
 *   A. At-a-glance strip — three small cards: Plan & Quota, Assigned Agent,
 *      Support Window.
 *
 *   B. Timeline — every interactions row for this application, rendered as
 *      a vertical timeline with type-coloured dots.
 *
 *   C. Bottom actions — Book Next Call + Change Agent. Both are disabled
 *      after the support window ends. "Change Agent" is also disabled after
 *      the user has already changed agents once on this application.
 */
import { useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, UserCircle2, Phone, Home, FileSearch, MessageSquare, RefreshCcw } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import BookNextCallModal from "@/components/BookNextCallModal";
import ChangeAgentModal from "@/components/ChangeAgentModal";
import { cn } from "@/lib/utils";

interface DetailRow {
  id: string;
  scheme_id: string;
  scheme_name: string;
  scheme_category: string | null;
  status: string;
  applied_at: string;
  support_expires_at: string | null;
  assigned_agent_id: string | null;
  agent_name: string | null;
  agent_specialization: string[] | null;
  /** Active pack for this scheme, if any (otherwise plan source = plus). */
  pack: {
    id: string;
    expires_at: string;
    calls_total: number; calls_used: number;
    visits_total: number; visits_used: number;
  } | null;
}

interface InteractionRow {
  id: string;
  application_id: string;
  agent_id: string | null;
  interaction_type: string;
  scheduled_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  agent_name: string | null;
}

export default function StatusDetail() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isActive: hasPlus, subscription } = useSubscription();

  const [bookOpen, setBookOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);

  // ─── 1. Application detail (with scheme + agent + pack) ───
  const { data: detail, isLoading, refetch: refetchDetail } = useQuery({
    queryKey: ["statusDetail", applicationId, user?.id],
    queryFn: async (): Promise<DetailRow | null> => {
      if (!user || !applicationId) return null;
      const { data, error } = await supabase
        .from("applications")
        .select(`
          id, scheme_id, status, applied_at,
          support_expires_at, assigned_agent_id,
          schemes(name, category),
          agents:assigned_agent_id(full_name, specialization)
        `)
        .eq("id", applicationId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as {
        id: string; scheme_id: string; status: string; applied_at: string;
        support_expires_at: string | null; assigned_agent_id: string | null;
        schemes: { name: string; category: string | null } | null;
        agents: { full_name: string; specialization: string[] | null } | null;
      };

      // Look up an active pack for this scheme, if any.
      const { data: pack } = await supabase
        .from("scheme_packs")
        .select("id, expires_at, calls_total, calls_used, visits_total, visits_used")
        .eq("user_id", user.id)
        .eq("scheme_id", row.scheme_id)
        .eq("is_active", true)
        .gt("expires_at", new Date().toISOString())
        .order("purchased_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        id: row.id,
        scheme_id: row.scheme_id,
        scheme_name: row.schemes?.name ?? "Scheme",
        scheme_category: row.schemes?.category ?? null,
        status: row.status,
        applied_at: row.applied_at,
        support_expires_at: row.support_expires_at,
        assigned_agent_id: row.assigned_agent_id,
        agent_name: row.agents?.full_name ?? null,
        agent_specialization: row.agents?.specialization ?? null,
        pack: pack ? {
          id: pack.id,
          expires_at: pack.expires_at,
          calls_total: pack.calls_total ?? 0,
          calls_used: pack.calls_used ?? 0,
          visits_total: pack.visits_total ?? 0,
          visits_used: pack.visits_used ?? 0,
        } : null,
      };
    },
    enabled: !!user && !!applicationId,
  });

  // ─── 2. Timeline interactions ───
  const { data: timeline = [], refetch: refetchTimeline } = useQuery({
    queryKey: ["statusTimeline", applicationId],
    queryFn: async (): Promise<InteractionRow[]> => {
      if (!applicationId) return [];
      const { data, error } = await supabase
        .from("interactions")
        .select(`
          id, application_id, agent_id, interaction_type,
          scheduled_at, completed_at, notes, created_at,
          agents:agent_id(full_name)
        `)
        .eq("application_id", applicationId);
      if (error) throw error;
      const rows = (data ?? []) as Array<InteractionRow & { agents: { full_name: string } | null }>;
      // Sort by timeline-relevant timestamp DESC.
      const sorted = rows
        .map((r) => ({ ...r, agent_name: r.agents?.full_name ?? null }))
        .sort((a, b) => {
          const ta = (a.completed_at ?? a.scheduled_at ?? a.created_at) as string;
          const tb = (b.completed_at ?? b.scheduled_at ?? b.created_at) as string;
          return tb.localeCompare(ta);
        });
      return sorted;
    },
    enabled: !!applicationId,
  });

  // Has the user already swapped agents on this application?
  const alreadyChanged = useMemo(
    () => timeline.some((i) => i.interaction_type === "agent_changed"),
    [timeline],
  );

  // Source plan figures for the at-a-glance strip + booking modal.
  const source = useMemo(() => {
    if (!detail) return null;
    if (detail.pack) {
      return {
        kind: "pack" as const,
        id: detail.pack.id,
        calls_total: detail.pack.calls_total, calls_used: detail.pack.calls_used,
        visits_total: detail.pack.visits_total, visits_used: detail.pack.visits_used,
      };
    }
    if (hasPlus && subscription) {
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
  }, [detail, hasPlus, subscription]);

  if (isLoading) {
    return <div className="container py-10 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!detail) {
    return (
      <div className="container py-10">
        <p className="text-muted-foreground">Application not found.</p>
        <Button asChild variant="outline" className="mt-3">
          <Link to="/status"><ArrowLeft className="mr-1 h-4 w-4" /> Back to Status</Link>
        </Button>
      </div>
    );
  }

  const supportEnded =
    !!detail.support_expires_at && new Date(detail.support_expires_at) < new Date();
  const callsLeft  = source ? Math.max(0, source.calls_total - source.calls_used)   : 0;
  const visitsLeft = source ? Math.max(0, source.visits_total - source.visits_used) : 0;

  function refreshAll() {
    void refetchDetail();
    void refetchTimeline();
  }

  return (
    <div className="container max-w-[960px] py-10 animate-fade-in">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/status")} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-primary">Status: {detail.scheme_name}</h1>
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">
          {detail.status}
        </span>
      </div>

      {/* ───────── SECTION A: at-a-glance strip ───────── */}
      <section className="mb-8 grid gap-3 sm:grid-cols-3">
        {/* Plan & Quota */}
        <Card className="shadow-sm">
          <CardContent className="space-y-1 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Plan & Quota</p>
            {source ? (
              <>
                <p className="text-sm font-bold text-primary">
                  {source.kind === "plus" ? "Saathi Plus (pooled)" : "Saathi Pack"}
                </p>
                <p className="text-xs text-muted-foreground">{callsLeft} calls left · {visitsLeft} visits left</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No active plan</p>
            )}
          </CardContent>
        </Card>

        {/* Assigned Agent */}
        <Card className="shadow-sm">
          <CardContent className="space-y-1 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Assigned Agent</p>
            {detail.agent_name ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#D6E4F0] text-xs font-bold text-primary">
                    {initials(detail.agent_name)}
                  </span>
                  <p className="text-sm font-bold text-primary">{detail.agent_name}</p>
                </div>
                {detail.agent_specialization && detail.agent_specialization.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">{detail.agent_specialization.join(", ")}</p>
                )}
                <button
                  type="button"
                  onClick={() => setChangeOpen(true)}
                  disabled={supportEnded || alreadyChanged}
                  title={
                    supportEnded ? "Support window for this scheme has ended."
                    : alreadyChanged ? "You've already changed agents for this scheme. Contact support if you need further assistance."
                    : undefined
                  }
                  className={cn(
                    "text-xs underline",
                    (supportEnded || alreadyChanged)
                      ? "cursor-not-allowed text-muted-foreground"
                      : "text-[#2E5FA3]",
                  )}
                >
                  Change Agent
                </button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Not yet assigned — will be set on your first call booking.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Support Window */}
        <Card className="shadow-sm">
          <CardContent className="space-y-1 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Support Window</p>
            {detail.support_expires_at ? (
              supportEnded ? (
                <p className="text-sm font-bold text-destructive">
                  Ended {new Date(detail.support_expires_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              ) : (
                <p className="text-sm font-bold text-primary">
                  Active until {new Date(detail.support_expires_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">No window set</p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ───────── SECTION B: Timeline ───────── */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-bold text-primary">Timeline</h2>
        {timeline.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No activity yet. Book your first call to get started.
            </CardContent>
          </Card>
        ) : (
          <ol className="relative space-y-3 border-l-2 border-border/60 pl-6">
            {timeline.map((i) => <TimelineEntry key={i.id} i={i} />)}
          </ol>
        )}
      </section>

      {/* ───────── SECTION C: Bottom actions ───────── */}
      <section className="flex flex-wrap gap-3">
        <Button
          onClick={() => setBookOpen(true)}
          disabled={supportEnded}
          title={supportEnded ? "Support window for this scheme has ended." : undefined}
          className="font-semibold"
        >
          Book Next Call
        </Button>
        <Button
          variant="outline"
          onClick={() => setChangeOpen(true)}
          disabled={supportEnded || alreadyChanged}
          title={
            supportEnded ? "Support window for this scheme has ended."
            : alreadyChanged ? "You've already changed agents for this scheme. Contact support if you need further assistance."
            : undefined
          }
        >
          Change Agent
        </Button>
      </section>

      {/* Modals */}
      <BookNextCallModal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        applicationId={detail.id}
        schemeId={detail.scheme_id}
        schemeName={detail.scheme_name}
        schemeCategory={detail.scheme_category}
        assignedAgentId={detail.assigned_agent_id}
        assignedAgentName={detail.agent_name}
        supportExpiresAt={detail.support_expires_at}
        source={source}
        onBooked={refreshAll}
      />
      <ChangeAgentModal
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        applicationId={detail.id}
        schemeName={detail.scheme_name}
        schemeCategory={detail.scheme_category}
        currentAgentId={detail.assigned_agent_id}
        currentAgentName={detail.agent_name}
        onChanged={refreshAll}
      />
    </div>
  );
}

/** Two-letter initials for the agent avatar bubble. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Render one timeline entry. Colour + icon + body vary by interaction_type. */
function TimelineEntry({ i }: { i: InteractionRow }) {
  const meta = describeInteraction(i);
  const when = i.completed_at ?? i.scheduled_at ?? i.created_at;
  const past = i.scheduled_at && !i.completed_at && new Date(i.scheduled_at) < new Date();

  return (
    <li className="relative">
      {/* Coloured dot anchored on the rail */}
      <span
        className={cn("absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-background", meta.dotClass)}
      />
      <Card className="shadow-sm">
        <CardContent className="space-y-1 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-bold text-primary">
              {meta.icon}
              {meta.title(i)}
            </p>
            {i.interaction_type === "call_booked" && past && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                Awaiting update
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {meta.subtitle(i)} · {new Date(when).toLocaleString(undefined, {
              day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          </p>
          {i.notes && (
            <blockquote className="mt-1 rounded-md border-l-2 border-border bg-secondary/40 px-3 py-2 text-xs text-foreground">
              {i.notes}
            </blockquote>
          )}
        </CardContent>
      </Card>
    </li>
  );
}

/** Map an interaction_type to its colour, icon, title and subtitle copy. */
function describeInteraction(i: InteractionRow): {
  dotClass: string;
  icon: React.ReactNode;
  title: (i: InteractionRow) => string;
  subtitle: (i: InteractionRow) => string;
} {
  switch (i.interaction_type) {
    case "call_booked":
      return {
        dotClass: "bg-[#2E5FA3]",
        icon: <Phone className="h-3.5 w-3.5" />,
        title: (x) => `Call booked with ${x.agent_name ?? "agent"}`,
        subtitle: (x) => x.scheduled_at ? `Scheduled for ${new Date(x.scheduled_at).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Scheduled",
      };
    case "call_completed":
      return {
        dotClass: "bg-[#16A34A]",
        icon: <Phone className="h-3.5 w-3.5" />,
        title: (x) => `Call completed with ${x.agent_name ?? "agent"}`,
        subtitle: () => "Consultation done",
      };
    case "visit_booked":
      return {
        dotClass: "bg-purple-600",
        icon: <Home className="h-3.5 w-3.5" />,
        title: (x) => `Home visit booked with ${x.agent_name ?? "agent"}`,
        subtitle: (x) => x.scheduled_at ? `Scheduled for ${new Date(x.scheduled_at).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Scheduled",
      };
    case "visit_completed":
      return {
        dotClass: "bg-[#16A34A]",
        icon: <Home className="h-3.5 w-3.5" />,
        title: () => "Home visit completed",
        subtitle: () => "Visit done",
      };
    case "documents_reviewed":
      return {
        dotClass: "bg-[#D6E4F0]",
        icon: <FileSearch className="h-3.5 w-3.5" />,
        title: (x) => `Documents reviewed by ${x.agent_name ?? "agent"}`,
        subtitle: () => "Review complete",
      };
    case "status_update":
      return {
        dotClass: "bg-amber-500",
        icon: <RefreshCcw className="h-3.5 w-3.5" />,
        title: (x) => `Status update${x.notes ? `: ${x.notes.slice(0, 40)}` : ""}`,
        subtitle: () => "Status changed",
      };
    case "agent_changed":
      return {
        dotClass: "bg-orange-500",
        icon: <RefreshCcw className="h-3.5 w-3.5" />,
        title: () => `Agent changed`,
        subtitle: () => "Reassignment",
      };
    case "note":
    default:
      return {
        dotClass: "bg-muted-foreground/60",
        icon: <MessageSquare className="h-3.5 w-3.5" />,
        title: (x) => `Note from ${x.agent_name ?? "system"}`,
        subtitle: () => "",
      };
  }
}
