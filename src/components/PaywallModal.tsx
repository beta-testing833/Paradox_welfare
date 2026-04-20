/**
 * PaywallModal.tsx
 * ----------------------------------------------------------------------------
 * Shown when an unsubscribed user clicks "Apply" on a scheme. Explains that
 * the application + consultation flow is premium-only and offers a CTA to
 * subscribe right inside the modal.
 *
 * On a successful dummy payment, we close the paywall and call onSubscribed()
 * — the caller (typically the scheme detail / schemes list) then opens the
 * Apply modal so the user resumes their original flow without friction.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Sparkles } from "lucide-react";
import PaymentModal from "@/components/PaymentModal";
import { useSubscription } from "@/hooks/useSubscription";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after the user successfully completes the dummy payment. */
  onSubscribed: () => void;
}

const BENEFITS = [
  "Personal consultation call for every application",
  "End-to-end guidance from eligibility to disbursement",
  "Priority document review",
  "Multi-application tracking & reminders",
];

export default function PaywallModal({ open, onClose, onSubscribed }: Props) {
  const [payOpen, setPayOpen] = useState(false);
  const { refresh } = useSubscription();

  /** Bridge: payment succeeded → refresh hook → tell parent to resume Apply. */
  async function handlePaymentSuccess() {
    await refresh();
    setPayOpen(false);
    onSubscribed();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Sparkles className="h-5 w-5 text-accent" />
              Apply with a Premium Subscription
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-foreground">
            The application and consultation service is available to Premium members.
            Subscribe for ₹1500/year to schedule your consultation call and get
            end-to-end help.
          </p>

          <ul className="space-y-2">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <div className="mt-2 flex flex-col gap-2">
            <Button size="lg" className="w-full font-semibold" onClick={() => setPayOpen(true)}>
              Subscribe Now — ₹1500 / year
            </Button>
            <Button variant="ghost" onClick={onClose}>Maybe later</Button>
          </div>
        </DialogContent>
      </Dialog>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onSuccess={handlePaymentSuccess}
      />
    </>
  );
}
