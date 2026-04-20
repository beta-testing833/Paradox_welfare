/**
 * PaywallModal.tsx
 * ----------------------------------------------------------------------------
 * Shown when an unsubscribed user clicks "Apply" on a scheme. Offers two
 * paid options side-by-side:
 *
 *   • Saathi Pack — 3 calls + 1 visit for THIS scheme, valid 45 days
 *   • Saathi Plus — unlimited applications, 15 calls + 3 visits for the year
 *
 * If the user is concession-eligible (senior, BPL, student under 25, or
 * disabled), prices auto-discount 50% and a green strip is shown above
 * the cards explaining why.
 *
 * Special case: if the user already has Saathi Plus but their call quota
 * is exhausted, we add a third compact option offering top-ups so they
 * don't have to leave the flow.
 *
 * On successful payment from inside this modal we close the paywall and
 * call onUnlocked() — the parent (ApplyButton) then opens the Apply modal
 * so the user resumes their original action without re-clicking.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Sparkles, AlertTriangle } from "lucide-react";
import PaymentModal, { PaymentPurpose } from "@/components/PaymentModal";
import { isConcessionEligible, applyConcession, PRICES } from "@/lib/concession";
import { useAuth } from "@/contexts/AuthContext";
import type { ActivePlus } from "@/hooks/usePlanAccess";

interface Props {
  open: boolean;
  onClose: () => void;
  scheme: { id: string; name: string };
  /** Pass the existing Plus subscription when access === 'plus_quota_exhausted'. */
  exhaustedPlus?: ActivePlus | null;
  /** Called after a successful purchase — caller should open the Apply modal. */
  onUnlocked: () => void;
}

const PACK_BENEFITS = [
  "3 consultation calls + 1 agent home visit",
  "Tied to this specific scheme",
  "Valid for 45 days",
];
const PLUS_BENEFITS = [
  "Unlimited scheme applications",
  "15 calls + 3 agent visits pooled across the year",
  "Priority scheduling",
];

export default function PaywallModal({ open, onClose, scheme, exhaustedPlus, onUnlocked }: Props) {
  const { user } = useAuth();

  // Concession lookup happens once when the modal opens.
  const [eligible, setEligible] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  // Which sub-payment dialog is currently open (null = paywall is the topmost).
  const [payment, setPayment] = useState<null | {
    purpose: PaymentPurpose;
    amount: number;
    fullPrice: number;
    topupTargetId?: string;
    topupAppliesTo?: "saathi_plus_annual" | "scheme_pack";
  }>(null);

  // Recompute concession every time the modal opens so it can never go stale.
  useEffect(() => {
    if (!open || !user) { setEligible(false); setReason(null); return; }
    let cancelled = false;
    isConcessionEligible(user.id).then((res) => {
      if (cancelled) return;
      setEligible(res.eligible);
      setReason(res.reason);
    });
    return () => { cancelled = true; };
  }, [open, user]);

  // Pre-compute the four prices we may render.
  const packPrice = applyConcession(PRICES.saathi_pack_full, eligible);
  const plusPrice = applyConcession(PRICES.saathi_plus_full, eligible);

  /** After ANY payment success, propagate up so caller can open Apply. */
  function handlePaid() {
    setPayment(null);
    onUnlocked();
  }

  return (
    <>
      <Dialog open={open && !payment} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Sparkles className="h-5 w-5 text-accent" />
              Apply for {scheme.name}
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">Choose how you'd like to proceed:</p>

          {/* Quota-exhausted amber strip (shown only when applicable). */}
          {exhaustedPlus && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Your Saathi Plus quota is exhausted. Top up calls for ₹{PRICES.topup_call} each
                or buy a Pack for this scheme.
              </span>
            </div>
          )}

          {/* Concession green strip */}
          {eligible && (
            <div className="rounded-md border border-[#16A34A] bg-[#F0FDF4] p-3 text-center text-sm font-medium text-[#16A34A]">
              50% concession applied — {reason}
            </div>
          )}

          {/* Two side-by-side option cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Option A — Pack for this scheme */}
            <div className="flex flex-col rounded-lg border border-[#AACDE0] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-primary">Pack for {scheme.name}</h3>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-primary">₹{packPrice}</span>
                {eligible && (
                  <span className="text-sm text-muted-foreground line-through">₹{PRICES.saathi_pack_full}</span>
                )}
              </div>
              <ul className="mt-3 flex-1 space-y-1.5 text-xs">
                {PACK_BENEFITS.map((b) => (
                  <li key={b} className="flex items-start gap-1.5">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16A34A]" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-4 w-full font-semibold"
                onClick={() => setPayment({
                  purpose: "scheme_pack",
                  amount: packPrice,
                  fullPrice: PRICES.saathi_pack_full,
                })}
              >
                Buy Pack — ₹{packPrice}
              </Button>
            </div>

            {/* Option B — Saathi Plus */}
            <div className="relative flex flex-col rounded-lg border-2 border-primary bg-white p-4 shadow-sm">
              <span className="absolute -top-3 right-3 rounded-full bg-[#16A34A] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                Best value
              </span>
              <h3 className="text-sm font-bold text-primary">All Schemes — Saathi Plus Annual</h3>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-primary">₹{plusPrice}</span>
                <span className="text-xs text-muted-foreground">/ year</span>
                {eligible && (
                  <span className="text-sm text-muted-foreground line-through">₹{PRICES.saathi_plus_full}</span>
                )}
              </div>
              <ul className="mt-3 flex-1 space-y-1.5 text-xs">
                {PLUS_BENEFITS.map((b) => (
                  <li key={b} className="flex items-start gap-1.5">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16A34A]" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] italic text-muted-foreground">
                Worth it if you plan to apply to 6+ schemes this year.
              </p>
              <Button
                className="mt-3 w-full font-semibold"
                onClick={() => setPayment({
                  purpose: "saathi_plus_annual",
                  amount: plusPrice,
                  fullPrice: PRICES.saathi_plus_full,
                })}
              >
                Subscribe — ₹{plusPrice} / year
              </Button>
            </div>
          </div>

          {/* Optional top-up card (only when their Plus quota is exhausted) */}
          {exhaustedPlus && (
            <div className="rounded-md border border-[#AACDE0] bg-[#D6E4F0]/30 p-3 text-sm">
              <p className="font-semibold text-primary">Top up your Saathi Plus instead</p>
              <p className="text-xs text-muted-foreground">
                ₹{PRICES.topup_call} per extra call · ₹{PRICES.topup_visit} per extra visit
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPayment({
                    purpose: "topup_call",
                    amount: PRICES.topup_call,
                    fullPrice: PRICES.topup_call,
                    topupTargetId: exhaustedPlus.id,
                    topupAppliesTo: "saathi_plus_annual",
                  })}
                >
                  Top up call (₹{PRICES.topup_call})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPayment({
                    purpose: "topup_visit",
                    amount: PRICES.topup_visit,
                    fullPrice: PRICES.topup_visit,
                    topupTargetId: exhaustedPlus.id,
                    topupAppliesTo: "saathi_plus_annual",
                  })}
                >
                  Top up visit (₹{PRICES.topup_visit})
                </Button>
              </div>
            </div>
          )}

          <div className="text-center text-xs text-muted-foreground">
            Not ready yet? You can come back anytime.{" "}
            <button onClick={onClose} className="text-[#2E5FA3] underline">Maybe later</button>
          </div>
        </DialogContent>
      </Dialog>

      {payment && (
        <PaymentModal
          open
          onClose={() => setPayment(null)}
          amount={payment.amount}
          fullPrice={payment.fullPrice}
          concessionApplied={eligible && payment.amount < payment.fullPrice}
          concessionReason={reason}
          purpose={payment.purpose}
          schemeId={payment.purpose === "scheme_pack" ? scheme.id : null}
          schemeName={scheme.name}
          topupTargetId={payment.topupTargetId ?? null}
          topupAppliesTo={payment.topupAppliesTo ?? null}
          onSuccess={handlePaid}
        />
      )}
    </>
  );
}
