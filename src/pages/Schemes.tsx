/**
 * Schemes.tsx
 * ----------------------------------------------------------------------------
 * Route: /schemes — full government scheme directory.
 *
 * Sprint 6 layout:
 *   • Left: <SchemeFilterSidebar/> with 9 filter groups + live counts.
 *   • Right: scheme cards grouped by category (existing visual).
 *   • Each card now has the "Apply" button (premium-gated) instead of the
 *     old "Find NGO Help".
 *   • <900px: sidebar collapses into a "Filter" button at the top of the
 *     page that opens the same panel inside a Sheet drawer.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { BadgeCheck, ExternalLink, Filter as FilterIcon } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import SchemeFilterSidebar, {
  DEFAULT_FILTERS, type SchemeFilters,
} from "@/components/SchemeFilterSidebar";
import ApplyButton from "@/components/ApplyButton";
import type { EligibilityCriteria } from "@/lib/eligibilityScorer";

interface Scheme {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  benefit_amount: string | null;
  required_documents: string[];
  is_verified: boolean;
  official_portal_url: string | null;
  allowed_states: string[];
  target_area: string;
  requires_bpl: boolean;
  eligibility_criteria: EligibilityCriteria;
}

/** Map an age bucket label → predicate. */
function ageBucketMatches(bucket: string, crit: EligibilityCriteria): boolean {
  if (bucket === "Any") return true;
  // Parse "0-17" / "60+".
  const min = crit.min_age ?? 0;
  const max = crit.max_age ?? 200;
  const overlap = (a: number, b: number) => !(max < a || min > b);
  if (bucket === "60+") return overlap(60, 200);
  const [a, b] = bucket.split("-").map(Number);
  return overlap(a, b);
}

/** Map an attribute id → predicate against a scheme. */
function attributeMatches(attr: string, s: Scheme): boolean {
  const c = s.eligibility_criteria ?? {};
  switch (attr) {
    case "minority":     return !!c.requires_minority;
    case "disabled":     return !!c.disability_required;
    case "dbt":          return !!c.requires_dbt;
    case "bpl":          return !!s.requires_bpl;
    case "distress":     return ((s.category ?? "").toLowerCase() === "food security"
                                 || (s.category ?? "").toLowerCase() === "disability"
                                 || (s.category ?? "").toLowerCase() === "health");
    case "gov_employee": return c.requires_gov_employee === true;
    case "student":      return (c.occupations ?? []).includes("Student");
    default:             return false;
  }
}

/**
 * Decide whether a scheme passes a filter set, optionally IGNORING a single
 * group. We use the "ignore" flag to compute live counts: counting how many
 * schemes would match if the user added one more option to that group, so
 * the count reflects the AND-of-OR semantics correctly.
 */
function passes(s: Scheme, f: SchemeFilters, ignoreGroup?: keyof SchemeFilters | "attributes"): boolean {
  // State filter (single)
  if (ignoreGroup !== "state" && f.state && !s.allowed_states.includes(f.state)) {
    // Empty allowed_states means central scheme → matches every state.
    if (s.allowed_states.length > 0) return false;
  }
  // Categories (OR within group)
  if (ignoreGroup !== "categories" && f.categories.length
      && !f.categories.includes(s.category ?? "")) return false;
  // Genders (OR)
  if (ignoreGroup !== "genders" && f.genders.length) {
    const g = s.eligibility_criteria?.gender_required ?? "Any";
    if (!f.genders.includes(g)) return false;
  }
  // Age bucket (single)
  if (ignoreGroup !== "ageBucket" && !ageBucketMatches(f.ageBucket, s.eligibility_criteria ?? {})) {
    return false;
  }
  // Residence (OR)
  if (ignoreGroup !== "residences" && f.residences.length
      && !f.residences.includes(s.target_area)) return false;
  // Benefit type (OR)
  if (ignoreGroup !== "benefitTypes" && f.benefitTypes.length) {
    const bt = (s.eligibility_criteria?.benefit_type ?? "Any") as string;
    // "Any" benefit-type schemes match any selected option.
    if (bt !== "Any" && !f.benefitTypes.includes(bt)) return false;
  }
  // Employment statuses (OR) — match by intersection with the scheme's occupations list.
  if (ignoreGroup !== "employmentStatuses" && f.employmentStatuses.length) {
    const occs = s.eligibility_criteria?.occupations ?? [];
    const empMatch = f.employmentStatuses.some((e) =>
      e === "Government Employee"
        ? s.eligibility_criteria?.requires_gov_employee === true
        : occs.includes(e),
    );
    if (!empMatch) return false;
  }
  // Occupation (single)
  if (ignoreGroup !== "occupation" && f.occupation) {
    const occs = s.eligibility_criteria?.occupations ?? [];
    if (!occs.includes(f.occupation)) return false;
  }
  // Attributes (AND — every selected attribute must hold)
  if (ignoreGroup !== "attributes" && f.attributes.length) {
    if (!f.attributes.every((a) => attributeMatches(a, s))) return false;
  }
  return true;
}

export default function Schemes() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<SchemeFilters>(DEFAULT_FILTERS);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fetch every scheme once (RLS allows public read). Sort for predictability.
  const { data: schemes = [], isLoading } = useQuery({
    queryKey: ["schemes-all"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schemes")
        .select("*")
        .order("category")
        .order("name");
      if (error) throw error;
      return data as unknown as Scheme[];
    },
  });

  /** Schemes after applying the active filter set — drives the right column. */
  const filtered = useMemo(
    () => schemes.filter((s) => passes(s, filters)),
    [schemes, filters],
  );

  /**
   * Live count callback for the sidebar — counts schemes that would match
   * if the user added/kept this option in the given group. We re-run the
   * filter ignoring the target group so AND-of-OR remains correct.
   */
  const getCount = (group: keyof SchemeFilters | "attributes", value: string): number => {
    return schemes.reduce((n, s) => {
      // First ensure all OTHER groups already match.
      if (!passes(s, filters, group)) return n;
      // Then evaluate just this option.
      let match = false;
      switch (group) {
        case "categories":         match = (s.category ?? "") === value; break;
        case "genders":            match = (s.eligibility_criteria?.gender_required ?? "Any") === value; break;
        case "residences":         match = s.target_area === value; break;
        case "benefitTypes": {
          const bt = (s.eligibility_criteria?.benefit_type ?? "Any") as string;
          match = bt === value || bt === "Any";
          break;
        }
        case "employmentStatuses":
          match = value === "Government Employee"
            ? s.eligibility_criteria?.requires_gov_employee === true
            : (s.eligibility_criteria?.occupations ?? []).includes(value);
          break;
        case "attributes":         match = attributeMatches(value, s); break;
        default:                   match = true;
      }
      return n + (match ? 1 : 0);
    }, 0);
  };

  /** Render the right-column scheme cards grouped by category. */
  const grouped = useMemo(() => {
    const map = new Map<string, Scheme[]>();
    for (const s of filtered) {
      const key = s.category ?? "Other";
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const sidebar = (
    <SchemeFilterSidebar filters={filters} onChange={setFilters} getCount={getCount} />
  );

  return (
    <div className="container py-10 animate-fade-in">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-primary">{t("schemes.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("schemes.subtitle")}</p>
      </header>

      {/* Mobile filter trigger — visible <900px. */}
      <div className="mb-4 lg:hidden">
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full gap-2">
              <FilterIcon className="h-4 w-4" /> Filter
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[320px] overflow-y-auto p-4">
            <SchemeFilterSidebar
              filters={filters}
              onChange={(f) => { setFilters(f); }}
              getCount={getCount}
              variant="drawer"
            />
          </SheetContent>
        </Sheet>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="hidden lg:block">{sidebar}</div>

        <div className="space-y-10">
          {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}

          {!isLoading && filtered.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-10 text-center">
              <p className="text-sm text-muted-foreground">
                No schemes match your filters. Try relaxing some of them.
              </p>
              <Button variant="outline" className="mt-3" onClick={() => setFilters(DEFAULT_FILTERS)}>
                Reset Filters
              </Button>
            </div>
          )}

          {grouped.map(([category, list]) => (
            <section key={category}>
              <div className="mb-4 flex items-center gap-3">
                <span className="h-1 w-8 rounded-full bg-primary" />
                <h2 className="text-xl font-semibold text-primary">{category}</h2>
                <Badge variant="secondary">{list.length}</Badge>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                {list.map((s) => (
                  <Card
                    key={s.id}
                    className="overflow-hidden border-border/70 bg-gradient-card shadow-elegant transition-all hover:-translate-y-0.5 hover:border-[#AACDE0] hover:shadow-elevated"
                  >
                    <CardContent className="p-6">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/schemes/${s.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/schemes/${s.id}`);
                          }
                        }}
                        className="cursor-pointer"
                      >
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
                      </div>

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
                        {/* Sprint 6: Apply replaces Find NGO Help. */}
                        <ApplyButton
                          scheme={{ id: s.id, name: s.name }}
                          size="sm"
                          stopCardPropagation
                        />
                        {s.official_portal_url && (
                          <Button asChild size="sm" variant="outline" className="gap-2">
                            <a
                              href={s.official_portal_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
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
    </div>
  );
}
