/**
 * SchemeFilterSidebar.tsx
 * ----------------------------------------------------------------------------
 * Left-side filter panel for /schemes. Pure presentational component — the
 * parent owns the scheme list and the filter state, and we just render
 * controls + emit changes through callbacks.
 *
 * Layout (per spec):
 *   • Header row: "Filter By" left + "Reset Filters" right (green link)
 *   • Filter groups in fixed order:
 *       1. State / UT          — single-select dropdown
 *       2. Scheme Category     — collapsible checkbox list w/ live counts
 *       3. Gender              — collapsible checkbox list
 *       4. Age                 — single-select dropdown (bucket)
 *       5. Residence           — collapsible checkbox list (Urban/Rural/Any)
 *       6. Benefit Type        — collapsible checkbox list (Cash/Kind/Composite)
 *       7. Employment Status   — collapsible checkbox list
 *       8. Occupation          — single-select dropdown
 *       9. Attribute checkboxes (flat) — minority, disabled, DBT, BPL,
 *          economic distress, gov-employee, student.
 *
 * Live counts: `getCount(filterKey, value)` is a callback the parent provides.
 * The parent computes counts against the currently-loaded scheme list AFTER
 * applying every other filter group (so counts honor the AND-of-OR contract).
 */
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { INDIAN_STATES_AND_UTS } from "@/lib/indianStates";

/** Shape of all filters in one place — easy to spread into setState. */
export interface SchemeFilters {
  state: string;                   // "" = any
  categories: string[];
  genders: string[];
  ageBucket: string;               // "Any" | "0-17" | ...
  residences: string[];
  benefitTypes: string[];
  employmentStatuses: string[];
  occupation: string;              // "" = any
  attributes: string[];            // ids from ATTRIBUTE_OPTIONS
}

/** Default state — used by the parent and the Reset button alike. */
export const DEFAULT_FILTERS: SchemeFilters = {
  state: "",
  categories: [],
  genders: [],
  ageBucket: "Any",
  residences: [],
  benefitTypes: [],
  employmentStatuses: [],
  occupation: "",
  attributes: [],
};

export const CATEGORY_OPTIONS = [
  "Health",
  "Education",
  "Agriculture",
  "Women Empowerment",
  "Disability",
  "Food Security",
  "Skill Development",
] as const;

export const GENDER_OPTIONS = ["Male", "Female", "Other", "Any"] as const;

export const AGE_BUCKETS = ["Any", "0-17", "18-25", "26-40", "41-60", "60+"] as const;

export const RESIDENCE_OPTIONS = ["Urban", "Rural", "Any"] as const;

export const BENEFIT_TYPE_OPTIONS = ["Cash", "Kind", "Composite"] as const;

export const EMPLOYMENT_OPTIONS = [
  "Student", "Employed", "Self-employed", "Unemployed", "Retired", "Government Employee",
] as const;

export const OCCUPATION_OPTIONS = [
  "Farmer", "Student", "Daily Wage Worker", "Private Sector",
  "Government", "Self-employed", "Other",
] as const;

/** Flat attribute checkboxes shown at the bottom of the sidebar. */
export const ATTRIBUTE_OPTIONS = [
  { id: "minority",       label: "Minority" },
  { id: "disabled",       label: "Differently Abled" },
  { id: "dbt",            label: "DBT Scheme" },
  { id: "bpl",            label: "Below Poverty Line" },
  { id: "distress",       label: "Economic Distress" },
  { id: "gov_employee",   label: "Government Employee" },
  { id: "student",        label: "Student" },
] as const;

interface Props {
  filters: SchemeFilters;
  onChange: (next: SchemeFilters) => void;
  /**
   * Live counts callback. group identifies which filter we're counting (e.g.
   * "categories", "attributes"); value is the option string/id. Parent
   * computes counts against the rest of the active filters.
   */
  getCount: (group: keyof SchemeFilters | "attributes", value: string) => number;
  /** Visual variant — sidebar (default) or "drawer" for mobile bottom-sheet. */
  variant?: "sidebar" | "drawer";
}

/** Toggle a value in/out of an array — shared helper for every checkbox group. */
function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export default function SchemeFilterSidebar({
  filters, onChange, getCount, variant = "sidebar",
}: Props) {
  // Each collapsible group remembers its open state locally.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    categories: true, genders: false, residences: false, benefitTypes: false,
    employment: false,
  });

  /** Wrapper: render a "+/-" collapsible group header consistently. */
  function GroupHeader({ id, title }: { id: string; title: string }) {
    const open = !!openGroups[id];
    return (
      <CollapsibleTrigger
        className="flex w-full items-center justify-between py-2 text-sm font-semibold text-primary"
        onClick={() => setOpenGroups((g) => ({ ...g, [id]: !open }))}
      >
        <span>{title}</span>
        {open
          ? <Minus className="h-4 w-4 text-[#16A34A]" />
          : <Plus  className="h-4 w-4 text-[#16A34A]" />}
      </CollapsibleTrigger>
    );
  }

  /** Reusable row for a checkbox + label + green count badge. */
  function CheckboxRow({
    id, label, checked, onCheckedChange, count,
  }: {
    id: string;
    label: string;
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
    count: number;
  }) {
    return (
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <Checkbox
            id={id}
            checked={checked}
            onCheckedChange={(v) => onCheckedChange(!!v)}
            className="data-[state=checked]:bg-[#16A34A] data-[state=checked]:border-[#16A34A]"
          />
          <Label htmlFor={id} className="cursor-pointer text-sm font-normal text-foreground">{label}</Label>
        </div>
        <span className="text-xs font-medium text-[#16A34A]">{count}</span>
      </div>
    );
  }

  return (
    <aside
      className={cn(
        "rounded-lg border border-border bg-card p-4",
        variant === "sidebar"
          ? "sticky top-20 w-[280px] max-h-[calc(100vh-6rem)] overflow-y-auto"
          : "w-full",
      )}
      aria-label="Scheme filters"
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
        <h2 className="text-sm font-bold text-primary">Filter By</h2>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="text-xs font-semibold text-[#16A34A] hover:underline"
        >
          Reset Filters
        </button>
      </div>

      {/* 1. State / UT */}
      <div className="mb-3">
        <Label className="mb-1 block text-sm font-semibold text-primary">State / UT</Label>
        <Select
          value={filters.state || "all"}
          onValueChange={(v) => onChange({ ...filters, state: v === "all" ? "" : v })}
        >
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All states" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">All states</SelectItem>
            {INDIAN_STATES_AND_UTS.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 2. Scheme Category */}
      <Collapsible open={!!openGroups.categories}>
        <GroupHeader id="categories" title="Scheme Category" />
        <CollapsibleContent>
          {CATEGORY_OPTIONS.map((c) => (
            <CheckboxRow
              key={c}
              id={`cat-${c}`}
              label={c}
              checked={filters.categories.includes(c)}
              onCheckedChange={() => onChange({ ...filters, categories: toggle(filters.categories, c) })}
              count={getCount("categories", c)}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>

      {/* 3. Gender */}
      <Collapsible open={!!openGroups.genders}>
        <GroupHeader id="genders" title="Gender" />
        <CollapsibleContent>
          {GENDER_OPTIONS.map((g) => (
            <CheckboxRow
              key={g}
              id={`gender-${g}`}
              label={g}
              checked={filters.genders.includes(g)}
              onCheckedChange={() => onChange({ ...filters, genders: toggle(filters.genders, g) })}
              count={getCount("genders", g)}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>

      {/* 4. Age — single-select dropdown */}
      <div className="mb-3 mt-3">
        <Label className="mb-1 block text-sm font-semibold text-primary">Age</Label>
        <Select
          value={filters.ageBucket}
          onValueChange={(v) => onChange({ ...filters, ageBucket: v })}
        >
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {AGE_BUCKETS.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 5. Residence */}
      <Collapsible open={!!openGroups.residences}>
        <GroupHeader id="residences" title="Residence" />
        <CollapsibleContent>
          {RESIDENCE_OPTIONS.map((r) => (
            <CheckboxRow
              key={r}
              id={`res-${r}`}
              label={r}
              checked={filters.residences.includes(r)}
              onCheckedChange={() => onChange({ ...filters, residences: toggle(filters.residences, r) })}
              count={getCount("residences", r)}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>

      {/* 6. Benefit Type */}
      <Collapsible open={!!openGroups.benefitTypes}>
        <GroupHeader id="benefitTypes" title="Benefit Type" />
        <CollapsibleContent>
          {BENEFIT_TYPE_OPTIONS.map((b) => (
            <CheckboxRow
              key={b}
              id={`bt-${b}`}
              label={b}
              checked={filters.benefitTypes.includes(b)}
              onCheckedChange={() => onChange({ ...filters, benefitTypes: toggle(filters.benefitTypes, b) })}
              count={getCount("benefitTypes", b)}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>

      {/* 7. Employment Status */}
      <Collapsible open={!!openGroups.employment}>
        <GroupHeader id="employment" title="Employment Status" />
        <CollapsibleContent>
          {EMPLOYMENT_OPTIONS.map((e) => (
            <CheckboxRow
              key={e}
              id={`emp-${e}`}
              label={e}
              checked={filters.employmentStatuses.includes(e)}
              onCheckedChange={() =>
                onChange({ ...filters, employmentStatuses: toggle(filters.employmentStatuses, e) })
              }
              count={getCount("employmentStatuses", e)}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>

      {/* 8. Occupation — single-select */}
      <div className="mb-3 mt-3">
        <Label className="mb-1 block text-sm font-semibold text-primary">Occupation</Label>
        <Select
          value={filters.occupation || "any"}
          onValueChange={(v) => onChange({ ...filters, occupation: v === "any" ? "" : v })}
        >
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            {OCCUPATION_OPTIONS.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 9. Flat attribute checkboxes */}
      <div className="mt-4 border-t border-border pt-3">
        {ATTRIBUTE_OPTIONS.map((a) => (
          <CheckboxRow
            key={a.id}
            id={`attr-${a.id}`}
            label={a.label}
            checked={filters.attributes.includes(a.id)}
            onCheckedChange={() => onChange({ ...filters, attributes: toggle(filters.attributes, a.id) })}
            count={getCount("attributes", a.id)}
          />
        ))}
      </div>

      {/* Drawer-only close hint — sidebar variant ignores this. */}
      {variant === "drawer" && (
        <div className="mt-4 border-t border-border pt-3 text-center">
          <Button variant="outline" onClick={() => onChange({ ...filters })}>Apply Filters</Button>
        </div>
      )}
    </aside>
  );
}
