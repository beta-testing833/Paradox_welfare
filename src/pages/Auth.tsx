/**
 * Auth.tsx
 * ----------------------------------------------------------------------------
 * Combined sign-in / sign-up screen at /auth.
 *
 * Tab 1 — Sign In: email + password.
 * Tab 2 — Sign Up: full name + email + password (auto-creates a profiles row
 *         via the on_auth_user_created trigger).
 *
 * On success the user is redirected to wherever they came from
 * (location.state.from), or to / by default.
 */
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";

export default function Auth() {
  const { t } = useLanguage();
  const { user, signIn, signUp, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  // Once a user is signed in, bounce them away from /auth.
  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, from, navigate]);

  // Local form state — separate maps for sign-in vs sign-up so they don't clash.
  const [signInData, setSignInData] = useState({ email: "", password: "" });
  const [signUpData, setSignUpData] = useState({ fullName: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  /** Handle the sign-in submit: validate, call Supabase, surface errors as toasts. */
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(signInData.email.trim(), signInData.password);
    setBusy(false);
    if (error) toast.error(error);
    else toast.success("Welcome back!");
  }

  /** Handle the sign-up submit: validate password length, call Supabase. */
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (signUpData.password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    const { error } = await signUp(signUpData.email.trim(), signUpData.password, signUpData.fullName.trim());
    setBusy(false);
    if (error) toast.error(error);
    else toast.success("Account created — you're signed in!");
  }

  /** Trigger the Supabase password-reset email flow. */
  async function handleForgot() {
    const email = signInData.email.trim();
    if (!email) {
      toast.error("Enter your email first, then click Forgot password.");
      return;
    }
    const { error } = await resetPassword(email);
    if (error) toast.error(error);
    else toast.success("Password-reset link sent to your inbox.");
  }

  return (
    <div className="container flex min-h-[80vh] items-center justify-center py-12">
      <Card className="w-full max-w-md shadow-elevated animate-scale-in">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-gradient-hero text-primary-foreground shadow-glow">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">{t("app.name")}</CardTitle>
          <p className="text-sm text-muted-foreground">Sign in to track your applications.</p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">{t("auth.signin")}</TabsTrigger>
              <TabsTrigger value="signup">{t("auth.signup")}</TabsTrigger>
            </TabsList>

            {/* ---------- Sign In ---------- */}
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="si-email">{t("auth.email")}</Label>
                  <Input id="si-email" type="email" required autoComplete="email"
                    value={signInData.email}
                    onChange={(e) => setSignInData({ ...signInData, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="si-pwd">{t("auth.password")}</Label>
                  <Input id="si-pwd" type="password" required autoComplete="current-password"
                    value={signInData.password}
                    onChange={(e) => setSignInData({ ...signInData, password: e.target.value })} />
                </div>
                <Button type="submit" className="w-full tap-target" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("auth.signin")}
                </Button>
                <button
                  type="button"
                  onClick={handleForgot}
                  className="block w-full text-center text-sm text-accent hover:underline"
                >
                  Forgot username/password?
                </button>
              </form>
            </TabsContent>

            {/* ---------- Sign Up ---------- */}
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="su-name">{t("auth.fullname")}</Label>
                  <Input id="su-name" required value={signUpData.fullName}
                    onChange={(e) => setSignUpData({ ...signUpData, fullName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">{t("auth.email")}</Label>
                  <Input id="su-email" type="email" required autoComplete="email"
                    value={signUpData.email}
                    onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-pwd">{t("auth.password")}</Label>
                  <Input id="su-pwd" type="password" required minLength={6} autoComplete="new-password"
                    value={signUpData.password}
                    onChange={(e) => setSignUpData({ ...signUpData, password: e.target.value })} />
                  <p className="text-xs text-muted-foreground">At least 6 characters.</p>
                </div>
                <Button type="submit" className="w-full tap-target" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("auth.signup")}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            By continuing you agree to our terms.{" "}
            <Link to="/" className="text-accent hover:underline">Back to home</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
