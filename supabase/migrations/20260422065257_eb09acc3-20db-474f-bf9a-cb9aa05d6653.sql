-- Scheme table extensions for scalability
ALTER TABLE public.schemes
  ADD COLUMN IF NOT EXISTS state_specific TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS launch_date DATE,
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS ministry TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Full-text search vector for faster priority search
ALTER TABLE public.schemes
  ADD COLUMN IF NOT EXISTS fts_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(name, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(ministry, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS schemes_fts_idx ON public.schemes USING GIN(fts_vector);
CREATE INDEX IF NOT EXISTS schemes_category_idx ON public.schemes(category);

-- 10 Additional Indian Welfare Schemes
INSERT INTO public.schemes (name, category, description, benefit_amount, eligibility_criteria, required_documents, official_portal_url, ministry, tags) VALUES
('PM Awas Yojana (Urban)', 'Housing', 'Financial assistance for construction or enhancement of houses for urban poor living in slums and informal settlements across India.', 'Up to ₹2,50,000 subsidy', '{"min_age":18,"max_age":80,"max_income":300000,"categories":["General","OBC","SC","ST"],"occupations":[],"disability_required":false}'::jsonb, ARRAY['Aadhar Card','Income Certificate','Address Proof','Bank Passbook','Land Documents'], 'https://pmaymis.gov.in', 'Ministry of Housing and Urban Affairs', ARRAY['housing','urban','shelter','slum']),
('PM Awas Yojana (Gramin)', 'Housing', 'Housing scheme for rural households to construct pucca houses with basic amenities. Direct benefit transfer of ₹1.2 lakh in plains and ₹1.3 lakh in hilly areas.', '₹1,20,000 – ₹1,30,000', '{"min_age":18,"max_age":80,"max_income":200000,"categories":["General","OBC","SC","ST"],"occupations":[],"disability_required":false}'::jsonb, ARRAY['Aadhar Card','SECC Data Proof','Bank Passbook','Land Records'], 'https://pmayg.nic.in', 'Ministry of Rural Development', ARRAY['housing','rural','gramin','shelter']),
('National Social Assistance Programme (NSAP)', 'Social Security', 'Pension support for old age persons, widows, and disabled persons from BPL households through monthly cash transfer.', '₹200 – ₹500 / month', '{"min_age":60,"max_age":120,"max_income":100000,"categories":["General","OBC","SC","ST"],"occupations":[],"disability_required":false}'::jsonb, ARRAY['Aadhar Card','BPL Certificate','Age Proof','Bank Passbook'], 'https://nsap.nic.in', 'Ministry of Rural Development', ARRAY['pension','elderly','widow','old age','social security']),
('Janani Suraksha Yojana', 'Women Empowerment', 'Safe motherhood intervention for reducing maternal and neo-natal mortality by promoting institutional delivery among poor pregnant women.', '₹1,400 (Urban) / ₹1,400 (Rural)', '{"min_age":14,"max_age":45,"max_income":150000,"categories":["General","OBC","SC","ST"],"occupations":[],"disability_required":false,"gender_required":"Female"}'::jsonb, ARRAY['Aadhar Card','Mother and Child Protection Card','BPL Certificate','Bank Passbook'], 'https://nhm.gov.in', 'Ministry of Health and Family Welfare', ARRAY['maternity','pregnancy','women','motherhood','health']),
('Pradhan Mantri Kaushal Vikas Yojana (PMKVY)', 'Skill Development', 'Flagship scheme for skill certification and reward to youth for training in industry-relevant skills. Includes recognition of prior learning.', 'Free training + certification', '{"min_age":15,"max_age":45,"max_income":500000,"categories":["General","OBC","SC","ST"],"occupations":["Unemployed","Student"],"disability_required":false}'::jsonb, ARRAY['Aadhar Card','Education Certificate','Address Proof','Photograph'], 'https://www.pmkvyofficial.org', 'Ministry of Skill Development and Entrepreneurship', ARRAY['skill','training','employment','youth','vocational']),
('Atal Pension Yojana', 'Social Security', 'Guaranteed pension scheme for unorganised sector workers providing monthly pension of ₹1,000 to ₹5,000 after age 60 based on contribution.', '₹1,000 – ₹5,000 / month after 60', '{"min_age":18,"max_age":40,"max_income":0,"categories":["General","OBC","SC","ST"],"occupations":[],"disability_required":false}'::jsonb, ARRAY['Aadhar Card','Bank Account','Mobile Number'], 'https://www.npscra.nsdl.co.in', 'Ministry of Finance', ARRAY['pension','retirement','unorganised sector','atal']),
('Sukanya Samriddhi Yojana', 'Education', 'Small savings scheme for the girl child providing high interest rate returns and tax benefits, promoting education and welfare of girl children.', '8.2% interest per annum', '{"min_age":0,"max_age":10,"max_income":0,"categories":["General","OBC","SC","ST"],"occupations":[],"disability_required":false,"gender_required":"Female"}'::jsonb, ARRAY['Birth Certificate','Aadhar Card','Guardian ID Proof','Address Proof'], 'https://www.india.gov.in/sukanya-samriddhi-yojana', 'Ministry of Finance', ARRAY['girl child','savings','education','sukanya']),
('Pradhan Mantri Mudra Yojana', 'Agriculture', 'Loans up to ₹10 lakh to non-corporate, non-farm small/micro enterprises. Three categories: Shishu (up to ₹50K), Kishore (₹50K–5L), Tarun (₹5L–10L).', 'Loans up to ₹10,00,000', '{"min_age":18,"max_age":65,"max_income":0,"categories":["General","OBC","SC","ST"],"occupations":[],"disability_required":false}'::jsonb, ARRAY['Aadhar Card','PAN Card','Business Plan','Address Proof','Bank Statement'], 'https://www.mudra.org.in', 'Ministry of Finance', ARRAY['loan','business','micro enterprise','mudra','self employment']),
('Deen Dayal Upadhyaya Gram Jyoti Yojana', 'Agriculture', 'Rural electrification scheme providing electricity connections to households in rural areas not having access to power.', 'Free electricity connection', '{"min_age":18,"max_age":80,"max_income":200000,"categories":["General","OBC","SC","ST"],"occupations":[],"disability_required":false}'::jsonb, ARRAY['Aadhar Card','Address Proof','BPL Certificate','Photograph'], 'https://www.ddugjy.gov.in', 'Ministry of Power', ARRAY['electricity','rural','power','village','ddugjy']),
('Stand Up India Scheme', 'Women Empowerment', 'Bank loans of ₹10 lakh to ₹1 crore to at least one SC/ST borrower and one woman borrower per bank branch for setting up a greenfield enterprise.', '₹10,00,000 – ₹1,00,00,000 loan', '{"min_age":18,"max_age":65,"max_income":0,"categories":["SC","ST"],"occupations":[],"disability_required":false}'::jsonb, ARRAY['Aadhar Card','PAN Card','Business Plan','Address Proof','Bank Statement','Caste Certificate'], 'https://www.standupmitra.in', 'Ministry of Finance', ARRAY['loan','business','women','SC','ST','enterprise','startup']);