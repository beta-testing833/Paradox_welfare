/**
 * PaymentModal.tsx
 * ----------------------------------------------------------------------------
 * Generic dummy payment wall used for every paid action in the app:
 *
 *   purpose='saathi_plus_annual' → buy / renew the annual plan
 *   purpose='scheme_pack'        → buy a 45-day pack for one scheme
 *   purpose='topup_call'         → +1 consultation call onto an active plan
 *   purpose='topup_visit'        → +1 home visit onto an active plan
 *
 * The modal is intentionally dumb about pricing — it shows whatever amount
 * the caller hands it. The caller is responsible for computing the price
 * (with concession applied) so the displayed amount, the inserted
 * amount_paid, and the concession_applied flag are always in sync.
 *
 * On a successful dummy payment we:
 *   1. Insert into the right Supabase table (subscriptions / scheme_packs /
 *      topup_purchases) and, for top-ups, increment the parent quota.
 *   2. Insert a notification row so the user sees the activation immediately.
 *   3. Toast and call onSuccess(), which lets the parent (Paywall) chain
 *      into the Apply modal seamlessly.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, QrCode, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PaymentPurpose =
  | "saathi_plus_annual"
  | "scheme_pack"
  | "topup_call"
  | "topup_visit";

export interface PaymentResult {
  /** Type of plan that was created or topped up. */
  purpose: PaymentPurpose;
  /** ID of the new (or updated) subscription / pack row, when relevant. */
  rowId?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Final price after concession, in whole rupees. */
  amount: number;
  /** Original price before concession (for the strike-through display). */
  fullPrice: number;
  /** Whether the displayed amount already has the concession baked in. */
  concessionApplied: boolean;
  /** Human-readable concession reason, if any. */
  concessionReason: string | null;
  purpose: PaymentPurpose;
  /** Required when purpose === 'scheme_pack'. */
  schemeId?: string | null;
  /** Pretty scheme name for the heading & notification (scheme_pack only). */
  schemeName?: string | null;
  /** Required when purpose is a topup — points at the plan to top up. */
  topupTargetId?: string | null;
  topupAppliesTo?: "saathi_plus_annual" | "scheme_pack" | null;
  onSuccess?: (result: PaymentResult) => void;
}

export default function PaymentModal({
  open, onClose, amount, fullPrice, concessionApplied, concessionReason,
  purpose, schemeId, schemeName, topupTargetId, topupAppliesTo, onSuccess,
}: Props) {
  const { user } = useAuth();

  // Active tab — we persist the chosen method as a string into the DB.
  const [method, setMethod] = useState<"upi" | "card" | "netbanking">("upi");
  const [upi, setUpi] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [bank, setBank] = useState("");
  const [paying, setPaying] = useState(false);

  /** Heading copy varies by purpose. */
  const heading = (() => {
    switch (purpose) {
      case "saathi_plus_annual": return "Complete Saathi Plus Payment";
      case "scheme_pack":
        return schemeName ? `Complete Saathi Pack Payment for ${schemeName}` : "Complete Saathi Pack Payment";
      case "topup_call":  return "Purchase Extra Consultation Call";
      case "topup_visit": return "Purchase Extra Agent Home Visit";
    }
  })();

  /**
   * Run the dummy gateway, then perform the right Supabase mutations
   * for this purpose. Each branch is independent; they all end with
   * onSuccess() + onClose() on success, or an inline toast on error.
   */
  async function handlePay() {
    // Per-method non-empty validation only (this is a dummy gateway).
    if (method === "upi" && !upi.trim()) { toast.error("Please enter your UPI ID."); return; }
    if (method === "card") {
      if (!cardNumber.trim() || !cardExpiry.trim() || !cardCvv.trim()) {
        toast.error("Please fill in all card details.");
        return;
      }
    }
    if (method === "netbanking" && !bank.trim()) { toast.error("Please select a bank."); return; }
    if (!user) { toast.error("Please sign in to continue."); return; }
    if (purpose === "scheme_pack" && !schemeId) { toast.error("Missing scheme."); return; }
    if ((purpose === "topup_call" || purpose === "topup_visit") &&
        (!topupTargetId || !topupAppliesTo)) {
      toast.error("Missing top-up target.");
      return;
    }

    setPaying(true);
    // Simulated gateway latency — purely cosmetic.
    await new Promise((r) => setTimeout(r, 1500));

    try {
      const ref = `DEMO-${Date.now().toString(36).toUpperCase()}`;
      let result: PaymentResult = { purpose };

      if (purpose === "saathi_plus_annual") {
        // ───────── Annual plan: insert a fresh row valid for 365 days ─────────
        const expires = new Date();
        expires.setDate(expires.getDate() + 365);
        const { data, error } = await supabase
          .from("subscriptions")
          .upsert({
            user_id: user.id,
            plan: "annual_1500",
            plan_type: "saathi_plus_annual",
            started_at: new Date().toISOString(),
            expires_at: expires.toISOString(),
            payment_method: method,
            payment_reference: ref,
            is_active: true,
            calls_total: 15,
            calls_used: 0,
            visits_total: 3,
            visits_used: 0,
            amount_paid: amount,
            concession_applied: concessionApplied,
          }, { onConflict: "user_id" })
          .select("id")
          .single();
        if (error) throw error;
        result = { purpose, rowId: data?.id };

        await supabase.from("notifications").insert({
          user_id: user.id,
          title: "Saathi Plus activated",
          body: `Valid until ${expires.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}. 15 calls and 3 agent visits available for the year.`,
        });
        toast.success(`Saathi Plus active until ${expires.toLocaleDateString()}`);

      } else if (purpose === "scheme_pack") {
        // ───────── Scheme-specific Pack: 45-day validity ─────────
        const expires = new Date();
        expires.setDate(expires.getDate() + 45);
        const { data, error } = await supabase
          .from("scheme_packs")
          .insert({
            user_id: user.id,
            scheme_id: schemeId!,
            expires_at: expires.toISOString(),
            calls_total: 3,
            calls_used: 0,
            visits_total: 1,
            visits_used: 0,
            amount_paid: amount,
            concession_applied: concessionApplied,
            payment_reference: ref,
            is_active: true,
          })
          .select("id")
          .single();
        if (error) throw error;
        result = { purpose, rowId: data?.id };

        await supabase.from("notifications").insert({
          user_id: user.id,
          title: schemeName ? `Pack purchased for ${schemeName}` : "Saathi Pack purchased",
          body: `3 calls and 1 visit available. Expires ${expires.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}.`,
        });
        toast.success("Pack activated.");

      } else {
        // ───────── Top-ups: insert purchase row + bump parent quota ─────────
        const isCall = purpose === "topup_call";
        const insertCol = isCall ? "calls_total" : "visits_total";
        const insertedAmount = amount; // top-ups are always full price

        // 1. Record the purchase.
        const topupInsert: {
          user_id: string;
          topup_type: "extra_call" | "extra_visit";
          units_added: number;
          amount_paid: number;
          applies_to: "saathi_plus_annual" | "scheme_pack";
          payment_reference: string;
          subscription_id?: string;
          scheme_pack_id?: string;
        } = {
          user_id: user.id,
          topup_type: isCall ? "extra_call" : "extra_visit",
          units_added: 1,
          amount_paid: insertedAmount,
          applies_to: topupAppliesTo!,
          payment_reference: ref,
        };
        if (topupAppliesTo === "saathi_plus_annual") topupInsert.subscription_id = topupTargetId!;
        else topupInsert.scheme_pack_id = topupTargetId!;

        const { error: tErr } = await supabase.from("topup_purchases").insert(topupInsert);
        if (tErr) throw tErr;

        // 2. Bump the parent plan's quota by reading current value then +1.
        //    (We can't use an SQL increment via the JS client without an RPC.)
        if (topupAppliesTo === "saathi_plus_annual") {
          const { data: cur, error: readErr } = await supabase
            .from("subscriptions")
            .select("calls_total, visits_total")
            .eq("id", topupTargetId!)
            .single();
          if (readErr) throw readErr;
          const patch = isCall
            ? { calls_total: (cur?.calls_total ?? 0) + 1 }
            : { visits_total: (cur?.visits_total ?? 0) + 1 };
          const { error: upErr } = await supabase
            .from("subscriptions").update(patch).eq("id", topupTargetId!);
          if (upErr) throw upErr;
        } else {
          const { data: cur, error: readErr } = await supabase
            .from("scheme_packs")
            .select("calls_total, visits_total")
            .eq("id", topupTargetId!)
            .single();
          if (readErr) throw readErr;
          const patch = isCall
            ? { calls_total: (cur?.calls_total ?? 0) + 1 }
            : { visits_total: (cur?.visits_total ?? 0) + 1 };
          const { error: upErr } = await supabase
            .from("scheme_packs").update(patch).eq("id", topupTargetId!);
          if (upErr) throw upErr;
        }
        // Eliminate the unused-var warning on insertCol when in this branch.
        void insertCol;

        await supabase.from("notifications").insert({
          user_id: user.id,
          title: isCall ? "Extra call added" : "Extra visit added",
          body: "Your quota has been increased.",
        });
        toast.success(isCall ? "Extra call added to your plan." : "Extra visit added to your plan.");
      }

      onSuccess?.(result);
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
          <DialogTitle className="text-primary">{heading}</DialogTitle>
        </DialogHeader>

        {/* Amount summary — strike-through when concession applied */}
        <div className="rounded-lg border border-[#AACDE0] bg-[#D6E4F0]/30 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Amount due</p>
          <p className="mt-1 text-3xl font-extrabold text-primary">₹{amount.toLocaleString("en-IN")}</p>
          {concessionApplied && (
            <p className="mt-1 text-xs text-[#16A34A]">
              50% concession applied{concessionReason ? ` — ${concessionReason}` : ""}
              <span className="ml-1 text-muted-foreground line-through">₹{fullPrice.toLocaleString("en-IN")}</span>
            </p>
          )}
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
            <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/30 p-4 text-center">
              <div className="h-24 w-24 rounded bg-muted flex items-center justify-center">
                <QrCode className="h-12 w-12 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">Scan QR with any UPI app</p>
              <p className="text-xs font-medium text-primary">or enter UPI ID above</p>
            </div>
          </TabsContent>

          <TabsContent value="card" className="space-y-3 pt-3">
            <div>
              <Label htmlFor="card-num" className="flex items-center gap-1">
                <Lock className="h-3 w-3" /> Card Number
              </Label>
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
            <Label htmlFor="bank">Select Bank</Label>
            <Select value={bank} onValueChange={setBank}>
              <SelectTrigger id="bank">
                <SelectValue placeholder="Choose your bank" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SBI">State Bank of India (SBI)</SelectItem>
                <SelectItem value="HDFC">HDFC Bank</SelectItem>
                <SelectItem value="ICICI">ICICI Bank</SelectItem>
                <SelectItem value="Axis">Axis Bank</SelectItem>
                <SelectItem value="Kotak">Kotak Mahindra Bank</SelectItem>
                <SelectItem value="PNB">Punjab National Bank</SelectItem>
                <SelectItem value="BOB">Bank of Baroda</SelectItem>
                <SelectItem value="Canara">Canara Bank</SelectItem>
                <SelectItem value="UBI">Union Bank of India</SelectItem>
                <SelectItem value="IDFC">IDFC First Bank</SelectItem>
              </SelectContent>
            </Select>
          </TabsContent>
        </Tabs>

        <Button onClick={handlePay} disabled={paying} size="lg" className="mt-2 w-full font-semibold">
          {paying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {paying ? "Processing…" : `Pay ₹${amount.toLocaleString("en-IN")}`}
        </Button>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Payments are secured by Razorpay. UPI, cards and net banking supported.
        </p>
      </DialogContent>
    </Dialog>
  );
}
