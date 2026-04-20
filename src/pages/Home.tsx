/**
 * Home.tsx
 * ----------------------------------------------------------------------------
 * Landing page (route "/").
 *
 * Layout:
 *   • Hero with the headline "Find Government Schemes You Deserve" and two
 *     CTAs (Check Eligibility → /eligibility, Explore Schemes → /schemes).
 *   • Three feature cards: Smart Matching, NGO Verification, Trust & Safety.
 *
 * Sets the H1 + meta description for SEO.
 */
import { Link } from "react-router-dom";
import { Sparkles, ShieldCheck, BadgeCheck, ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Home() {
  const { t } = useLanguage();

  // Set the document title and meta description for SEO. <60 / <160 chars.
  useEffect(() => {
    document.title = "WelfareConnect — Find Government Schemes You Deserve";
    const meta = document.querySelector('meta[name="description"]') ||
      Object.assign(document.createElement("meta"), { name: "description" });
    meta.setAttribute("content", "Discover Indian welfare schemes you qualify for and connect with verified NGOs in Kolkata for direct help.");
    document.head.appendChild(meta);
  }, []);

  const features = [
    { icon: Sparkles,    titleKey: "home.feature1.title", bodyKey: "home.feature1.body" },
    { icon: ShieldCheck, titleKey: "home.feature2.title", bodyKey: "home.feature2.body" },
    { icon: BadgeCheck,  titleKey: "home.feature3.title", bodyKey: "home.feature3.body" },
  ];

  return (
    <div className="animate-fade-in">
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-hero opacity-95" aria-hidden="true" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,hsl(0_0%_100%/0.18),transparent_50%),radial-gradient(circle_at_80%_70%,hsl(0_0%_100%/0.12),transparent_55%)]" aria-hidden="true" />
        <div className="container py-20 lg:py-28 text-primary-foreground">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/30 bg-primary-foreground/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified · Trusted · Free
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              {t("home.heading")}
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-primary-foreground/90">
              {t("home.subcopy")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="secondary" className="tap-target font-semibold shadow-elegant">
                <Link to="/eligibility">
                  {t("home.cta.eligibility")} <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="tap-target border-primary-foreground/40 bg-transparent font-semibold text-primary-foreground hover:bg-primary-foreground hover:text-primary">
                <Link to="/schemes">{t("home.cta.schemes")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Feature cards ---------- */}
      <section className="container -mt-10 grid gap-5 pb-16 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => {
          const Icon = f.icon;
          return (
            <Card key={f.titleKey} className="group relative overflow-hidden border-border/60 bg-gradient-card shadow-elegant transition-all hover:shadow-elevated hover:-translate-y-0.5">
              <CardContent className="p-6">
                <div className="mb-4 inline-grid h-11 w-11 place-items-center rounded-lg bg-secondary text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold">{t(f.titleKey)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(f.bodyKey)}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
