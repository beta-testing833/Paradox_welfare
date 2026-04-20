-- ============================================================================
-- 1. APPLICATIONS — add consultation booking fields, drop ngo_id NOT NULL
-- ============================================================================
alter table public.applications
  add column if not exists consultation_date date,
  add column if not exists consultation_time_slot text,
  add column if not exists consultation_status text default 'Pending'
    check (consultation_status in ('Pending','Confirmed','Completed','Cancelled'));

-- ngo_id was already nullable in the schema dump, but enforce explicitly so
-- the new NGO-less flow cannot regress.
alter table public.applications
  alter column ngo_id drop not null;

-- ============================================================================
-- 2. ELIGIBILITY_SUBMISSIONS — add 6 new profile fields
-- ============================================================================
alter table public.eligibility_submissions
  add column if not exists marital_status text,
  add column if not exists is_gov_employee boolean,
  add column if not exists gov_employee_id text,
  add column if not exists is_minority boolean,
  add column if not exists is_dbt_eligible boolean,
  add column if not exists preferred_benefit_type text
    check (preferred_benefit_type in ('Cash','Kind','Composite'));

-- ============================================================================
-- 3. SUBSCRIPTIONS — premium tier table + RLS
-- ============================================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  plan text not null default 'annual_1500',
  payment_method text,
  payment_reference text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Each policy is split per-command (clearer + matches existing project style)
drop policy if exists "Users read own subscription" on public.subscriptions;
create policy "Users read own subscription" on public.subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "Users create own subscription" on public.subscriptions;
create policy "Users create own subscription" on public.subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users update own subscription" on public.subscriptions;
create policy "Users update own subscription" on public.subscriptions
  for update using (auth.uid() = user_id);

-- updated_at trigger reuses the existing helper from earlier migrations
drop trigger if exists update_subscriptions_updated_at on public.subscriptions;
create trigger update_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.update_updated_at_column();

-- ============================================================================
-- 4. UPCOMING_CONSULTATIONS — read-only join view for the consultant team
-- ============================================================================
-- security_invoker = on so the view respects the caller's RLS on the underlying
-- tables (defense in depth — no one can read other users' bookings via the view).
create or replace view public.upcoming_consultations
with (security_invoker = on) as
select
  a.id              as application_id,
  a.user_id,
  p.full_name,
  p.phone,
  s.name            as scheme_name,
  a.aadhar,
  a.consultation_date,
  a.consultation_time_slot,
  a.consultation_status,
  a.applied_at
from public.applications a
join public.profiles p on p.id = a.user_id
join public.schemes   s on s.id = a.scheme_id
where a.consultation_date >= current_date
  and a.consultation_status in ('Pending','Confirmed')
order by a.consultation_date asc, a.consultation_time_slot asc;