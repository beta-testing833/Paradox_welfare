/**
 * AdminCreateAgent.tsx
 * ----------------------------------------------------------------------------
 * Route: /admin/agents/new  (role-gated to "admin" via ProtectedRoute)
 *
 * One-shot agent onboarding form. Calls the `admin-create-agent` edge function
 * which (server-side, with the service role key) creates the auth user,
 * inserts the agents row, links them, and sets app_metadata.
 *
 * The browser never sees the service role key — all privileged work happens
 * inside the edge function.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface CreatedAgent {
  agent: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
  };
  auth_user_id: string;
}

export default function AdminCreateAgent() {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    languages: "English, Hindi",
    specialization: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CreatedAgent | null>(null);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function parseList(raw: string): string[] {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setResult(null);

    const { data, error } = await supabase.functions.invoke("admin-create-agent", {
      body: {
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || undefined,
        languages: parseList(form.languages),
        specialization: parseList(form.specialization),
      },
    });

    setBusy(false);

    if (error) {
      toast.error(error.message ?? "Could not create agent.");
      return;
    }
    if (data && (data as { error?: string }).error) {
      toast.error((data as { error: string }).error);
      return;
    }

    toast.success("Agent created and linked successfully.");
    setResult(data as CreatedAgent);
    // Reset the form for the next entry.
    setForm({
      full_name: "",
      email: "",
      password: "",
      phone: "",
      languages: "English, Hindi",
      specialization: "",
    });
  }

  return (
    <div className="container max-w-2xl space-y-6 py-10">
      <Button asChild variant="ghost" size="sm">
        <Link to="/">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
        </Link>
      </Button>

      <Card>
        <CardHeader className="space-y-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-hero text-primary-foreground shadow-glow">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Create New Agent</CardTitle>
          <CardDescription>
            Creates the auth user, the agent record, and links them in one step.
            The agent can sign in immediately at <code>/agent/login</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name *</Label>
              <Input
                id="full_name"
                required
                value={form.full_name}
                onChange={(e) => update("full_name", e.target.value)}
                placeholder="Priya Sharma"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="off"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="agent@welfareconnect.in"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  placeholder="+91 90000 00000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Initial password * (min 8 chars)</Label>
              <Input
                id="password"
                type="text"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="Share securely with the agent"
              />
              <p className="text-xs text-muted-foreground">
                Visible on screen so you can copy it. Tell the agent to change
                it after first login.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="languages">Languages (comma-separated)</Label>
              <Input
                id="languages"
                value={form.languages}
                onChange={(e) => update("languages", e.target.value)}
                placeholder="English, Hindi, Tamil"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="specialization">Specialisation (comma-separated)</Label>
              <Input
                id="specialization"
                value={form.specialization}
                onChange={(e) => update("specialization", e.target.value)}
                placeholder="Housing, Pension, Education"
              />
            </div>

            <Button type="submit" className="w-full tap-target" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create agent
            </Button>
          </form>

          {result && (
            <div className="mt-6 rounded-md border border-border bg-secondary/40 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Agent created
              </div>
              <ul className="space-y-1 text-sm">
                <li><span className="text-muted-foreground">Agent ID:</span> <code>{result.agent.id}</code></li>
                <li><span className="text-muted-foreground">Auth user ID:</span> <code>{result.auth_user_id}</code></li>
                <li><span className="text-muted-foreground">Name:</span> {result.agent.full_name}</li>
                <li><span className="text-muted-foreground">Email:</span> {result.agent.email}</li>
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                The agent can now sign in at <Link to="/agent/login" className="underline">/agent/login</Link>.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
