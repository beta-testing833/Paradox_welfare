-- Create the eligibility_submissions table to persist logged-in users' eligibility form submissions.
-- Includes all fields from the eligibility form, with the new BPL-conditional ones explicitly listed.
CREATE TABLE IF NOT EXISTS public.eligibility_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  -- Core profile fields
  full_name text,
  age integer,
  gender text,
  state_of_residence text,
  area_type text,
  category text,
  occupation text,
  disability boolean DEFAULT false,
  annual_income numeric,
  -- Sprint 5 BPL-conditional additions
  is_bpl boolean,
  is_distressed boolean,
  family_annual_income numeric,
  guardian_annual_income numeric,
  guardian_not_applicable boolean DEFAULT false,
  -- Optional priority search captured for future analytics
  priority_search text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.eligibility_submissions ENABLE ROW LEVEL SECURITY;

-- Each authenticated user can manage only their own submissions
CREATE POLICY "Users insert own submissions"
  ON public.eligibility_submissions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own submissions"
  ON public.eligibility_submissions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own submissions"
  ON public.eligibility_submissions
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS eligibility_submissions_user_id_idx
  ON public.eligibility_submissions (user_id, created_at DESC);