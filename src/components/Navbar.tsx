/**
 * Navbar.tsx
 * ----------------------------------------------------------------------------
 * Persistent top navigation bar shown on every page.
 *
 * Tabs (per spec): Home · Check Eligibility · Schemes · Status Tracking ·
 * Notifications · Profile.  NGO Partners and Success Stories are deliberately
 * EXCLUDED — NGO Partners is reachable only via "Find NGO Help" on a scheme.
 *
 * Also hosts:
 *   • Literacy Mode toggle (eye icon) — swaps in big icons on key labels.
 *   • Language toggle (Globe icon) — switches English ⟷ Hindi.
 *   • Sign-in / Sign-out button.
 */
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  Home, FileSearch, FileText, Activity, Bell, User, Menu, Eye, Globe, LogIn, LogOut, ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLiteracy } from "@/contexts/LiteracyContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** One entry in the navigation list — bound to a translation key + icon. */
interface NavItem {
  to: string;
  key: string;
  icon: typeof Home;
}

export default function Navbar() {
  const { t } = useLanguage();
  const { language, setLanguage } = useLanguage();
  const { literacyMode, toggleLiteracy } = useLiteracy();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Order is locked by the spec — don't reorder.
  const items: NavItem[] = [
    { to: "/",              key: "nav.home",          icon: Home },
    { to: "/eligibility",   key: "nav.eligibility",   icon: FileSearch },
    { to: "/schemes",       key: "nav.schemes",       icon: FileText },
    { to: "/status",        key: "nav.status",        icon: Activity },
    { to: "/notifications", key: "nav.notifications", icon: Bell },
    { to: "/profile",       key: "nav.profile",       icon: User },
  ];

  /** Render a single nav link with active-state styling and optional big icon. */
  const renderLink = (item: NavItem, onClick?: () => void) => {
    const Icon = item.icon;
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === "/"}
        onClick={onClick}
        className={({ isActive }) =>
          cn(
            "tap-target inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            "hover:bg-secondary hover:text-secondary-foreground",
            isActive ? "bg-secondary text-primary" : "text-foreground/80",
          )
        }
      >
        <Icon className={cn("shrink-0", literacyMode ? "h-5 w-5" : "h-4 w-4")} aria-hidden="true" />
        <span className={cn(literacyMode && "text-base font-semibold")}>{t(item.key)}</span>
      </NavLink>
    );
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between gap-3">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 font-bold text-primary">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-hero text-primary-foreground shadow-elegant">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-lg tracking-tight">{t("app.name")}</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {items.map((i) => renderLink(i))}
        </nav>

        {/* Right cluster: literacy + language + auth */}
        <div className="hidden items-center gap-2 lg:flex">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleLiteracy}
            aria-pressed={literacyMode}
            aria-label="Toggle picture mode"
            className={cn("tap-target gap-2", literacyMode && "bg-secondary text-primary")}
          >
            <Eye className="h-4 w-4" />
            <span className="text-xs">{t("nav.literacy")}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLanguage(language === "en" ? "hi" : "en")}
            aria-label="Switch language"
            className="tap-target gap-2"
          >
            <Globe className="h-4 w-4" />
            <span className="text-xs">{t("nav.language")}</span>
          </Button>
          {user ? (
            <Button variant="outline" size="sm" onClick={() => { signOut(); navigate("/"); }} className="tap-target gap-2">
              <LogOut className="h-4 w-4" />
              <span>{t("nav.signout")}</span>
            </Button>
          ) : (
            <Button size="sm" onClick={() => navigate("/auth")} className="tap-target gap-2">
              <LogIn className="h-4 w-4" />
              <span>{t("nav.signin")}</span>
            </Button>
          )}
        </div>

        {/* Mobile menu */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden tap-target" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[290px] p-5">
            <div className="mb-4 flex items-center gap-2 font-bold text-primary">
              <ShieldCheck className="h-5 w-5" />
              {t("app.name")}
            </div>
            <nav className="flex flex-col gap-1">
              {items.map((i) => renderLink(i, () => setMobileOpen(false)))}
            </nav>
            <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
              <Button variant="ghost" size="sm" onClick={toggleLiteracy} className="justify-start gap-2">
                <Eye className="h-4 w-4" /> {t("nav.literacy")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLanguage(language === "en" ? "hi" : "en")}
                className="justify-start gap-2"
              >
                <Globe className="h-4 w-4" /> {t("nav.language")}
              </Button>
              {user ? (
                <Button variant="outline" size="sm" onClick={() => { signOut(); setMobileOpen(false); navigate("/"); }} className="gap-2">
                  <LogOut className="h-4 w-4" /> {t("nav.signout")}
                </Button>
              ) : (
                <Button size="sm" onClick={() => { setMobileOpen(false); navigate("/auth"); }} className="gap-2">
                  <LogIn className="h-4 w-4" /> {t("nav.signin")}
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
