/**
 * AgentLogin.tsx
 * ----------------------------------------------------------------------------
 * Route: /agent/login
 *
 * Dedicated sign-in screen for WelfareConnect agents. Uses the same Supabase
 * auth backend as user login but lives on its own URL so agents have a clear,
 * branded entry point. On success, agents land on /agent/dashboard.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export default function AgentLogin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // If an agent is already signed in, send them straight to the dashboard.
  useEffect(() => {
    const role = (user?.app_metadata as { role?: string } | undefined)?.role;
    if (user && role === "agent") navigate("/agent/dashboard", { replace: true });
  }, [user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back, Agent!");
    navigate("/agent/dashboard", { replace: true });
  }

  return (
    <div className="container flex min-h-[80vh] items-center justify-center py-12">
      <Card className="w-full max-w-md shadow-elevated animate-scale-in">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-gradient-hero text-primary-foreground shadow-glow">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl">Agent Portal Login</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sign in to manage your assigned applications.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-email">Email</Label>
              <Input
                id="agent-email"
                type="email"
                autoComplete="email"
                required
                placeholder="agent@welfareconnect.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-password">Password</Label>
              <Input
                id="agent-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full tap-target" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
            <p className="pt-2 text-center text-xs text-muted-foreground">
              This portal is for authorised WelfareConnect agents only.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
