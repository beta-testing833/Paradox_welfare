/**
 * Subscription.tsx
 * ----------------------------------------------------------------------------
 * Route: /subscription (protected)
 *
 * "Choose Your Plan" page with three cards:
 *   1. Free                     — discovery only, always free
 *   2. Saathi Pack              — ₹199 (₹99 with concession) per scheme
 *   3. Saathi Plus (Annual)     — ₹999 (₹499 with concession) / year
 *
 * If the signed-in user qualifies for the automatic 50% concession we
 * surface a green banner above the cards explaining why, and the prices
 * inside the cards switch to the discounted amounts with strike-throughs
 * on the originals.
 *
 * If the user already has an active Saathi Plus subscription, the third
 * card flips to an "Active" status view showing expiry, days remaining,
 * and remaining call/visit quotas.
 *
 * Saathi Pack is purchased inside the Apply flow on a per-scheme basis,
 * so its CTA on this page just routes the user to /schemes with a hint.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Sparkles, Lock } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/contexts/AuthContext";
import PaymentModal from "@/components/PaymentModal";
import { isConcessionEligible, applyConcession, PRICES } from "@/lib/concession";

const FREE_BENEFITS = [
  "Unlimited scheme discovery",
  "Personalised eligibility matching",
  "Document requirements per scheme",
  "Status tracking and dashboard",
];
const PACK_BENEFITS = [
  "3 consultation calls + 1 agent home visit",
  "Tied to one specific scheme",
  "Valid for 45 days",
  "Top-ups available",
];
const PLUS_BENEFITS = [
  "Unlimited scheme applications",
  "15 consultation calls + 3 agent home visits / year",
  "Priority scheduling",
  "Top-ups available",
];

export default function Subscription() {
  const { user } = useAuth();
  const {
    isActive, expiresAt, daysRemaining,
    callsTotal, callsUsed, visitsTotal, visitsUsed, refresh,
  } = useSubscription();

  // Concession lookup — kicks off whenever the user changes.
  const [eligible, setEligible] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => {
    if (!user) { setEligible(false); setReason(null); return; }
    isConcessionEligible(user.id).then(({ eligible, reason }) => {
      setEligible(eligible); setReason(reason);
    });
  }, [user]);

  const [payOpen, setPayOpen] = useState(false);

  // Pre-compute prices the cards display.
  const plusPrice = applyConcession(PRICES.saathi_plus_full, eligible);
  const packPrice = applyConcession(PRICES.saathi_pack_full, eligible);

  /** After a successful annual purchase, refresh the hook so the page flips. */
  async function handlePaid() {
    await refresh();
    setPayOpen(false);
  }

  return (
    <div className="container py-10 animate-fade-in">
      <header className="mb-6 text-center">
        <h1 className="flex items-center justify-center gap-2 text-3xl font-bold text-primary">
          <Sparkles className="h-6 w-6 text-accent" /> Choose Your Plan
        </h1>
        <p className="mt-2 text-muted-foreground">
          Scheme discovery is always free. Pick a plan only when you're ready to apply.
        </p>
      </header>

      {/* Concession banner — only visible to signed-in eligible users */}
      {eligible && (
        <div className="mx-auto mb-6 max-w-3xl rounded-md border border-[#16A34A] bg-[#F0FDF4] p-3 text-center text-sm font-medium text-[#16A34A]">
          You qualify for 50% concession pricing — {reason}. Discount is applied automatically.
        </div>
      )}

      {/* Three plan cards */}
      <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
        {/* ============ Card 1 — Free ============ */}
        <Card className="flex flex-col shadow-elegant">
          <CardHeader className="rounded-t-lg bg-secondary text-center">
            <CardTitle className="text-base text-primary">Free</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col p-6 text-center">
            <p className="text-3xl font-extrabold text-primary">₹0</p>
            <p className="text-xs text-muted-foreground">Always free</p>
            <ul className="mt-4 flex-1 space-y-2 text-left text-sm">
              {FREE_BENEFITS.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] italic text-muted-foreground">
              Applying for a scheme requires a Saathi Pack or Saathi Plus plan.
            </p>
            {/* Hide CTA when user already has a paid plan — it's redundant */}
            {!isActive && (
              <Button disabled variant="outline" className="mt-3 w-full">
                You're on this plan
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ============ Card 2 — Saathi Pack ============ */}
        <Card className="relative flex flex-col shadow-elegant border-[#16A34A] border-2">
          <span className="absolute -top-3 right-3 rounded-full bg-[#16A34A] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
            Most popular
          </span>
          <CardHeader className="rounded-t-lg bg-primary text-center text-primary-foreground">
            <CardTitle className="text-base">Saathi Pack</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col p-6 text-center">
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-3xl font-extrabold text-primary">₹{packPrice}</span>
              <span className="text-xs text-muted-foreground">per scheme</span>
            </div>
            {eligible && (
              <p className="text-xs text-muted-foreground">
                <span className="line-through">₹{PRICES.saathi_pack_full}</span>
                <span className="ml-2 text-[#16A34A]">50% off applied</span>
              </p>
            )}
            <ul className="mt-4 flex-1 space-y-2 text-left text-sm">
              {PACK_BENEFITS.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] italic text-muted-foreground">
              Pay only for the schemes you actually apply to.
            </p>
            <Button asChild variant="outline" className="mt-3 w-full">
              <Link to="/schemes">Purchase at Apply</Link>
            </Button>
          </CardContent>
        </Card>

        {/* ============ Card 3 — Saathi Plus (Annual) ============ */}
        <Card className="flex flex-col shadow-elegant">
          <CardHeader className="rounded-t-lg bg-primary text-center text-primary-foreground">
            <CardTitle className="text-base flex items-center justify-center gap-2">
              Saathi Plus
              {isActive && (
                <Badge className="bg-[#16A34A] text-white hover:bg-[#16A34A]">Active</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col p-6 text-center">
            {isActive ? (
              // Active-status view
              <>
                <p className="text-xs text-muted-foreground">Valid until</p>
                <p className="text-2xl font-bold text-primary">
                  {expiresAt
                    ? new Date(expiresAt).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
                    : "—"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-semibold text-primary">{daysRemaining ?? 0}</span> days remaining
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-[#AACDE0] bg-[#D6E4F0]/30 p-2">
                    <p className="text-muted-foreground">Calls left</p>
                    <p className="text-lg font-bold text-primary">
                      {Math.max(0, callsTotal - callsUsed)}<span className="text-xs font-normal text-muted-foreground"> / {callsTotal}</span>
                    </p>
                  </div>
                  <div className="rounded-md border border-[#AACDE0] bg-[#D6E4F0]/30 p-2">
                    <p className="text-muted-foreground">Visits left</p>
                    <p className="text-lg font-bold text-primary">
                      {Math.max(0, visitsTotal - visitsUsed)}<span className="text-xs font-normal text-muted-foreground"> / {visitsTotal}</span>
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setPayOpen(true)} className="mt-4 w-full">
                  Renew Early
                </Button>
              </>
            ) : (
              // Pricing view
              <>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-3xl font-extrabold text-primary">₹{plusPrice}</span>
                  <span className="text-xs text-muted-foreground">/ year</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="line-through">₹{eligible ? PRICES.saathi_plus_full : PRICES.saathi_plus_decoy}</span>
                  {eligible
                    ? <span className="ml-2 text-[#16A34A]">50% off applied</span>
                    : <span className="ml-2 rounded-full bg-[#F0FDF4] px-2 py-0.5 text-[#16A34A]">Best value</span>}
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-left text-sm">
                  {PLUS_BENEFITS.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-[11px] italic text-muted-foreground">
                  Best value if you plan to apply to 6+ schemes this year.
                </p>
                <Button onClick={() => setPayOpen(true)} className="mt-3 w-full font-semibold">
                  {user ? `Subscribe — ₹${plusPrice} / year` : (
                    <>
                      <Lock className="mr-1 h-4 w-4" /> Sign in to subscribe
                    </>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        amount={plusPrice}
        fullPrice={PRICES.saathi_plus_full}
        concessionApplied={eligible}
        concessionReason={reason}
        purpose="saathi_plus_annual"
        onSuccess={handlePaid}
      />
    </div>
  );
}
