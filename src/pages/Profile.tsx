/**
 * Profile.tsx
 * ----------------------------------------------------------------------------
 * Route: /profile (protected)
 *
 * Sections:
 *   • Personal Details — Name, Phone, Date of Birth, Aadhar (12-digit regex).
 *   • Password & Security — Change Password modal + Forgot Password link.
 *   • Dashboard button → /dashboard.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, KeyRound, LayoutDashboard, User as UserIcon, ArrowRight } from "lucide-react";

const AADHAR_REGEX = /^[0-9]{12}$/;

export default function Profile() {
  const { user, resetPassword } = useAuth();
  const { t } = useLanguage();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [aadhar, setAadhar] = useState("");
  const [busy, setBusy] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");

  // Hydrate the form from the user's profile row.
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).single().then(({ data }) => {
      if (data) {
        setFullName(data.full_name ?? "");
        setPhone(data.phone ?? "");
        setDob(data.dob ?? "");
        setAadhar(data.aadhar ?? "");
      }
    });
  }, [user]);

  /** Save profile changes. Validates Aadhar regex before writing. */
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (aadhar && !AADHAR_REGEX.test(aadhar)) {
      toast.error("Aadhar must be exactly 12 digits.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        dob: dob || null,
        aadhar: aadhar || null,
      })
      .eq("id", user!.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Profile updated.");
  }

  /** Update the user's password via Supabase Auth. */
  async function handleChangePwd() {
    if (newPwd.length < 6) { toast.error("Password must be at least 6 characters."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password changed.");
    setPwdOpen(false);
    setNewPwd("");
  }

  /** Trigger the Supabase password-reset email flow. */
  async function handleForgot() {
    if (!user?.email) return;
    const { error } = await resetPassword(user.email);
    if (error) toast.error(error.message);
    else toast.success("Reset link sent to your email.");
  }

  return (
    <div className="container py-10 animate-fade-in max-w-3xl">
      <header className="mb-8 flex items-center gap-3">
        <UserIcon className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold text-primary">{t("profile.title")}</h1>
      </header>

      <div className="space-y-6">
        {/* ---------- Personal Details ---------- */}
        <Card className="shadow-elegant">
          <CardHeader className="bg-primary text-primary-foreground rounded-t-lg">
            <CardTitle className="text-base">{t("profile.personal")}</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="p-name">Name</Label>
                <Input id="p-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-phone">Phone Number</Label>
                <Input id="p-phone" inputMode="numeric" maxLength={10} value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-dob">Date of Birth</Label>
                <Input id="p-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-aadhar">Aadhar Number</Label>
                <Input id="p-aadhar" inputMode="numeric" maxLength={12} value={aadhar}
                  placeholder="XXXX XXXX XXXX"
                  onChange={(e) => setAadhar(e.target.value.replace(/\D/g, ""))} />
                {aadhar && !AADHAR_REGEX.test(aadhar) && (
                  <p className="text-xs text-destructive">Aadhar must be exactly 12 digits.</p>
                )}
              </div>
              <Button type="submit" disabled={busy} className="sm:col-span-2 tap-target">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t("profile.save")}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* ---------- Password & Security ---------- */}
        <Card className="shadow-elegant">
          <CardHeader className="bg-primary text-primary-foreground rounded-t-lg">
            <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" /> {t("profile.security")}</CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex flex-wrap gap-3">
            <Button onClick={() => setPwdOpen(true)} variant="outline" className="tap-target">
              {t("profile.changePwd")}
            </Button>
            <Button onClick={handleForgot} variant="ghost" className="tap-target">
              {t("profile.forgotPwd")}
            </Button>
          </CardContent>
        </Card>

        {/* ---------- Dashboard ---------- */}
        <Card className="shadow-elegant bg-gradient-card">
          <CardContent className="p-6 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-primary">My Dashboard</h3>
              <p className="text-sm text-muted-foreground">See applications, history and recommendations.</p>
            </div>
            <Button asChild size="lg" className="tap-target gap-2">
              <Link to="/dashboard"><LayoutDashboard className="h-4 w-4" /> {t("profile.dashboard")} <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Change Password modal */}
      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("profile.changePwd")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="np">New password</Label>
            <Input id="np" type="password" minLength={6} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleChangePwd} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
