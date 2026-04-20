/**
 * ApplyModal.tsx
 * ----------------------------------------------------------------------------
 * Replaces the old "Request Help from {NGO}" modal. Triggered by the new
 * "Apply" button on every scheme card / scheme detail page.
 *
 * Field order (per spec):
 *   1. Your Name
 *   2. Phone Number              (10-digit)
 *   3. Aadhar Number             (12-digit)
 *   4. Message
 *   5. Upload Supporting Documents (≤ 3 MB / file, ≤ 10 files)
 *   6. Schedule a Consultation Call:
 *        • Preferred Date         (today → today + 30 days)
 *        • Preferred Time Slot    (one of 8 hour ranges)
 *
 * On submit:
 *   1. Insert applications row (scheme_id, aadhar, message, consultation_date,
 *      consultation_time_slot, status='Submitted', consultation_status='Pending')
 *   2. Upload files → application-docs/<userId>/<appId>/...
 *   3. Insert one application_documents row per file
 *   4. Insert a notification: "Consultation booked"
 *
 * Premium-gated: this modal should only ever be opened for users with an
 * active subscription. The gating itself lives in the parent (Schemes,
 * SchemeDetail) — the modal trusts the caller.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Upload, X, FileText, CalendarClock } from "lucide-react";

const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB hard cap per file
const MAX_FILES = 10;
const AADHAR_REGEX = /^[0-9]{12}$/;
const PHONE_REGEX = /^[0-9]{10}$/;

/** Eight hour-long slots covering the working day (with a lunch break). */
const TIME_SLOTS = [
  "09:00–10:00",
  "10:00–11:00",
  "11:00–12:00",
  "12:00–13:00",
  "14:00–15:00",
  "15:00–16:00",
  "16:00–17:00",
  "17:00–18:00",
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  scheme: { id: string; name: string };
}

/** Format a Date as YYYY-MM-DD (HTML date input format). */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function ApplyModal({ open, onClose, scheme }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [aadhar, setAadhar] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Date picker bounds — today through 30 days ahead.
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

  const aadharValid = useMemo(() => AADHAR_REGEX.test(aadhar), [aadhar]);
  const phoneValid  = useMemo(() => PHONE_REGEX.test(phone),  [phone]);

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

  /** Submit handler: insert application, upload docs, create notification. */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Auth gate (caller should also enforce, but defense in depth).
    if (!user) {
      toast.error("Please sign in to apply.");
      onClose();
      navigate("/auth");
      return;
    }
    if (!name.trim()) { toast.error("Please enter your name."); return; }
    if (!phoneValid)  { toast.error("Phone must be exactly 10 digits."); return; }
    if (!aadharValid) { toast.error("Aadhar must be exactly 12 digits."); return; }
    if (!date)        { toast.error("Please pick a preferred date."); return; }
    if (!slot)        { toast.error("Please pick a preferred time slot."); return; }

    setBusy(true);
    try {
      // 1) Create the application row (no NGO — this is the new direct flow).
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

      // 3) Notify the user that their consultation is booked.
      const friendlyDate = new Date(date).toLocaleDateString(undefined, {
        weekday: "short", day: "2-digit", month: "short", year: "numeric",
      });
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Consultation booked",
        body: `Your call is scheduled for ${friendlyDate} at ${slot}. A consultant will reach you then.`,
      });

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

          {/* Consultation booking */}
          <div className="rounded-lg border border-[#AACDE0] bg-[#D6E4F0]/30 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-primary">
              <CalendarClock className="h-4 w-4" /> Schedule a Consultation Call
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="a-date">Preferred Date</Label>
                <Input
                  id="a-date" type="date" required
                  min={minDate} max={maxDate}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-slot">Preferred Time Slot</Label>
                <Select value={slot} onValueChange={setSlot}>
                  <SelectTrigger id="a-slot"><SelectValue placeholder="Select a slot" /></SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              A WelfareConnect consultant will call you at this time to guide you through the application.
            </p>
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
  );
}
