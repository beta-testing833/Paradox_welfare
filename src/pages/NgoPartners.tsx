/**
 * NgoPartners.tsx
 * ----------------------------------------------------------------------------
 * Route: /schemes/:schemeId/ngos
 *
 * Filtered NGO view — shows ONLY NGOs mapped to the selected scheme via
 * scheme_ngo_map. This page is intentionally NOT in the navbar; it is reached
 * exclusively via the "Find NGO Help" button on a scheme card.
 *
 * Each NGO card has a "Request Help" button that opens <RequestHelpModal />.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Star, MessageSquare } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import RequestHelpModal from "@/components/RequestHelpModal";

interface Ngo {
  id: string;
  name: string;
  location: string | null;
  focus_area: string | null;
  rating: number | null;
  km_from_user: number | null;
  testimonial: string | null;
  testimonial_author: string | null;
}

export default function NgoPartners() {
  const { schemeId } = useParams();
  const { t } = useLanguage();
  const [activeNgo, setActiveNgo] = useState<Ngo | null>(null);

  // Fetch the scheme so we can show its name + pass it to the modal.
  const { data: scheme } = useQuery({
    queryKey: ["scheme", schemeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("schemes").select("id,name,category").eq("id", schemeId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!schemeId,
  });

  // Fetch only NGOs that support this scheme via the scheme_ngo_map join table.
  const { data: ngos = [], isLoading } = useQuery({
    queryKey: ["ngos-for-scheme", schemeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheme_ngo_map")
        .select("ngos(*)")
        .eq("scheme_id", schemeId!);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.ngos as Ngo).filter(Boolean);
    },
    enabled: !!schemeId,
  });

  return (
    <div className="container py-10 animate-fade-in">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2 gap-2">
        <Link to="/schemes"><ArrowLeft className="h-4 w-4" /> {t("ngos.back")}</Link>
      </Button>

      <header className="mb-8">
        <h1 className="text-3xl font-bold text-primary">{t("ngos.title")}</h1>
        {scheme && (
          <p className="mt-2 text-muted-foreground">
            {t("ngos.subtitle")} <span className="font-medium text-foreground">{scheme.name}</span>
          </p>
        )}
      </header>

      {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}
      {!isLoading && ngos.length === 0 && (
        <p className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
          No NGO partners listed for this scheme yet.
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {ngos.map((n) => (
          <Card key={n.id} className="border-border/70 bg-gradient-card shadow-elegant transition-all hover:-translate-y-0.5 hover:shadow-elevated">
            <CardContent className="p-6">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="text-lg font-semibold text-primary leading-snug">{n.name}</h3>
                <Badge variant="secondary" className="gap-1 shrink-0">
                  <Star className="h-3 w-3 fill-current text-warning-foreground" /> {n.rating?.toFixed(1)}
                </Badge>
              </div>
              <p className="text-sm font-medium text-accent">{n.focus_area}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /> {n.location} · {n.km_from_user} {t("ngos.km")}
              </p>
              {n.testimonial && (
                <blockquote className="mt-4 rounded-md bg-secondary/60 p-3 text-sm italic text-foreground/80">
                  <MessageSquare className="mb-1 h-3.5 w-3.5 text-accent" />
                  "{n.testimonial}"
                  <footer className="mt-1 text-xs not-italic text-muted-foreground">— {n.testimonial_author}</footer>
                </blockquote>
              )}
              <Button onClick={() => setActiveNgo(n)} className="mt-5 w-full tap-target font-semibold">
                {t("ngos.requestHelp")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {activeNgo && scheme && (
        <RequestHelpModal
          open={!!activeNgo}
          onClose={() => setActiveNgo(null)}
          ngo={activeNgo}
          scheme={scheme}
        />
      )}
    </div>
  );
}
