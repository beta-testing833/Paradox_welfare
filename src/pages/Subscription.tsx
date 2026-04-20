/**
 * Subscription.tsx
 * ----------------------------------------------------------------------------
 * Route: /subscription (protected)
 *
 * Two views in one page:
 *   • Pricing view (when no active sub) — single centered card with the
 *     ₹1500/year plan, decoy strike-through ₹2500, benefit list, and a
 *     primary "Subscribe Now" CTA that opens <PaymentModal/>.
 *   • Active view (when an active sub exists) — green "Active" badge, the
 *     valid-until date, days remaining and a "Renew Early" button that
 *     re-opens the same payment modal (which upserts a fresh row).
 *
 * Subscription state comes from useSubscription so the page doesn't have to
 * duplicate the read logic.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Sparkles } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import PaymentModal from "@/components/PaymentModal";

const BENEFITS = [
  "Personal consultation call for every scheme application",
  "End-to-end guidance from eligibility to disbursement",
  "Priority document review by our team",
  "Multi-application tracking and reminders",
  "Direct liaison with scheme departments where possible",
];

export default function Subscription() {
  const { isActive, expiresAt, daysRemaining, refresh } = useSubscription();
  const [payOpen, setPayOpen] = useState(false);

  /**
   * After a successful payment, refresh the hook so the page flips from
   * pricing view to active view without a manual reload.
   */
  async function handlePaid() {
    await refresh();
    setPayOpen(false);
  }

  return (
    <div className="container py-10 animate-fade-in">
      <header className="mb-8 text-center">
        <h1 className="flex items-center justify-center gap-2 text-3xl font-bold text-primary">
          <Sparkles className="h-6 w-6 text-accent" /> WelfareConnect Premium
        </h1>
        <p className="mt-2 text-muted-foreground">
          End-to-end help applying for the schemes you qualify for.
        </p>
      </header>

      {isActive ? (
        // ============================== ACTIVE VIEW ==============================
        <Card className="mx-auto max-w-[480px] shadow-elegant">
          <CardHeader className="bg-primary text-primary-foreground rounded-t-lg">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Your Subscription</span>
              <Badge className="bg-[#16A34A] text-white hover:bg-[#16A34A]">Active</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6 text-center">
            <p className="text-sm text-muted-foreground">Valid until</p>
            <p className="text-2xl font-bold text-primary">
              {expiresAt
                ? new Date(expiresAt).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
                : "—"}
            </p>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-primary">{daysRemaining ?? 0}</span> days remaining
            </p>

            <ul className="space-y-2 pt-2 text-left">
              {BENEFITS.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <Button variant="outline" onClick={() => setPayOpen(true)} className="w-full">
              Renew Early
            </Button>
          </CardContent>
        </Card>
      ) : (
        // ============================== PRICING VIEW ==============================
        <Card className="mx-auto max-w-[480px] shadow-elegant">
          <CardHeader className="bg-primary text-primary-foreground rounded-t-lg text-center">
            <CardTitle className="text-base">Annual Plan</CardTitle>
          </CardHeader>
          <CardContent className="p-6 text-center">
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-4xl font-extrabold text-primary">₹1500</span>
              <span className="text-sm text-muted-foreground">/ year</span>
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="line-through">₹2500</span>{" "}
              <span className="ml-1 rounded-full bg-[#F0FDF4] px-2 py-0.5 text-xs font-semibold text-[#16A34A]">
                Save ₹1000
              </span>
            </p>

            <ul className="mt-5 space-y-2 text-left">
              {BENEFITS.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <Button size="lg" onClick={() => setPayOpen(true)} className="mt-6 w-full font-semibold">
              Subscribe Now — ₹1500 / year
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Annual subscription. Valid for 365 days from date of payment.
            </p>
          </CardContent>
        </Card>
      )}

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onSuccess={handlePaid}
      />
    </div>
  );
}
