/**
 * LanguageContext.tsx
 * ----------------------------------------------------------------------------
 * Provides app-wide multi-language support (English ⟷ Hindi).
 *
 * Exposes:
 *   - `language`: the current language code ("en" or "hi").
 *   - `setLanguage`: switches and persists the active language to localStorage.
 *   - `t(key)`: returns the translated string for the given key from i18n.json.
 *
 * Selection persists across reloads via localStorage. Default = "en".
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import dictionary from "@/lib/i18n.json";

// Allowed language codes. Add more keys here when expanding i18n.json.
export type Language = "en" | "hi";

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  /** Look up a translation by key. Returns the key itself if no match, so missing strings are visible. */
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);
const STORAGE_KEY = "welfareconnect.language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Hydrate from localStorage on first render — fall back to English.
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === "undefined") return "en";
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
    return saved === "hi" || saved === "en" ? saved : "en";
  });

  // Persist any change to localStorage so the choice survives reloads.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((lang: Language) => setLanguageState(lang), []);

  // Translation lookup. The dictionary is a JSON map of language → key → string.
  const t = useCallback(
    (key: string): string => {
      const dict = (dictionary as Record<string, Record<string, string>>)[language] ?? {};
      return dict[key] ?? key;
    },
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** Hook for consuming the language context. Throws if used outside the provider. */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
