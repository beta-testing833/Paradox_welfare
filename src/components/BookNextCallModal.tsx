/**
 * BookNextCallModal.tsx
 * ----------------------------------------------------------------------------
 * Books a follow-up consultation call (and optional visit) on an existing
 * application. Used from both /status and /status/:applicationId.
 *
 * Behaviour:
 *   • If the application already has an assigned agent (the normal case
 *     after the first Apply submission), we keep that agent and only show
 *     time slots they're not already booked into.
 *   • If somehow the application has no assigned agent yet, we fall back
 *     to the same load-balanced selection logic ApplyModal uses.
 *   • Visit checkbox shows only if the source plan still has a visit;
 *     otherwise we offer a top-up via PaymentModal.
 *   • If calls quota is exhausted, we surface a small inline modal with
 *     two CTAs (top-up call OR upgrade to a Pack) — both reuse PaymentModal.
 *
 * On confirm we:
 *   1. Insert an `interactions` row (`call_booked`).
 *   2. Optionally insert a second row (`visit_booked`).
 *   3. Bump calls_used (+1) and visits_used (+1 if applicable) on the
 *      source plan.
 *   4. Insert a `notifications` row.
 *   5. Call onBooked() so the caller can soft-refresh its data.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, AlertTriangle, UserCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  TIME_SLOTS,
  bookedSlotsFor,
  slotStartHHMM,
  combineDateAndSlot,
  pickAgentForNewApplication,
} from "@/lib/agentAssignment";
import PaymentModal from "@/components/PaymentModal";
import { PRICES } from "@/lib/concession";

interface PlanSource {
  /** Which paid plan this booking will draw from. */
  kind: "plus" | "pack";
  id: string;
  calls_total: number;
  calls_used: number;
  visits_total: number;
  visits_used: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Application this booking belongs to. */
  applicationId: string;
  schemeId: string;
  schemeName: string;
  schemeCategory: string | null;
  /** Already-assigned agent for this scheme (preferred path). */
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  /** Hard upper bound — bookings can't be scheduled after support ends. */
  supportExpiresAt: string | null;
  /** Source plan summary so we can debit quotas + show usage. */
  source: PlanSource | null;
  /** Notify parent so it can refetch the timeline / overview. */
  onBooked: () => void;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function BookNextCallModal({
  open, onClose,
  applicationId, schemeId, schemeName, schemeCategory,
  assignedAgentId, assignedAgentName,
  supportExpiresAt, source, onBooked,
}: Props) {
  const { user } = useAuth();
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<string>("");
  const [requestVisit, setRequestVisit] = useState(false);
  const [busy, setBusy] = useState(false);
  // Slots the assigned agent is already booked into on the chosen date.
  const [bookedStarts, setBookedStarts] = useState<Set<string>>(new Set());
  // Top-up flows — used when calls or visits quota is hit.
  const [topupCallOpen, setTopupCallOpen] = useState(false);
  const [topupVisitOpen, setTopupVisitOpen] = useState(false);

  // Reset form when modal closes.
  useEffect(() => {
    if (!open) {
      setDate(""); setSlot(""); setRequestVisit(false);
      setBookedStarts(new Set());
    }
  }, [open]);

  // Refetch the assigned agent's bookings whenever the date changes.
  useEffect(() => {
    if (!open || !date || !assignedAgentId) {
      setBookedStarts(new Set());
      return;
    }
    bookedSlotsFor(assignedAgentId, date).then(setBookedStarts);
  }, [open, date, assignedAgentId]);

  // Compute remaining quotas + booking-window bounds.
  const callsLeft  = source ? Math.max(0, source.calls_total - source.calls_used)   : 0;
  const visitsLeft = source ? Math.max(0, source.visits_total - source.visits_used) : 0;

  const minDate = useMemo(() => isoDate(new Date()), []);
  const maxDate = useMemo(() => {
    // Cap at support window end OR 60 days, whichever is sooner.
    const sixty = new Date(); sixty.setDate(sixty.getDate() + 60);
    if (supportExpiresAt) {
      const expiry = new Date(supportExpiresAt);
      return isoDate(expiry < sixty ? expiry : sixty);
    }
    return isoDate(sixty);
  }, [supportExpiresAt]);

  // Filter slots: hide any the assigned agent is already booked into.
  const availableSlots = useMemo(() => {
    if (!assignedAgentId) return [...TIME_SLOTS];
    return TIME_SLOTS.filter((s) => !bookedStarts.has(slotStartHHMM(s)));
  }, [assignedAgentId, bookedStarts]);

  const noSlotsForDate = date && assignedAgentId && availableSlots.length === 0;

  /** Submit handler. */
  async function handleConfirm() {
    if (!user || !source) {
      toast.error("Missing user or active plan.");
      return;
    }
    if (!date) { toast.error("Please pick a date."); return; }
    if (!slot) { toast.error("Please pick a time slot."); return; }
    if (callsLeft <= 0) {
      // Show inline top-up CTA instead of trying to book.
      toast.error("No consultation calls remaining on this plan.");
      return;
    }

    setBusy(true);
    try {
      const scheduledAtIso = combineDateAndSlot(date, slot);

      // Determine the agent. Prefer the locked-in assigned agent.
      let agentId = assignedAgentId;
      if (!agentId) {
        agentId = await pickAgentForNewApplication(schemeCategory, scheduledAtIso);
        if (agentId) {
          // Persist this newly-picked agent so future bookings stay with them.
          await supabase
            .from("applications")
            .update({ assigned_agent_id: agentId, agent_assigned_at: new Date().toISOString() })
            .eq("id", applicationId);
        }
      }

      // 1) call_booked interaction.
      const { error: iErr } = await supabase.from("interactions").insert({
        application_id: applicationId,
        agent_id: agentId,
        interaction_type: "call_booked",
        scheduled_at: scheduledAtIso,
        notes: `Follow-up consultation for ${schemeName}`,
        created_by: "user",
      });
      if (iErr) throw iErr;

      // 2) visit_booked interaction (optional).
      if (requestVisit && visitsLeft > 0) {
        const { error: vErr } = await supabase.from("interactions").insert({
          application_id: applicationId,
          agent_id: agentId,
          interaction_type: "visit_booked",
          scheduled_at: scheduledAtIso,
          notes: `Agent home visit for ${schemeName}`,
          created_by: "user",
        });
        if (vErr) throw vErr;
      }

      // 3) Debit quotas on the source plan.
      const newCalls  = source.calls_used + 1;
      const newVisits = source.visits_used + (requestVisit && visitsLeft > 0 ? 1 : 0);
      if (source.kind === "plus") {
        await supabase.from("subscriptions")
          .update({ calls_used: newCalls, visits_used: newVisits })
          .eq("id", source.id);
      } else {
        await supabase.from("scheme_packs")
          .update({ calls_used: newCalls, visits_used: newVisits })
          .eq("id", source.id);
      }

      // 4) Notification.
      const friendlyDate = new Date(date).toLocaleDateString(undefined, {
        day: "2-digit", month: "short", year: "numeric",
      });
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Call booked",
        body: `Call booked with ${assignedAgentName ?? "your agent"} on ${friendlyDate} at ${slot}.`,
      });

      toast.success("Call booked.");
      onBooked();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not book the call.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Quota-exhausted UX: when calls left == 0, show a small alternative UI
  // with two CTAs (top-up call OR buy a Pack for this scheme), instead of
  // the standard date/slot picker.
  // ─────────────────────────────────────────────────────────────────────
  const callsExhausted = !!source && callsLeft <= 0;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary">Book next call for {schemeName}</DialogTitle>
          </DialogHeader>

          {callsExhausted ? (
            // ───── Quota exhausted: explain + offer top-ups ─────
            <div className="space-y-3">
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mr-1 inline h-4 w-4" />
                Your {source!.kind === "plus" ? "Saathi Plus" : "Pack"} calls quota is exhausted.
              </div>
              <p className="text-sm text-muted-foreground">
                Top up an extra call for ₹{PRICES.topup_call}, or buy a Saathi Pack
                dedicated to this scheme for ₹{PRICES.saathi_pack_full}.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => setTopupCallOpen(true)} className="font-semibold">
                  Top up — ₹{PRICES.topup_call}
                </Button>
                <Button variant="outline" onClick={onClose}>
                  Maybe later
                </Button>
              </div>
            </div>
          ) : (
            // ───── Standard booking form ─────
            <div className="space-y-4">
              {/* Agent strip */}
              {assignedAgentName ? (
                <div className="flex items-center gap-2 rounded-md border border-[#AACDE0] bg-[#D6E4F0]/40 p-3 text-sm">
                  <UserCircle2 className="h-5 w-5 text-primary" />
                  <span className="text-primary">
                    Your dedicated agent for this scheme is{" "}
                    <span className="font-semibold">{assignedAgentName}</span>
                  </span>
                </div>
              ) : (
                <div className="rounded-md border border-[#AACDE0] bg-[#D6E4F0]/40 p-3 text-xs text-muted-foreground">
                  An agent will be assigned automatically based on availability.
                </div>
              )}

              {/* Date + slot */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="b-date">Preferred date</Label>
                  <Input
                    id="b-date" type="date"
                    min={minDate} max={maxDate}
                    value={date}
                    onChange={(e) => { setDate(e.target.value); setSlot(""); }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="b-slot">Time slot</Label>
                  <select
                    id="b-slot"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={slot}
                    onChange={(e) => setSlot(e.target.value)}
                    disabled={!date || availableSlots.length === 0}
                  >
                    <option value="">Select a slot</option>
                    {availableSlots.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {noSlotsForDate && (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                  Your agent has no free slots on this date. Please pick another date.
                </p>
              )}

              {/* Visit checkbox */}
              {visitsLeft > 0 ? (
                <label className="flex items-start gap-2 text-xs">
                  <Checkbox
                    id="b-visit"
                    checked={requestVisit}
                    onCheckedChange={(v) => setRequestVisit(v === true)}
                  />
                  <span>
                    Also request an in-person agent home visit — uses 1 visit
                    from your quota ({visitsLeft} left)
                  </span>
                </label>
              ) : (
                <p className="flex items-center gap-2 text-xs text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Visits quota exhausted —{" "}
                  <button
                    type="button"
                    className="text-[#2E5FA3] underline"
                    onClick={() => setTopupVisitOpen(true)}
                  >
                    top up for ₹{PRICES.topup_visit}
                  </button>
                </p>
              )}

              {/* Quota summary */}
              {source && (
                <div className="rounded-md border border-[#AACDE0] bg-[#D6E4F0]/30 p-2 text-xs text-primary">
                  <span className="font-semibold">
                    Using your {source.kind === "plus" ? "Saathi Plus" : "Pack"}:
                  </span>{" "}
                  {callsLeft} calls, {visitsLeft} visits remaining
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                <Button onClick={handleConfirm} disabled={busy} className="font-semibold">
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirm Booking
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Top-up: extra call */}
      {source && (
        <PaymentModal
          open={topupCallOpen}
          onClose={() => setTopupCallOpen(false)}
          amount={PRICES.topup_call}
          fullPrice={PRICES.topup_call}
          concessionApplied={false}
          concessionReason={null}
          purpose="topup_call"
          topupTargetId={source.id}
          topupAppliesTo={source.kind === "plus" ? "saathi_plus_annual" : "scheme_pack"}
          onSuccess={() => onBooked()}
        />
      )}
      {/* Top-up: extra visit */}
      {source && (
        <PaymentModal
          open={topupVisitOpen}
          onClose={() => setTopupVisitOpen(false)}
          amount={PRICES.topup_visit}
          fullPrice={PRICES.topup_visit}
          concessionApplied={false}
          concessionReason={null}
          purpose="topup_visit"
          topupTargetId={source.id}
          topupAppliesTo={source.kind === "plus" ? "saathi_plus_annual" : "scheme_pack"}
          onSuccess={() => { setRequestVisit(true); onBooked(); }}
        />
      )}
    </>
  );
}
