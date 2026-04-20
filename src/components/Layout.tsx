/**
 * Layout.tsx
 * ----------------------------------------------------------------------------
 * App shell wrapping every page with a persistent <Navbar /> and a footer.
 * Pages render via React Router's <Outlet />.
 */
import { Outlet } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Layout() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-screen flex-col bg-gradient-soft">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border bg-background py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} {t("app.name")} · Built for citizens of India.
      </footer>
    </div>
  );
}
