/**
 * ApplyButton.tsx
 * ----------------------------------------------------------------------------
 * Shared "Apply" CTA used on every scheme card and the scheme detail page.
 *
 * Gating logic (executed on click):
 *   1. Signed-out  → save intent, send to /auth, return there.
 *   2. Has Saathi Plus with calls remaining          → open Apply modal.
 *   3. Has a Saathi Pack for THIS scheme with calls  → open Apply modal.
 *   4. Has Saathi Plus but quota exhausted           → Paywall with top-ups.
 *   5. Otherwise (no plan / pack for other scheme)   → Paywall.
 *
 * Visual style: navy fill + white text, right-arrow icon. Use the `size`
 * prop to switch between card-size and hero-size on the detail page.
 */
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import ApplyModal from "@/components/ApplyModal";
import PaywallModal from "@/components/PaywallModal";

interface Props {
  scheme: { id: string; name: string };
  size?: "default" | "sm" | "lg";
  className?: string;
  /** Optional label override (defaults to "Apply"). */
  label?: string;
  /**
   * If true, the click handler also stops propagation so the wrapping card
   * doesn't navigate to the scheme detail page.
   */
  stopCardPropagation?: boolean;
}

export default function ApplyButton({
  scheme, size = "default", className, label = "Apply", stopCardPropagation,
}: Props) {
  const { user } = useAuth();
  const { access, plus, pack, loading, refresh } = usePlanAccess(scheme.id);
  const navigate = useNavigate();
  const location = useLocation();

  const [applyOpen, setApplyOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  /** Click handler — runs the gating logic. */
  function handleClick(e: React.MouseEvent) {
    if (stopCardPropagation) e.stopPropagation();

    // Logged-out → bounce to /auth and remember where to return.
    if (!user) {
      navigate("/auth", { state: { from: location.pathname, applySchemeId: scheme.id } });
      return;
    }

    // Plan state still loading → swallow the click; user can retry in 200ms.
    if (loading) return;

    // Plus or Pack with quota → open Apply modal directly.
    if (access === "plus" || access === "pack") {
      setApplyOpen(true);
      return;
    }

    // Plus quota exhausted, or no plan at all → Paywall.
    setPaywallOpen(true);
  }

  return (
    <>
      <Button
        size={size}
        onClick={handleClick}
        className={className ?? "font-semibold"}
      >
        {label} <ArrowRight className="ml-1 h-4 w-4" />
      </Button>

      <ApplyModal
        open={applyOpen}
        onClose={() => { setApplyOpen(false); void refresh(); }}
        scheme={scheme}
        plus={access === "plus" ? plus : null}
        pack={access === "pack" ? pack : null}
      />

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        scheme={scheme}
        exhaustedPlus={access === "plus_quota_exhausted" ? plus : null}
        // After ANY successful purchase from inside the paywall, automatically
        // open the Apply modal so the user resumes their original flow.
        onUnlocked={async () => {
          setPaywallOpen(false);
          await refresh();
          setApplyOpen(true);
        }}
      />
    </>
  );
}
