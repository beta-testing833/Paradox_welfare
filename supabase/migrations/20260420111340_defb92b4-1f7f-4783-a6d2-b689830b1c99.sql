-- Add new geographic + economic targeting columns to schemes
ALTER TABLE public.schemes
  ADD COLUMN IF NOT EXISTS allowed_states text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS target_area text NOT NULL DEFAULT 'Any',
  ADD COLUMN IF NOT EXISTS requires_bpl boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subcategory text;

-- Sanity constraint: target_area should be one of the three known values
ALTER TABLE public.schemes
  DROP CONSTRAINT IF EXISTS schemes_target_area_check;
ALTER TABLE public.schemes
  ADD CONSTRAINT schemes_target_area_check
  CHECK (target_area IN ('Any','Urban','Rural'));

-- Index to speed up the future "filter by category" UI on the Schemes page
CREATE INDEX IF NOT EXISTS schemes_category_idx ON public.schemes (category);