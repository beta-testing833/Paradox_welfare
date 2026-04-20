/**
 * ApplyModal.tsx
 * ----------------------------------------------------------------------------
 * Submitted by users with an active paid plan. Collects identity, documents,
 * and consultation booking info, then debits one call from the source plan
 * (and one visit, if requested).
 *
 * New props:
 *   • plus — the active Saathi Plus subscription row (when the user is
 *            applying via that plan). null otherwise.
 *   • pack — the active scheme-specific Saathi Pack row (when applying via
 *            a Pack). null otherwise.
 *
 * The caller (ApplyButton) supplies exactly one of these so the modal knows
 * which row to debit on submit.
 *
 * On submit:
 *   1. Insert applications row (with visit_requested + consultation fields)
 *   2. Upload files → application-docs/<userId>/<appId>/...
 *   3. Insert one application_documents row per file
 *   4. Bump calls_used (+1) and visits_used (+1 if requested) on the
 *      source plan
 *   5. Insert a notification row for the user
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Upload, X, FileText, CalendarClock, AlertTriangle } from "lucide-react";
import PaymentModal from "@/components/PaymentModal";
import { PRICES } from "@/lib/concession";
import { combineDateAndSlot, pickAgentForNewApplication, slotStartHHMM } from "@/lib/agentAssignment";
import type { ActivePlus, ActivePack } from "@/hooks/usePlanAccess";

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_FILES = 10;
const AADHAR_REGEX = /^[0-9]{12}$/;
const PHONE_REGEX = /^[0-9]{10}$/;

const TIME_SLOTS = [
  "09:00–10:00", "10:00–11:00", "11:00–12:00", "12:00–13:00",
  "14:00–15:00", "15:00–16:00", "16:00–17:00", "17:00–18:00",
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  scheme: { id: string; name: string };
  plus: ActivePlus | null;
  pack: ActivePack | null;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function ApplyModal({ open, onClose, scheme, plus, pack }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [aadhar, setAadhar] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<string>("");
  const [requestVisit, setRequestVisit] = useState(false);
  const [busy, setBusy] = useState(false);
  // Top-up payment modal for "out of visits" CTA.
  const [topupOpen, setTopupOpen] = useState(false);

  const minDate = useMemo(() => isoDate(new Date()), []);
  const maxDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return isoDate(d);
  }, []);

  // Prefill identity fields from the user's profile.
  useEffect(() => {
    if (!user || !open) return;
    supabase.from("profiles")
      .select("full_name,phone,aadhar")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setName(data.full_name ?? "");
          setPhone(data.phone ?? "");
          setAadhar(data.aadhar ?? "");
        }
      });
  }, [user, open]);

  // Reset visit checkbox when the modal closes so it doesn't stay ticked
  // for a future submission against a different plan.
  useEffect(() => { if (!open) setRequestVisit(false); }, [open]);

  const aadharValid = useMemo(() => AADHAR_REGEX.test(aadhar), [aadhar]);
  const phoneValid  = useMemo(() => PHONE_REGEX.test(phone), [phone]);

  // Source plan summary used by the info strip + visit checkbox logic.
  const source = plus
    ? { kind: "plus" as const, row: plus }
    : pack
      ? { kind: "pack" as const, row: pack }
      : null;
  const callsLeft  = source ? Math.max(0, source.row.calls_total - source.row.calls_used)   : 0;
  const visitsLeft = source ? Math.max(0, source.row.visits_total - source.row.visits_used) : 0;

  /** Append newly-selected files, enforcing the 3 MB and 10-file limits. */
  function handleFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const oversized = incoming.filter((f) => f.size > MAX_FILE_BYTES);
    if (oversized.length) {
      toast.error(`Some files exceed 3 MB: ${oversized.map((f) => f.name).join(", ")}`);
    }
    const valid = incoming.filter((f) => f.size <= MAX_FILE_BYTES);
    const combined = [...files, ...valid].slice(0, MAX_FILES);
    if (files.length + valid.length > MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} files. Extra files were ignored.`);
    }
    setFiles(combined);
  }

  /** Submit handler. */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!user) {
      toast.error("Please sign in to apply.");
      onClose();
      navigate("/auth");
      return;
    }
    if (!source) {
      // Defense-in-depth — should never happen because ApplyButton gates this.
      toast.error("No active plan found. Please subscribe first.");
      return;
    }
    if (!name.trim()) { toast.error("Please enter your name."); return; }
    if (!phoneValid)  { toast.error("Phone must be exactly 10 digits."); return; }
    if (!aadharValid) { toast.error("Aadhar must be exactly 12 digits."); return; }
    if (!date)        { toast.error("Please pick a preferred date."); return; }
    if (!slot)        { toast.error("Please pick a preferred time slot."); return; }
    if (callsLeft <= 0) {
      toast.error("Your plan has no consultation calls remaining.");
      return;
    }

    setBusy(true);
    try {
      // Build the consultation timestamp (used for both the application row
      // AND the interactions rows that drive the timeline + agent calendar).
      const scheduledAtIso = combineDateAndSlot(date, slot);

      // Determine the support window expiry from the source plan. This locks
      // in when "Book Next Call" is allowed for this scheme.
      const supportExpiresAt = source.row.expires_at;

      // Pick the first agent for this scheme (load-balanced, specialization-
      // matched, slot-conflict-aware). Done BEFORE the insert so we can write
      // assigned_agent_id atomically with the row.
      // We also need the scheme's category to pick the best specialization.
      let schemeCategory: string | null = null;
      const { data: schemeRow } = await supabase
        .from("schemes").select("category").eq("id", scheme.id).maybeSingle();
      schemeCategory = schemeRow?.category ?? null;

      const agentId = await pickAgentForNewApplication(schemeCategory, scheduledAtIso);

      // 1) Create application row.
      const { data: app, error: appErr } = await supabase
        .from("applications")
        .insert({
          user_id: user.id,
          scheme_id: scheme.id,
          status: "Submitted",
          consultation_status: "Pending",
          consultation_date: date,
          consultation_time_slot: slot,
          aadhar,
          message,
          visit_requested: requestVisit,
          support_expires_at: supportExpiresAt,
          assigned_agent_id: agentId,
          agent_assigned_at: agentId ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (appErr || !app) throw appErr ?? new Error("Failed to create application");

      // 2) Upload supporting documents in parallel.
      const uploads = await Promise.all(
        files.map(async (f) => {
          const path = `${user.id}/${app.id}/${Date.now()}_${f.name}`;
          const { error: upErr } = await supabase.storage.from("application-docs").upload(path, f);
          if (upErr) throw upErr;
          return { application_id: app.id, file_path: path, file_name: f.name, file_size_bytes: f.size };
        }),
      );
      if (uploads.length) {
        const { error: docErr } = await supabase.from("application_documents").insert(uploads);
        if (docErr) throw docErr;
      }

      // 3) Insert the initial timeline interactions for the booked
      //    consultation (and the optional agent home visit).
      await supabase.from("interactions").insert({
        application_id: app.id,
        agent_id: agentId,
        interaction_type: "call_booked",
        scheduled_at: scheduledAtIso,
        notes: `First consultation call for ${scheme.name}`,
        created_by: "user",
      });
      if (requestVisit) {
        await supabase.from("interactions").insert({
          application_id: app.id,
          agent_id: agentId,
          interaction_type: "visit_booked",
          scheduled_at: scheduledAtIso,
          notes: `First agent home visit for ${scheme.name}`,
          created_by: "user",
        });
      }

      // 4) Debit the source plan's quota: +1 call, +1 visit (if requested).
      const newCallsUsed  = source.row.calls_used + 1;
      const newVisitsUsed = source.row.visits_used + (requestVisit ? 1 : 0);
      if (source.kind === "plus") {
        const { error: qErr } = await supabase
          .from("subscriptions")
          .update({ calls_used: newCallsUsed, visits_used: newVisitsUsed })
          .eq("id", source.row.id);
        if (qErr) throw qErr;
      } else {
        const { error: qErr } = await supabase
          .from("scheme_packs")
          .update({ calls_used: newCallsUsed, visits_used: newVisitsUsed })
          .eq("id", source.row.id);
        if (qErr) throw qErr;
      }

      // 5) Notify the user.
      const friendlyDate = new Date(date).toLocaleDateString(undefined, {
        weekday: "short", day: "2-digit", month: "short", year: "numeric",
      });
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Consultation booked",
        body: `Your call is scheduled for ${friendlyDate} at ${slot}. A consultant will reach you then.`,
      });

      // Silence the unused-import warning for slotStartHHMM; it's exported
      // for callers but not directly invoked in this file.
      void slotStartHHMM;

      toast.success("Application submitted! Track its status in Status Tracking.");
      onClose();
      navigate("/status");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary">Apply for {scheme.name}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Identity */}
            <div className="space-y-1.5">
              <Label htmlFor="a-name">Your Name</Label>
              <Input id="a-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-phone">Phone Number</Label>
              <Input id="a-phone" inputMode="numeric" maxLength={10} required value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
              {phone && !phoneValid && <p className="text-xs text-destructive">Enter exactly 10 digits.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-aadhar">Aadhar Number</Label>
              <Input id="a-aadhar" inputMode="numeric" maxLength={12} required value={aadhar}
                placeholder="XXXX XXXX XXXX"
                onChange={(e) => setAadhar(e.target.value.replace(/\D/g, ""))} />
              <p className={aadhar && !aadharValid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {aadhar && !aadharValid ? "Aadhar must be exactly 12 digits." : "Enter your 12-digit Aadhar number"}
              </p>
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <Label htmlFor="a-msg">Message</Label>
              <Textarea id="a-msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>

            {/* Upload */}
            <div className="space-y-1.5">
              <Label>Upload Supporting Documents</Label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-secondary/40 px-4 py-6 text-sm transition-colors hover:bg-secondary">
                <Upload className="h-4 w-4 text-primary" />
                <span>Click to upload files</span>
                <input type="file" multiple className="sr-only"
                  onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
              </label>
              <p className="text-xs text-muted-foreground">Max 3 MB per file, up to 10 files</p>

              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-accent" />
                        <span className="truncate">{f.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                      </span>
                      <button type="button" aria-label="Remove file"
                        onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                        className="text-muted-foreground hover:text-destructive">
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Plan info strip */}
            {source && (
              <div className="rounded-md border border-[#AACDE0] bg-[#D6E4F0]/30 p-3 text-xs">
                {source.kind === "plus" ? (
                  <p className="text-primary">
                    <span className="font-semibold">Using your Saathi Plus:</span>{" "}
                    {callsLeft} calls, {visitsLeft} visits remaining this year
                  </p>
                ) : (
                  <p className="text-primary">
                    <span className="font-semibold">Using your Pack for {scheme.name}:</span>{" "}
                    {callsLeft} calls, {visitsLeft} visits remaining. Pack expires{" "}
                    {new Date(source.row.expires_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                )}
              </div>
            )}

            {/* Consultation booking */}
            <div className="rounded-lg border border-[#AACDE0] bg-[#D6E4F0]/30 p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-primary">
                <CalendarClock className="h-4 w-4" /> Schedule a Consultation Call
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="a-date">Preferred Date</Label>
                  <Input id="a-date" type="date" required min={minDate} max={maxDate}
                    value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="a-slot">Preferred Time Slot</Label>
                  <Select value={slot} onValueChange={setSlot}>
                    <SelectTrigger id="a-slot"><SelectValue placeholder="Select a slot" /></SelectTrigger>
                    <SelectContent>
                      {TIME_SLOTS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                A WelfareConnect consultant will call you at this time to guide you through the application.
              </p>

              {/* Visit request — only when the plan still has a visit available. */}
              {source && visitsLeft > 0 ? (
                <label className="mt-3 flex items-start gap-2 text-xs">
                  <Checkbox
                    id="a-visit"
                    checked={requestVisit}
                    onCheckedChange={(v) => setRequestVisit(v === true)}
                  />
                  <span>Also request an in-person agent home visit (uses 1 visit from your quota)</span>
                </label>
              ) : source ? (
                <p className="mt-3 flex items-center gap-2 text-xs text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Visits quota exhausted —{" "}
                  <button
                    type="button"
                    className="text-[#2E5FA3] underline"
                    onClick={() => setTopupOpen(true)}
                  >
                    add a visit for ₹{PRICES.topup_visit}
                  </button>
                </p>
              ) : null}
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button type="submit" disabled={busy} className="font-semibold">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Application & Book Call
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Inline visit top-up payment, if the user clicks the amber link. */}
      {source && (
        <PaymentModal
          open={topupOpen}
          onClose={() => setTopupOpen(false)}
          amount={PRICES.topup_visit}
          fullPrice={PRICES.topup_visit}
          concessionApplied={false}
          concessionReason={null}
          purpose="topup_visit"
          topupTargetId={source.row.id}
          topupAppliesTo={source.kind === "plus" ? "saathi_plus_annual" : "scheme_pack"}
          onSuccess={() => {
            // After top-up, allow the user to tick the now-available visit checkbox.
            setRequestVisit(true);
          }}
        />
      )}
    </>
  );
}
