/**
 * AuthCallback.tsx
 * ----------------------------------------------------------------------------
 * Route: /auth/callback
 *
 * Landing page for Supabase auth email links (signup verification, magic
 * link, password recovery). Because the Supabase client is initialized with
 * `detectSessionInUrl: true` (default), simply landing here is enough for
 * the SDK to parse the URL hash and exchange it for a session. We then:
 *
 *   1. Inspect the URL hash for any `error` / `error_code` (e.g. `otp_expired`).
 *   2. If healthy, call getSession() — if a session exists, redirect to
 *      /dashboard.
 *   3. If the link expired or is invalid, render a friendly error UI with a
 *      "Resend verification email" button that calls supabase.auth.resend().
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MailWarning, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Phase = "checking" | "error" | "ok";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [resendEmail, setResendEmail] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Parse the URL hash (Supabase sends errors there, e.g.
    //   #error=access_denied&error_code=otp_expired&error_description=...)
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const errCode = params.get("error_code") || params.get("error");
    const errDesc = params.get("error_description");

    if (errCode) {
      setErrorMessage(
        errDesc ? decodeURIComponent(errDesc.replace(/\+/g, " ")) : errCode,
      );
      setPhase("error");
      return;
    }

    // Healthy link — give the SDK a moment to swap the URL tokens for a
    // session, then check.
    const timer = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session) {
          toast.success("Email verified — welcome!");
          navigate("/dashboard", { replace: true });
        } else {
          // No error, but no session either — bounce to /auth so the user can sign in.
          navigate("/auth", { replace: true });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not complete sign-in.";
        setErrorMessage(msg);
        setPhase("error");
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [navigate]);

  /** Re-send the signup confirmation email to the address the user types. */
  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    if (!resendEmail.trim()) {
      toast.error("Enter your email address first.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: resendEmail.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      toast.success("Verification email re-sent. Check your inbox.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not resend email.");
    } finally {
      setBusy(false);
    }
  }

  // ---------- Loading ----------
  if (phase === "checking") {
    return (
      <div className="container flex min-h-[80vh] items-center justify-center py-12">
        <Card className="w-full max-w-md shadow-elevated animate-scale-in">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-gradient-hero text-primary-foreground shadow-glow">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">Verifying…</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center pb-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------- Error / expired link ----------
  return (
    <div className="container flex min-h-[80vh] items-center justify-center py-12">
      <Card className="w-full max-w-md shadow-elevated animate-scale-in">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <MailWarning className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Verification link problem</CardTitle>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResend} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resend-email">Resend verification to</Label>
              <Input
                id="resend-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full tap-target" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Resend verification email
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => navigate("/auth", { replace: true })}
            >
              Back to sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
