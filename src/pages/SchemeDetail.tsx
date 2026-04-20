/**
 * SchemeDetail.tsx
 * ----------------------------------------------------------------------------
 * Route: /schemes/:schemeId
 *
 * Renders a single welfare scheme in detail. Reachable from:
 *   • The "Your Matches" cards on /eligibility (Sprint 5 change #5)
 *   • Any future deep-link or share URL.
 *
 * Sections (top → bottom):
 *   1. Scheme name + Verified badge + category pill
 *   2. Full description
 *   3. Benefit amount (only if present)
 *   4. Documents Required — fully expanded list (no accordion collapse)
 *   5. Official Portal URL — opens in a new tab
 *   6. Find NGO Help button → /schemes/:id/ngos
 *
 * Data is fetched via react-query against public.schemes (no auth needed).
 */
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BadgeCheck, ExternalLink, Users, ArrowLeft, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * Local row shape — narrowed to just the columns we need for the detail
 * page so we don't accidentally render columns the spec doesn't ask for.
 */
interface SchemeDetailRow {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  benefit_amount: string | null;
  required_documents: string[];
  is_verified: boolean;
  official_portal_url: string | null;
}

export default function SchemeDetail() {
  // Pull the dynamic :schemeId segment out of the route.
  const { schemeId } = useParams<{ schemeId: string }>();
  const navigate = useNavigate();

  // Fetch the single scheme row by id. Wrapped in try/catch via the queryFn
  // so any Supabase error surfaces as a toast rather than a silent failure.
  const { data, isLoading, error } = useQuery({
    queryKey: ["scheme", schemeId],
    enabled: !!schemeId,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("schemes")
          .select("id, name, category, description, benefit_amount, required_documents, is_verified, official_portal_url")
          .eq("id", schemeId!)
          .maybeSingle();
        if (error) throw error;
        return data as SchemeDetailRow | null;
      } catch (e: unknown) {
        // Surface the failure to the user — do not swallow.
        const msg = e instanceof Error ? e.message : "Could not load scheme";
        toast({ title: "Failed to load scheme", description: msg, variant: "destructive" });
        throw e;
      }
    },
  });

  // ---- Loading / error / not-found states ----
  if (isLoading) {
    return <div className="container py-10 text-sm text-muted-foreground">Loading scheme…</div>;
  }
  if (error || !data) {
    return (
      <div className="container py-10">
        <p className="text-sm text-muted-foreground">Scheme not found.</p>
        <Button variant="link" className="mt-2 px-0" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>
    );
  }

  // ---- Main render ----
  return (
    <div className="container max-w-3xl py-10 animate-fade-in">
      {/* Back nav — keeps the page navigable when reached via deep link too. */}
      <Button variant="link" className="mb-3 px-0 text-primary" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>

      <Card className="shadow-elegant">
        {/* Navy header bar to mirror the rest of the design system. */}
        <CardHeader className="bg-primary text-primary-foreground rounded-t-lg">
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
            <span>{data.name}</span>
            {/* Verified badge — only shown when scheme.is_verified is true. */}
            {data.is_verified && (
              <BadgeCheck className="h-5 w-5 text-accent" aria-label="Verified scheme" />
            )}
          </CardTitle>
          {/* Category pill renders inside the navy header for quick context. */}
          {data.category && (
            <div className="mt-1">
              <Badge className="bg-card text-primary hover:bg-card">{data.category}</Badge>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-6 p-6">
          {/* Full description — left as a normal paragraph. */}
          {data.description && (
            <p className="text-sm leading-relaxed text-foreground">{data.description}</p>
          )}

          {/* Benefit amount — only rendered when present, per spec. */}
          {data.benefit_amount && (
            <div className="rounded-md border border-border bg-secondary/40 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Benefit Amount
              </p>
              <p className="mt-1 text-base font-semibold text-primary">{data.benefit_amount}</p>
            </div>
          )}

          {/* Documents Required — fully expanded, no accordion. */}
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-primary">
              <FileText className="h-4 w-4" /> Documents Required
            </h2>
            {data.required_documents && data.required_documents.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                {data.required_documents.map((doc, i) => (
                  <li key={i}>{doc}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No specific documents listed.</p>
            )}
          </div>

          {/* Official Portal URL — external link, new tab + safe rel attrs. */}
          {data.official_portal_url && (
            <div>
              <a
                href={data.official_portal_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#2E5FA3] underline-offset-2 hover:underline"
              >
                Visit Official Portal <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}

          {/* Find NGO Help — routes to the existing filtered NGO view. */}
          <div className="pt-2">
            <Button asChild size="lg" className="font-semibold">
              <Link to={`/schemes/${data.id}/ngos`}>
                <Users className="mr-2 h-4 w-4" /> Find NGO Help
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
