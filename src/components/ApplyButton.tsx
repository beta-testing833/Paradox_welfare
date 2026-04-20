/**
 * ApplyButton.tsx
 * ----------------------------------------------------------------------------
 * Shared "Apply" CTA used on every scheme card and the scheme detail page.
 *
 * Encapsulates the full premium-gating dance so callers don't have to repeat
 * it in three places:
 *
 *   1. If the user is signed out → save intent + send to /auth, return there.
 *   2. If signed-in but NOT premium → show <PaywallModal/>; on successful
 *      payment auto-open <ApplyModal/> so the user resumes their flow.
 *   3. If signed-in and premium    → open <ApplyModal/> directly.
 *
 * The button's visual style is locked: navy fill + white text, right-arrow
 * icon, no person icon. Use the `size` prop to switch between card-size and
 * hero-size on the detail page.
 */
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
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
  const { isActive, loading } = useSubscription();
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

    // Subscription state still loading → ignore the click for half a second
    // rather than risk opening the wrong modal.
    if (loading) return;

    if (!isActive) {
      setPaywallOpen(true);
      return;
    }
    setApplyOpen(true);
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
        onClose={() => setApplyOpen(false)}
        scheme={scheme}
      />

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        // After dummy payment succeeds → automatically open the Apply modal.
        onSubscribed={() => {
          setPaywallOpen(false);
          setApplyOpen(true);
        }}
      />
    </>
  );
}
