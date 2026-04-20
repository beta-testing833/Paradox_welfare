/**
 * Schemes.tsx
 * ----------------------------------------------------------------------------
 * Route: /schemes
 *
 * Lists every government scheme grouped by category. Each scheme card has:
 *   • Verified badge (✓) when scheme.is_verified is true.
 *   • Description.
 *   • Collapsible "Documents Required" dropdown.
 *   • "Find NGO Help" button → /schemes/:id/ngos (filtered NGO view).
 *
 * Pulls from public.schemes — no auth required to browse.
 */
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { BadgeCheck, ExternalLink, Users } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Scheme {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  benefit_amount: string | null;
  required_documents: string[];
  is_verified: boolean;
  official_portal_url: string | null;
}

export default function Schemes() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Fetch all schemes ordered by category, then name.
  const { data: schemes = [], isLoading } = useQuery({
    queryKey: ["schemes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schemes").select("*").order("category").order("name");
      if (error) throw error;
      return data as Scheme[];
    },
  });

  // Group schemes by category for nicer visual section headers.
  const grouped = useMemo(() => {
    const map = new Map<string, Scheme[]>();
    for (const s of schemes) {
      const key = s.category ?? "Other";
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [schemes]);

  return (
    <div className="container py-10 animate-fade-in">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-primary">{t("schemes.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("schemes.subtitle")}</p>
      </header>

      {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}

      <div className="space-y-10">
        {grouped.map(([category, list]) => (
          <section key={category}>
            <div className="mb-4 flex items-center gap-3">
              <span className="h-1 w-8 rounded-full bg-primary" />
              <h2 className="text-xl font-semibold text-primary">{category}</h2>
              <Badge variant="secondary">{list.length}</Badge>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {list.map((s) => (
                <Card key={s.id} className="overflow-hidden border-border/70 bg-gradient-card shadow-elegant transition-all hover:-translate-y-0.5 hover:shadow-elevated">
                  <CardContent className="p-6">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <h3 className="text-lg font-semibold leading-snug text-primary">{s.name}</h3>
                      {s.is_verified && (
                        <Badge className="bg-success text-success-foreground hover:bg-success gap-1">
                          <BadgeCheck className="h-3.5 w-3.5" /> {t("schemes.verified")}
                        </Badge>
                      )}
                    </div>
                    {s.benefit_amount && (
                      <p className="mb-3 inline-block rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                        {s.benefit_amount}
                      </p>
                    )}
                    <p className="text-sm leading-relaxed text-muted-foreground">{s.description}</p>

                    {/* Documents Required dropdown */}
                    <Accordion type="single" collapsible className="mt-4">
                      <AccordionItem value="docs" className="border-border/70">
                        <AccordionTrigger className="text-sm font-medium text-primary hover:no-underline">
                          {t("schemes.docsRequired")} ({s.required_documents.length})
                        </AccordionTrigger>
                        <AccordionContent>
                          <ul className="space-y-1.5 pt-1">
                            {s.required_documents.map((d) => (
                              <li key={d} className="flex items-start gap-2 text-sm text-foreground/80">
                                <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                                {d}
                              </li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => navigate(`/schemes/${s.id}/ngos`)}
                        className="tap-target gap-2"
                      >
                        <Users className="h-4 w-4" /> {t("schemes.findNgo")}
                      </Button>
                      {s.official_portal_url && (
                        <Button asChild size="sm" variant="outline" className="tap-target gap-2">
                          <a href={s.official_portal_url} target="_blank" rel="noopener noreferrer">
                            {t("schemes.officialPortal")} <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
