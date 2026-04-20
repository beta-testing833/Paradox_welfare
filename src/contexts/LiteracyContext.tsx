/**
 * LiteracyContext.tsx
 * ----------------------------------------------------------------------------
 * Provides the global "Literacy Mode" toggle.
 *
 * When literacy mode is ON, the navbar and primary action buttons emphasize
 * lucide-react icons alongside large, simple text — making the app usable by
 * low-literacy users without requiring strong reading ability.
 *
 * Selection persists in localStorage. No backend involvement.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";

interface LiteracyContextValue {
  /** When true, UI shows large icons and short labels for low-literacy users. */
  literacyMode: boolean;
  toggleLiteracy: () => void;
}

const LiteracyContext = createContext<LiteracyContextValue | undefined>(undefined);
const STORAGE_KEY = "welfareconnect.literacy";

export function LiteracyProvider({ children }: { children: ReactNode }) {
  // Hydrate from localStorage so the user's preference survives page reloads.
  const [literacyMode, setLiteracyMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, literacyMode ? "1" : "0");
  }, [literacyMode]);

  const toggleLiteracy = useCallback(() => setLiteracyMode((v) => !v), []);

  const value = useMemo(() => ({ literacyMode, toggleLiteracy }), [literacyMode, toggleLiteracy]);
  return <LiteracyContext.Provider value={value}>{children}</LiteracyContext.Provider>;
}

/** Hook for consuming the literacy context. Throws if used outside the provider. */
export function useLiteracy(): LiteracyContextValue {
  const ctx = useContext(LiteracyContext);
  if (!ctx) throw new Error("useLiteracy must be used within a LiteracyProvider");
  return ctx;
}
