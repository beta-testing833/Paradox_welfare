/**
 * PaymentModal.tsx
 * ----------------------------------------------------------------------------
 * Dummy ₹1500 / year payment wall used by both the /subscription page and the
 * paywall on the Apply button.
 *
 * Behaviour (per spec):
 *   • Three payment-method tabs: UPI, Card, Net Banking — all visual.
 *   • Inputs validate non-empty only.
 *   • Clicking "Pay ₹1500" shows a 1.5s spinner then succeeds.
 *   • On success we insert (or upsert) a row into public.subscriptions with
 *     expires_at = now() + 365 days, then call onSuccess() so the parent can
 *     refresh subscription status and (in the paywall case) auto-open Apply.
 *
 * Honest disclosure: a small grey line under the button reminds the user
 * this is a demo flow.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after the dummy payment AND the subscriptions insert both succeed. */
  onSuccess?: () => void;
}

const PRICE = 1500;

export default function PaymentModal({ open, onClose, onSuccess }: Props) {
  const { user } = useAuth();

  // Active tab — we only persist the chosen method as a string into the DB.
  const [method, setMethod] = useState<"upi" | "card" | "netbanking">("upi");
  // Per-tab inputs — required only that they are non-empty.
  const [upi, setUpi] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [bank, setBank] = useState("");

  const [paying, setPaying] = useState(false);

  /**
   * Fail the user-fast if the active tab's inputs are blank, otherwise
   * simulate a 1.5s gateway round-trip and persist the subscription row.
   */
  async function handlePay() {
    // Per-method non-empty validation.
    if (method === "upi" && !upi.trim()) { toast.error("Please enter your UPI ID."); return; }
    if (method === "card") {
      if (!cardNumber.trim() || !cardExpiry.trim() || !cardCvv.trim()) {
        toast.error("Please fill in all card details.");
        return;
      }
    }
    if (method === "netbanking" && !bank.trim()) { toast.error("Please select a bank."); return; }
    if (!user) { toast.error("Please sign in to subscribe."); return; }

    setPaying(true);
    // Simulated payment latency — purely cosmetic.
    await new Promise((r) => setTimeout(r, 1500));

    try {
      // Compute expiry exactly 365 days from now.
      const expires = new Date();
      expires.setDate(expires.getDate() + 365);

      // Build a fake reference so we can demo "Renew Early" later.
      const ref = `DEMO-${Date.now().toString(36).toUpperCase()}`;

      // Upsert on user_id (which is UNIQUE on the table) so renewals just
      // overwrite the existing row instead of throwing a duplicate-key error.
      const { error } = await supabase
        .from("subscriptions")
        .upsert(
          {
            user_id: user.id,
            started_at: new Date().toISOString(),
            expires_at: expires.toISOString(),
            plan: "annual_1500",
            payment_method: method,
            payment_reference: ref,
            is_active: true,
          },
          { onConflict: "user_id" },
        );
      if (error) throw error;

      toast.success(
        `Subscription active until ${expires.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`,
      );
      onSuccess?.();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Payment could not be recorded.";
      toast.error(msg);
    } finally {
      setPaying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !paying && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary">Complete Payment</DialogTitle>
        </DialogHeader>

        {/* Amount summary */}
        <div className="rounded-lg border border-[#AACDE0] bg-[#D6E4F0]/30 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Amount due</p>
          <p className="mt-1 text-3xl font-extrabold text-primary">₹{PRICE.toLocaleString("en-IN")}</p>
          <p className="text-xs text-muted-foreground">WelfareConnect Premium · 1 year</p>
        </div>

        {/* Method tabs */}
        <Tabs value={method} onValueChange={(v) => setMethod(v as typeof method)} className="mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upi">UPI</TabsTrigger>
            <TabsTrigger value="card">Card</TabsTrigger>
            <TabsTrigger value="netbanking">Net Banking</TabsTrigger>
          </TabsList>

          <TabsContent value="upi" className="space-y-2 pt-3">
            <Label htmlFor="upi-id">UPI ID</Label>
            <Input id="upi-id" placeholder="yourname@upi" value={upi} onChange={(e) => setUpi(e.target.value)} />
          </TabsContent>

          <TabsContent value="card" className="space-y-3 pt-3">
            <div>
              <Label htmlFor="card-num">Card Number</Label>
              <Input id="card-num" placeholder="4111 1111 1111 1111" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="card-exp">Expiry</Label>
                <Input id="card-exp" placeholder="MM/YY" value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="card-cvv">CVV</Label>
                <Input id="card-cvv" placeholder="123" value={cardCvv} onChange={(e) => setCardCvv(e.target.value)} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="netbanking" className="space-y-2 pt-3">
            <Label htmlFor="bank">Bank Name</Label>
            <Input id="bank" placeholder="e.g. SBI, HDFC" value={bank} onChange={(e) => setBank(e.target.value)} />
          </TabsContent>
        </Tabs>

        <Button onClick={handlePay} disabled={paying} size="lg" className="mt-2 w-full font-semibold">
          {paying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {paying ? "Processing…" : `Pay ₹${PRICE.toLocaleString("en-IN")}`}
        </Button>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          This is a demo payment. No real transaction will occur.
        </p>
      </DialogContent>
    </Dialog>
  );
}
