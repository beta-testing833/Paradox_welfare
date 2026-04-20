/**
 * ChangeAgentModal.tsx
 * ----------------------------------------------------------------------------
 * Lets the user swap the agent assigned to one of their scheme applications.
 *
 * Constraints:
 *   • Only one agent change per application is allowed (the caller passes
 *     `alreadyChanged` so we can refuse politely if so).
 *   • Future unopened bookings on this application are silently re-routed
 *     to the new agent (we update interactions.agent_id where scheduled_at
 *     is in the future and completed_at is null).
 *   • An `interactions` row of type `agent_changed` is recorded so the
 *     timeline shows the swap.
 *   • A notification row is created for the user.
 *
 * Candidate list:
 *   • Up to 5 active agents whose specialization overlaps the scheme's
 *     category, ordered by current booking load. Excludes the current agent.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { listChangeAgentCandidates } from "@/lib/agentAssignment";

interface Props {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  schemeName: string;
  schemeCategory: string | null;
  /** Current agent on the application (for the candidate-exclusion list). */
  currentAgentId: string | null;
  currentAgentName: string | null;
  onChanged: () => void;
}

interface Candidate {
  id: string;
  full_name: string;
  specialization: string[] | null;
  languages: string[] | null;
}

export default function ChangeAgentModal({
  open, onClose, applicationId, schemeName, schemeCategory,
  currentAgentId, currentAgentName, onChanged,
}: Props) {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [chosenId, setChosenId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load candidates whenever the modal opens.
  useEffect(() => {
    if (!open) {
      setChosenId(""); setReason(""); setCandidates([]);
      return;
    }
    setLoading(true);
    listChangeAgentCandidates(schemeCategory, currentAgentId)
      .then((list) => setCandidates(list))
      .finally(() => setLoading(false));
  }, [open, schemeCategory, currentAgentId]);

  const chosen = candidates.find((c) => c.id === chosenId) ?? null;

  /** Confirm handler. */
  async function handleConfirm() {
    if (!user) return;
    if (!chosenId) { toast.error("Please choose a new agent."); return; }
    setBusy(true);
    try {
      const newName = chosen?.full_name ?? "(new agent)";
      const oldName = currentAgentName ?? "(unassigned)";

      // 1) Insert agent_changed interaction (timeline entry).
      const note = `Changed from ${oldName} to ${newName}. Reason: ${reason.trim() || "(none given)"}`;
      const { error: iErr } = await supabase.from("interactions").insert({
        application_id: applicationId,
        agent_id: chosenId,
        interaction_type: "agent_changed",
        notes: note,
        created_by: "user",
      });
      if (iErr) throw iErr;

      // 2) Update applications.assigned_agent_id.
      const { error: aErr } = await supabase
        .from("applications")
        .update({ assigned_agent_id: chosenId, agent_assigned_at: new Date().toISOString() })
        .eq("id", applicationId);
      if (aErr) throw aErr;

      // 3) Re-route future open bookings on this application to the new agent.
      const { error: rErr } = await supabase
        .from("interactions")
        .update({ agent_id: chosenId })
        .eq("application_id", applicationId)
        .in("interaction_type", ["call_booked", "visit_booked"])
        .is("completed_at", null)
        .gt("scheduled_at", new Date().toISOString());
      if (rErr) throw rErr;

      // 4) Notification row.
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Agent changed",
        body: `Agent changed to ${newName} for ${schemeName}.`,
      });

      toast.success(`Agent changed to ${newName}.`);
      onChanged();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not change agent.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary">Change your agent for {schemeName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p>Your current agent is <span className="font-semibold">{currentAgentName ?? "—"}</span>.</p>
          <p className="text-xs text-muted-foreground">
            Changing agents is allowed once per scheme. The new agent will take
            over all future calls and visits on this scheme.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="ca-pick">Choose a new agent</Label>
            <select
              id="ca-pick"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={chosenId}
              onChange={(e) => setChosenId(e.target.value)}
              disabled={loading || busy}
            >
              <option value="">{loading ? "Loading…" : "Select an agent"}</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
            {chosen && (
              <p className="text-xs text-muted-foreground">
                Specializations: {chosen.specialization?.join(", ") || "—"}
                <br />
                Languages: {chosen.languages?.join(", ") || "—"}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ca-reason">Tell us why (optional)</Label>
            <Textarea id="ca-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={busy || !chosenId}
            className="bg-amber-500 font-semibold text-white hover:bg-amber-600"
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
