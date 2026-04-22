-- 1. Link agents to Supabase auth users
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Agent-scoped RLS policies (Postgres pre-15 doesn't support IF NOT EXISTS on CREATE POLICY,
--    so drop-then-create for idempotency).
DROP POLICY IF EXISTS "Agents read assigned applications" ON public.applications;
CREATE POLICY "Agents read assigned applications"
  ON public.applications FOR SELECT
  USING (assigned_agent_id::text = (auth.jwt()->'app_metadata'->>'agent_id'));

DROP POLICY IF EXISTS "Agents update assigned applications" ON public.applications;
CREATE POLICY "Agents update assigned applications"
  ON public.applications FOR UPDATE
  USING (assigned_agent_id::text = (auth.jwt()->'app_metadata'->>'agent_id'));

DROP POLICY IF EXISTS "Agents read assigned docs" ON public.application_documents;
CREATE POLICY "Agents read assigned docs"
  ON public.application_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.assigned_agent_id::text = (auth.jwt()->'app_metadata'->>'agent_id')
    )
  );

DROP POLICY IF EXISTS "Agents read assigned interactions" ON public.interactions;
CREATE POLICY "Agents read assigned interactions"
  ON public.interactions FOR SELECT
  USING (agent_id::text = (auth.jwt()->'app_metadata'->>'agent_id'));

DROP POLICY IF EXISTS "Agents insert interactions" ON public.interactions;
CREATE POLICY "Agents insert interactions"
  ON public.interactions FOR INSERT
  WITH CHECK (agent_id::text = (auth.jwt()->'app_metadata'->>'agent_id'));

DROP POLICY IF EXISTS "Agents update interactions" ON public.interactions;
CREATE POLICY "Agents update interactions"
  ON public.interactions FOR UPDATE
  USING (agent_id::text = (auth.jwt()->'app_metadata'->>'agent_id'));

-- 3. Extend applications with applied_via flag
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS applied_via TEXT
  CHECK (applied_via IN ('saathi_plus_annual', 'scheme_pack'))
  DEFAULT 'saathi_plus_annual';

-- 4. Extend application_documents with MIME type and verification flag
ALTER TABLE public.application_documents
  ADD COLUMN IF NOT EXISTS file_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;