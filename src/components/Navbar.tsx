/**
 * Navbar.tsx
 * ----------------------------------------------------------------------------
 * Persistent top navigation bar shown on every page.
 *
 * Sprint 6 layout:
 *   • Tabs: Home · Check Eligibility · Schemes · Status Tracking · Notifications
 *   • Profile + Subscription are now grouped behind a single "Account"
 *     dropdown so the navbar doesn't get bloated with two tabs.
 *   • Literacy + Language toggles unchanged.
 */
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  Home, FileSearch, FileText, Activity, Bell, User, Menu, Globe,
  LogIn, LogOut, ShieldCheck, Sparkles, ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useSubscription } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  key: string;
  icon: typeof Home;
}

export default function Navbar() {
  const { t } = useLanguage();
  const { language, setLanguage } = useLanguage();
  
  const { user, signOut } = useAuth();
  const { isActive } = useSubscription();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Five primary tabs — Profile + Subscription live in the Account dropdown.
  const items: NavItem[] = [
    { to: "/",              key: "nav.home",          icon: Home },
    { to: "/eligibility",   key: "nav.eligibility",   icon: FileSearch },
    { to: "/schemes",       key: "nav.schemes",       icon: FileText },
    { to: "/status",        key: "nav.status",        icon: Activity },
    { to: "/notifications", key: "nav.notifications", icon: Bell },
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
        className={({ isActive: a }) =>
          cn(
            "tap-target inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            "hover:bg-secondary hover:text-secondary-foreground",
            a ? "bg-secondary text-primary" : "text-foreground/80",
          )
        }
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{t(item.key)}</span>
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

          {/* Account dropdown — Profile + Subscription. */}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="tap-target gap-2 text-sm font-medium text-foreground/80 hover:bg-secondary hover:text-secondary-foreground"
                >
                  <User className="h-4 w-4 shrink-0" />
                  <span>Account</span>
                  {isActive && <Sparkles className="h-3 w-3 text-[#16A34A]" aria-label="Premium" />}
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate("/profile")}>
                  <User className="mr-2 h-4 w-4" /> {t("nav.profile")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/subscription")}>
                  <Sparkles className="mr-2 h-4 w-4 text-[#16A34A]" />
                  Subscription
                  {isActive && (
                    <span className="ml-auto rounded-full bg-[#F0FDF4] px-1.5 py-0.5 text-[10px] font-semibold text-[#16A34A]">
                      Active
                    </span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { signOut(); navigate("/"); }}>
                  <LogOut className="mr-2 h-4 w-4" /> {t("nav.signout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>

        {/* Right cluster */}
        <div className="hidden items-center gap-2 lg:flex">
          <Button
            variant="ghost" size="sm"
            onClick={() => setLanguage(language === "en" ? "hi" : "en")}
            aria-label="Switch language"
            className="tap-target gap-2"
          >
            <Globe className="h-4 w-4" />
            <span className="text-xs">{t("nav.language")}</span>
          </Button>
          {!user && (
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
              {user && (
                <>
                  <NavLink
                    to="/profile"
                    onClick={() => setMobileOpen(false)}
                    className="tap-target inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary"
                  >
                    <User className="h-4 w-4" /> {t("nav.profile")}
                  </NavLink>
                  <NavLink
                    to="/subscription"
                    onClick={() => setMobileOpen(false)}
                    className="tap-target inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary"
                  >
                    <Sparkles className="h-4 w-4 text-[#16A34A]" /> Subscription
                    {isActive && (
                      <span className="ml-auto rounded-full bg-[#F0FDF4] px-1.5 py-0.5 text-[10px] font-semibold text-[#16A34A]">
                        Active
                      </span>
                    )}
                  </NavLink>
                </>
              )}
            </nav>
            <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
              <Button
                variant="ghost" size="sm"
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
