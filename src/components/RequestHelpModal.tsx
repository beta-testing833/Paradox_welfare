/**
 * RequestHelpModal.tsx
 * ----------------------------------------------------------------------------
 * Modal triggered by the "Request Help" button on the NGO Partners view.
 *
 * Field order (locked by spec):
 *   1. Your Name           (prefilled from profile when logged in)
 *   2. Phone Number        (10-digit numeric)
 *   3. Aadhar Number       (strict 12-digit numeric — real-time regex)
 *   4. Select Scheme       (dropdown, prefilled with the current scheme)
 *   5. Message             (textarea)
 *   6. Upload Supporting Documents (≤ 3 MB / file, ≤ 10 files)
 *
 * On submit:
 *   • Insert one row into `applications` (status = "Submitted").
 *   • Upload each file to storage bucket `application-docs/<userId>/<appId>/...`.
 *   • Insert one row per file into `application_documents`.
 *   • Insert one row into `notifications` confirming the submission.
 *
 * Requires the user to be logged in — if not, redirects them to /auth.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { Loader2, Upload, X, FileText } from "lucide-react";

const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB hard cap per file
const MAX_FILES = 10;                    // max 10 files per request
const AADHAR_REGEX = /^[0-9]{12}$/;      // exactly 12 digits
const PHONE_REGEX = /^[0-9]{10}$/;       // exactly 10 digits

interface Props {
  open: boolean;
  onClose: () => void;
  ngo: { id: string; name: string };
  scheme: { id: string; name: string };
}

export default function RequestHelpModal({ open, onClose, ngo, scheme }: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [aadhar, setAadhar] = useState("");
  const [schemeId, setSchemeId] = useState(scheme.id);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  // All schemes for the dropdown (so the user can switch if they like).
  const { data: allSchemes = [] } = useQuery({
    queryKey: ["schemes-options"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schemes").select("id,name");
      if (error) throw error;
      return data;
    },
  });

  // Prefill name from profile if available.
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name,phone,aadhar").eq("id", user.id).single().then(({ data }) => {
      if (data) {
        setName(data.full_name ?? "");
        setPhone(data.phone ?? "");
        setAadhar(data.aadhar ?? "");
      }
    });
  }, [user, open]);

  // Live Aadhar regex feedback.
  const aadharValid = useMemo(() => AADHAR_REGEX.test(aadhar), [aadhar]);
  const phoneValid  = useMemo(() => PHONE_REGEX.test(phone), [phone]);

  /** Append newly-selected files, enforcing the 3 MB and 10-file limits client-side. */
  function handleFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    // Reject any file over 3 MB.
    const oversized = incoming.filter((f) => f.size > MAX_FILE_BYTES);
    if (oversized.length) {
      toast.error(`Some files exceed 3 MB: ${oversized.map((f) => f.name).join(", ")}`);
    }
    const valid = incoming.filter((f) => f.size <= MAX_FILE_BYTES);
    // Enforce the 10-file maximum across the combined list.
    const combined = [...files, ...valid].slice(0, MAX_FILES);
    if (files.length + valid.length > MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} files. Extra files were ignored.`);
    }
    setFiles(combined);
  }

  /** Submit: insert application, upload files, insert document rows, insert notification. */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Gate: must be logged in to submit.
    if (!user) {
      toast.error("Please sign in to send a request.");
      onClose();
      navigate("/auth");
      return;
    }
    if (!aadharValid) { toast.error("Aadhar must be exactly 12 digits."); return; }
    if (!phoneValid)  { toast.error("Phone number must be exactly 10 digits."); return; }
    if (!name.trim()) { toast.error("Please enter your name."); return; }

    setBusy(true);
    try {
      // 1) Create the application row.
      const { data: app, error: appErr } = await supabase
        .from("applications")
        .insert({
          user_id: user.id,
          scheme_id: schemeId,
          ngo_id: ngo.id,
          status: "Submitted",
          aadhar,
          message,
        })
        .select()
        .single();
      if (appErr || !app) throw appErr ?? new Error("Failed to create application");

      // 2) Upload each file in parallel to a per-user / per-application folder.
      //    Path layout: <userId>/<applicationId>/<filename> — matches RLS rules
      //    in the migration which scope by storage.foldername(name)[1] = userId.
      const uploads = await Promise.all(
        files.map(async (f) => {
          const path = `${user.id}/${app.id}/${Date.now()}_${f.name}`;
          const { error: upErr } = await supabase.storage.from("application-docs").upload(path, f);
          if (upErr) throw upErr;
          return { application_id: app.id, file_path: path, file_name: f.name, file_size_bytes: f.size };
        }),
      );

      // 3) Persist document metadata rows (one per uploaded file).
      if (uploads.length) {
        const { error: docErr } = await supabase.from("application_documents").insert(uploads);
        if (docErr) throw docErr;
      }

      // 4) Auto-generate a notification for this submission.
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Request submitted",
        body: `Your request for ${scheme.name} has been sent to ${ngo.name}.`,
      });

      toast.success("Request sent! Track its status in Status Tracking.");
      onClose();
      navigate("/status");
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("request.title")} {ngo.name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="r-name">{t("request.name")}</Label>
            <Input id="r-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="r-phone">{t("request.phone")}</Label>
            <Input id="r-phone" inputMode="numeric" maxLength={10} required value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
            {phone && !phoneValid && (
              <p className="text-xs text-destructive">Enter exactly 10 digits.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="r-aadhar">{t("request.aadhar")}</Label>
            <Input id="r-aadhar" inputMode="numeric" maxLength={12} required value={aadhar}
              placeholder="XXXX XXXX XXXX"
              onChange={(e) => setAadhar(e.target.value.replace(/\D/g, ""))} />
            <p className={aadhar && !aadharValid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {aadhar && !aadharValid ? "Aadhar must be exactly 12 digits." : t("request.aadhar.hint")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="r-scheme">{t("request.scheme")}</Label>
            <Select value={schemeId} onValueChange={setSchemeId}>
              <SelectTrigger id="r-scheme"><SelectValue /></SelectTrigger>
              <SelectContent>
                {allSchemes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="r-msg">{t("request.message")}</Label>
            <Textarea id="r-msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>

          {/* Upload */}
          <div className="space-y-1.5">
            <Label>{t("request.upload")}</Label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-secondary/40 px-4 py-6 text-sm transition-colors hover:bg-secondary">
              <Upload className="h-4 w-4 text-primary" />
              <span>Click to upload files</span>
              <input type="file" multiple className="sr-only"
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <p className="text-xs text-muted-foreground">{t("request.upload.hint")}</p>

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

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              {t("request.cancel")}
            </Button>
            <Button type="submit" disabled={busy} className="tap-target font-semibold">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("request.send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
