-- =====================================================================
-- WelfareConnect — Initial Schema, RLS, Storage, Seed Data
-- =====================================================================

-- ---------- Helper: updated_at trigger ----------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ---------- profiles ----------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  dob DATE,
  aadhar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- schemes ----------
CREATE TABLE public.schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  benefit_amount TEXT,
  eligibility_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  required_documents TEXT[] NOT NULL DEFAULT '{}',
  is_verified BOOLEAN NOT NULL DEFAULT true,
  official_portal_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.schemes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Schemes are public"  ON public.schemes FOR SELECT USING (true);

-- ---------- ngos ----------
CREATE TABLE public.ngos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  focus_area TEXT,
  rating NUMERIC(2,1) DEFAULT 4.5,
  km_from_user NUMERIC(4,1) DEFAULT 5.0,
  testimonial TEXT,
  testimonial_author TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ngos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "NGOs are public" ON public.ngos FOR SELECT USING (true);

-- ---------- scheme_ngo_map ----------
CREATE TABLE public.scheme_ngo_map (
  scheme_id UUID NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  ngo_id    UUID NOT NULL REFERENCES public.ngos(id)   ON DELETE CASCADE,
  PRIMARY KEY (scheme_id, ngo_id)
);
ALTER TABLE public.scheme_ngo_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mappings are public" ON public.scheme_ngo_map FOR SELECT USING (true);

-- ---------- applications ----------
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheme_id UUID REFERENCES public.schemes(id) ON DELETE SET NULL,
  ngo_id    UUID REFERENCES public.ngos(id)    ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Submitted'
    CHECK (status IN ('Draft','Submitted','Under Review','Approved','Rejected')),
  aadhar TEXT,
  message TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own apps"   ON public.applications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own apps" ON public.applications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own apps" ON public.applications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own apps" ON public.applications FOR DELETE USING (auth.uid() = user_id);

-- ---------- application_documents ----------
CREATE TABLE public.application_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes INT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.application_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own docs" ON public.application_documents FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND a.user_id = auth.uid()));
CREATE POLICY "Users insert own docs" ON public.application_documents FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND a.user_id = auth.uid()));
CREATE POLICY "Users delete own docs" ON public.application_documents FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND a.user_id = auth.uid()));

-- ---------- notifications ----------
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body  TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own notifs"   ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own notifs" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own notifs" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own notifs" ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- ---------- Storage bucket: application-docs (private) ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('application-docs', 'application-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users view own files" ON storage.objects FOR SELECT
  USING (bucket_id = 'application-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own files" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'application-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own files" ON storage.objects FOR DELETE
  USING (bucket_id = 'application-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =====================================================================
-- SEED DATA — Schemes, NGOs, mappings
-- =====================================================================

-- 7 Indian welfare schemes
WITH s AS (
  INSERT INTO public.schemes (name, category, description, benefit_amount, eligibility_criteria, required_documents, official_portal_url)
  VALUES
  ('Swasthya Raksha Yojana', 'Health',
    'Comprehensive health insurance coverage for low-income families across India, covering hospitalisation, surgeries, and critical care up to ₹5 lakh per family per year.',
    'Up to ₹5,00,000 / year',
    '{"min_age":18,"max_age":75,"max_income":250000,"categories":["General","OBC","SC","ST"],"occupations":[],"disability_required":false}'::jsonb,
    ARRAY['Aadhar Card','Income Certificate','Family Photo','Bank Passbook','Address Proof'],
    'https://pmjay.gov.in'),

  ('Vidyarthi Vikas Scholarship', 'Education',
    'Merit-cum-means scholarship for school and college students from economically weaker sections to support tuition, books, and educational materials.',
    '₹12,000 – ₹50,000 / year',
    '{"min_age":10,"max_age":30,"max_income":300000,"categories":["General","OBC","SC","ST"],"occupations":["Student"],"disability_required":false}'::jsonb,
    ARRAY['Aadhar Card','Income Certificate','School/College ID','Mark Sheet','Bank Account Details'],
    'https://scholarships.gov.in'),

  ('Kisan Sahay', 'Agriculture',
    'Direct income support of ₹6,000 per year to small and marginal farmer families, paid in three equal instalments through Direct Benefit Transfer.',
    '₹6,000 / year',
    '{"min_age":18,"max_age":80,"max_income":200000,"categories":["General","OBC","SC","ST"],"occupations":["Farmer"],"disability_required":false}'::jsonb,
    ARRAY['Aadhar Card','Land Records','Bank Passbook','Income Certificate'],
    'https://pmkisan.gov.in'),

  ('Bengal Women Empowerment', 'Women Empowerment',
    'Monthly financial assistance and skill-development support for women heads of household, designed to promote economic independence.',
    '₹1,000 / month',
    '{"min_age":25,"max_age":60,"max_income":120000,"categories":["General","OBC","SC","ST"],"occupations":[],"disability_required":false,"gender_required":"Female"}'::jsonb,
    ARRAY['Aadhar Card','Bank Passbook','Address Proof','Income Certificate'],
    'https://wbsocialwelfare.gov.in'),

  ('Aparajita Disability Support', 'Disability',
    'Monthly pension and assistive-device subsidy for persons with 40%+ disability. Includes free travel pass on state transport.',
    '₹2,500 / month + assistive aids',
    '{"min_age":18,"max_age":99,"max_income":300000,"categories":["General","OBC","SC","ST"],"occupations":[],"disability_required":true}'::jsonb,
    ARRAY['Aadhar Card','Disability Certificate','Income Certificate','Bank Passbook','Photograph'],
    'https://disabilityaffairs.gov.in'),

  ('Skill India Yuva', 'Education',
    'Free vocational training in 200+ trades for unemployed youth aged 18–35, with placement assistance and stipend during training.',
    'Free training + ₹1,500 stipend',
    '{"min_age":18,"max_age":35,"max_income":400000,"categories":["General","OBC","SC","ST"],"occupations":["Unemployed","Student"],"disability_required":false}'::jsonb,
    ARRAY['Aadhar Card','Education Certificate','Address Proof','Photograph'],
    'https://skillindia.gov.in'),

  ('Annapurna Food Security', 'Health',
    'Subsidised foodgrains (rice, wheat, pulses) at ₹1–₹3 per kg for BPL families through fair-price shops, ensuring nutritional security.',
    'Subsidised grains 35 kg / month',
    '{"min_age":0,"max_age":120,"max_income":150000,"categories":["General","OBC","SC","ST"],"occupations":[],"disability_required":false}'::jsonb,
    ARRAY['Aadhar Card','Ration Card','Income Certificate','Address Proof'],
    'https://nfsa.gov.in')
  RETURNING id, name
)
SELECT * FROM s;

-- 5 Kolkata NGOs
INSERT INTO public.ngos (name, location, focus_area, rating, km_from_user, testimonial, testimonial_author)
VALUES
  ('Kolkata Care Foundation', 'Salt Lake, Kolkata', 'Health & Family Welfare', 4.8, 3.2,
    'They guided me through every step of my mother''s health insurance application. Got approval in 3 weeks!',
    'Priya Sen, Beneficiary'),
  ('Bengal Women Empowerment Trust', 'Park Street, Kolkata', 'Women & Child Development', 4.7, 5.1,
    'The team helped me start my tailoring business with the women''s scheme grant. Forever grateful.',
    'Sunita Devi, Entrepreneur'),
  ('Kisan Sahay Kolkata', 'Behala, Kolkata', 'Agriculture & Rural Livelihood', 4.6, 8.4,
    'They explained every document I needed for Kisan Sahay and helped me open my first bank account.',
    'Ramesh Mondal, Farmer'),
  ('Aparajita Disability Network', 'Howrah', 'Disability Inclusion', 4.9, 6.7,
    'Got my wheelchair and disability pension approved within a month. Truly life-changing support.',
    'Anwar Hussain, Beneficiary'),
  ('Vidya Jyoti Education Trust', 'Jadavpur, Kolkata', 'Education & Scholarships', 4.7, 4.3,
    'My daughter received the Vidyarthi Vikas scholarship — covered her entire first-year college fees.',
    'Meera Banerjee, Parent');

-- Map schemes to NGOs (each scheme: 1–3 NGOs; each NGO: 1–2 schemes)
INSERT INTO public.scheme_ngo_map (scheme_id, ngo_id)
SELECT s.id, n.id FROM public.schemes s, public.ngos n
WHERE
  (s.name = 'Swasthya Raksha Yojana'        AND n.name IN ('Kolkata Care Foundation','Aparajita Disability Network'))
  OR (s.name = 'Vidyarthi Vikas Scholarship' AND n.name IN ('Vidya Jyoti Education Trust','Bengal Women Empowerment Trust'))
  OR (s.name = 'Kisan Sahay'                 AND n.name IN ('Kisan Sahay Kolkata'))
  OR (s.name = 'Bengal Women Empowerment'    AND n.name IN ('Bengal Women Empowerment Trust','Kolkata Care Foundation'))
  OR (s.name = 'Aparajita Disability Support' AND n.name IN ('Aparajita Disability Network','Kolkata Care Foundation'))
  OR (s.name = 'Skill India Yuva'            AND n.name IN ('Vidya Jyoti Education Trust','Bengal Women Empowerment Trust'))
  OR (s.name = 'Annapurna Food Security'     AND n.name IN ('Kolkata Care Foundation','Kisan Sahay Kolkata'));