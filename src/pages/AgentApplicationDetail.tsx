/**
 * AgentApplicationDetail.tsx
 * ----------------------------------------------------------------------------
 * Route: /agent/application/:id  (role-gated to "agent")
 *
 * Full read-only detail view for one application assigned to the signed-in
 * agent. Shows user info (with masked Aadhar), scheme + plan, consultation
 * details, documents, and the interaction timeline.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, FileText, Loader2, AlertTriangle, Clock, Download } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

interface AgentApplicationDetail {
  id: string;
  user_id: string;
  status: string;
  consultation_status: string | null;
  consultation_date: string | null;
  consultation_time_slot: string | null;
  visit_requested: boolean | null;
  applied_at: string;
  support_expires_at: string | null;
  applied_via: string | null;
  message: string | null;
  aadhar: string | null;
  assigned_agent_id: string | null;
  scheme: { name: string; category: string | null } | null;
  user_profile: { full_name: string | null; phone: string | null } | null;
  documents: {
    id: string;
    file_name: string;
    file_size_bytes: number;
    file_path: string;
  }[];
}

interface InteractionRow {
  id: string;
  interaction_type: string;
  scheduled_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
}

function maskAadhar(a: string | null): string {
  if (!a) return "—";
  const digits = a.replace(/\D/g, "");
  if (digits.length < 4) return "—";
  return `XXXXXXXX${digits.slice(-4)}`;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function planLabel(via: string | null): string {
  if (via === "saathi_plus_annual") return "Saathi Plus (Annual)";
  if (via === "scheme_pack") return "Scheme Pack";
  return "—";
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "Approved") return "default";
  if (s === "Rejected") return "destructive";
  if (s === "Under Review") return "secondary";
  return "outline";
}

export default function AgentApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const meta = (user?.app_metadata as { role?: string; agent_id?: string } | undefined) ?? {};
  const agentId = meta.agent_id;

  const { data: app, isLoading, error } = useQuery({
    queryKey: ["agent-application", id],
    enabled: !!id && !!agentId,
    queryFn: async (): Promise<AgentApplicationDetail | null> => {
      const { data, error } = await supabase
        .from("applications")
        .select(`
          id, user_id, status, consultation_status, consultation_date,
          consultation_time_slot, visit_requested, applied_at, support_expires_at,
          applied_via, message, aadhar, assigned_agent_id,
          scheme:schemes(name, category),
          user_profile:profiles!applications_user_id_fkey(full_name, phone),
          documents:application_documents(id, file_name, file_size_bytes, file_path)
        `)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as AgentApplicationDetail | null) ?? null;
    },
  });

  const { data: interactions = [] } = useQuery({
    queryKey: ["agent-application-interactions", id],
    enabled: !!id && !!agentId && !!app,
    queryFn: async (): Promise<InteractionRow[]> => {
      const { data, error } = await supabase
        .from("interactions")
        .select("id, interaction_type, scheduled_at, notes, created_by, created_at, completed_at")
        .eq("application_id", id!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as InteractionRow[];
    },
  });

  // ---- Loading / error / not-found / not-assigned guards ----
  if (isLoading) {
    return (
      <div className="container flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-10">
        <p className="text-destructive">Could not load application: {(error as Error).message}</p>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <h1 className="text-2xl font-bold">Application not found</h1>
        <Button variant="outline" onClick={() => navigate("/agent/dashboard")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>
      </div>
    );
  }

  // Belt-and-braces: RLS already prevents other agents seeing this row, but
  // double-check on the client too for clearer UX.
  if (agentId && app.assigned_agent_id && app.assigned_agent_id !== agentId) {
    return (
      <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground">This application is not assigned to you.</p>
        <Button asChild variant="outline">
          <Link to="/agent/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link to="/agent/dashboard">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-2xl">
                {app.user_profile?.full_name ?? "Unnamed user"}
              </CardTitle>
              <CardDescription>
                {app.scheme?.name ?? "Unknown scheme"} · Applied{" "}
                {new Date(app.applied_at).toLocaleDateString()}
              </CardDescription>
            </div>
            <Badge variant={statusVariant(app.status)} className="text-sm">
              {app.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Section title="User Information">
            <Row k="Full Name" v={app.user_profile?.full_name ?? "—"} />
            <Row k="Phone" v={app.user_profile?.phone ?? "—"} />
            <Row k="Aadhar" v={maskAadhar(app.aadhar)} />
            {app.message && <Row k="Message" v={app.message} multiline />}
          </Section>

          <Separator />

          <Section title="Scheme & Plan">
            <Row k="Scheme" v={app.scheme?.name ?? "—"} />
            <Row k="Category" v={app.scheme?.category ?? "—"} />
            <Row k="Plan" v={planLabel(app.applied_via)} />
          </Section>

          <Separator />

          <Section title="Consultation">
            <Row k="Date" v={app.consultation_date ?? "—"} />
            <Row k="Slot" v={app.consultation_time_slot ?? "—"} />
            <Row k="Status" v={app.consultation_status ?? "—"} />
            <Row k="Visit Requested" v={app.visit_requested ? "Yes" : "No"} />
            <Row
              k="Support Expires"
              v={app.support_expires_at
                ? new Date(app.support_expires_at).toLocaleDateString()
                : "—"}
            />
          </Section>

          <Separator />

          <Section title="Documents">
            {app.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents uploaded.</p>
            ) : (
              <>
                <ul className="space-y-2">
                  {app.documents.map((d) => (
                    <DocumentRow key={d.id} doc={d} />
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  Files are stored privately. Download links are short-lived signed URLs valid for 1 hour.
                </p>
              </>
            )}
          </Section>
        </CardContent>
      </Card>

      {/* Interaction timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-primary" />
            Interaction Timeline
          </CardTitle>
          <CardDescription>
            All recorded interactions for this application, oldest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {interactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No interactions recorded yet.</p>
          ) : (
            <ol className="space-y-4">
              {interactions.map((it) => (
                <li key={it.id} className="border-l-2 border-primary/40 pl-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium capitalize">{it.interaction_type}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(it.created_at).toLocaleString()}
                    </p>
                  </div>
                  {it.scheduled_at && (
                    <p className="text-sm text-muted-foreground">
                      Scheduled: {new Date(it.scheduled_at).toLocaleString()}
                    </p>
                  )}
                  {it.notes && <p className="mt-1 text-sm">{it.notes}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created by: {it.created_by}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- presentational helpers ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({ k, v, multiline }: { k: string; v: string; multiline?: boolean }) {
  return (
    <div
      className={
        multiline
          ? "space-y-1"
          : "flex flex-wrap items-baseline justify-between gap-3 border-b border-border/50 py-1.5 last:border-b-0"
      }
    >
      <span className="text-sm text-muted-foreground">{k}</span>
      <span className={multiline ? "block text-sm" : "text-sm font-medium"}>{v}</span>
    </div>
  );
}

/**
 * Single document row with an on-demand "Download" button. We mint a signed
 * URL when the agent clicks so links never persist in the DOM/markup.
 */
function DocumentRow({
  doc,
}: {
  doc: { id: string; file_name: string; file_size_bytes: number; file_path: string };
}) {
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    setBusy(true);
    const { data, error } = await supabase
      .storage
      .from("application-docs")
      .createSignedUrl(doc.file_path, 3600);
    setBusy(false);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Could not generate download link");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate text-sm font-medium">{doc.file_name}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-xs text-muted-foreground">{formatBytes(doc.file_size_bytes)}</span>
        <Button size="sm" variant="outline" onClick={handleDownload} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          <span className="ml-1.5 hidden sm:inline">Download</span>
        </Button>
      </div>
    </li>
  );
}
