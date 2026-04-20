/**
 * SchemeDetail.tsx
 * ----------------------------------------------------------------------------
 * Route: /schemes/:schemeId
 *
 * Sprint 6 changes:
 *   • Primary CTA is now the new "Apply" button (premium-gated). The old
 *     "Find NGO Help" link is gone.
 *   • All text on the navy banner is forced to pure white for readability.
 *   • Verified badge on the banner uses a white stroke + white border.
 */
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BadgeCheck, ExternalLink, ArrowLeft, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ApplyButton from "@/components/ApplyButton";

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
  const { schemeId } = useParams<{ schemeId: string }>();
  const navigate = useNavigate();

  // Fetch the single scheme row by id with try/catch + toast on failure.
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
        const msg = e instanceof Error ? e.message : "Could not load scheme";
        toast({ title: "Failed to load scheme", description: msg, variant: "destructive" });
        throw e;
      }
    },
  });

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

  return (
    <div className="container max-w-3xl py-10 animate-fade-in">
      <Button variant="link" className="mb-3 px-0 text-primary" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>

      <Card className="shadow-elegant">
        {/* Navy header — every text node is forced to pure white. */}
        <CardHeader className="bg-primary rounded-t-lg text-white">
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg text-white">
            <span className="text-white">{data.name}</span>
            {data.is_verified && (
              // White-stroked verified mark — readable on navy.
              <BadgeCheck className="h-5 w-5 text-white" aria-label="Verified scheme" />
            )}
          </CardTitle>
          {/* Category pill — transparent fill + 1px white border + white text */}
          {data.category && (
            <div className="mt-1">
              <span className="inline-block rounded-full border border-white/80 bg-transparent px-2.5 py-0.5 text-xs font-medium text-white">
                {data.category}
              </span>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-6 p-6">
          {data.description && (
            <p className="text-sm leading-relaxed text-foreground">{data.description}</p>
          )}

          {data.benefit_amount && (
            <div className="rounded-md border border-border bg-secondary/40 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Benefit Amount
              </p>
              <p className="mt-1 text-base font-semibold text-primary">{data.benefit_amount}</p>
            </div>
          )}

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

          {/* Primary CTA — premium-gated Apply button (Sprint 6). */}
          <div className="pt-2">
            <ApplyButton scheme={{ id: data.id, name: data.name }} size="lg" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
