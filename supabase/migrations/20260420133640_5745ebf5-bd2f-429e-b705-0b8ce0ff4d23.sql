-- ============================================================================
-- Two-tier paid plan migration
-- ============================================================================

-- 1. Extend subscriptions with new plan metadata + quota counters
alter table public.subscriptions
  add column if not exists plan_type text;

-- Add the constraint separately so it can be safely re-applied
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_plan_type_check'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_plan_type_check
      check (plan_type is null or plan_type in ('saathi_plus_annual'));
  end if;
end $$;

alter table public.subscriptions
  add column if not exists calls_total int default 15,
  add column if not exists calls_used int default 0,
  add column if not exists visits_total int default 3,
  add column if not exists visits_used int default 0,
  add column if not exists amount_paid numeric,
  add column if not exists concession_applied boolean default false;

-- Grandfather existing annual_1500 subscriptions as Saathi Plus so paid users
-- don't get re-paywalled after this rollout.
update public.subscriptions
set plan_type = 'saathi_plus_annual',
    calls_total = coalesce(calls_total, 15),
    visits_total = coalesce(visits_total, 3),
    calls_used = coalesce(calls_used, 0),
    visits_used = coalesce(visits_used, 0),
    amount_paid = coalesce(amount_paid, 1500)
where plan = 'annual_1500' and plan_type is null;

-- 2. Per-scheme Saathi Packs
create table if not exists public.scheme_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  scheme_id uuid not null references public.schemes(id) on delete cascade,
  purchased_at timestamptz not null default now(),
  expires_at timestamptz not null,
  amount_paid numeric,
  concession_applied boolean default false,
  calls_total int default 3,
  calls_used int default 0,
  visits_total int default 1,
  visits_used int default 0,
  is_active boolean default true,
  payment_reference text
);

alter table public.scheme_packs enable row level security;

drop policy if exists "Users read own packs" on public.scheme_packs;
create policy "Users read own packs" on public.scheme_packs
  for select using (auth.uid() = user_id);

drop policy if exists "Users create own packs" on public.scheme_packs;
create policy "Users create own packs" on public.scheme_packs
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users update own packs" on public.scheme_packs;
create policy "Users update own packs" on public.scheme_packs
  for update using (auth.uid() = user_id);

create index if not exists scheme_packs_user_scheme_idx
  on public.scheme_packs(user_id, scheme_id);

-- 3. Top-up purchases (always full price)
create table if not exists public.topup_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  purchased_at timestamptz not null default now(),
  topup_type text not null check (topup_type in ('extra_call','extra_visit')),
  units_added int default 1,
  amount_paid numeric,
  applies_to text check (applies_to in ('saathi_plus_annual','scheme_pack')),
  scheme_pack_id uuid references public.scheme_packs(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  payment_reference text
);

alter table public.topup_purchases enable row level security;

drop policy if exists "Users read own topups" on public.topup_purchases;
create policy "Users read own topups" on public.topup_purchases
  for select using (auth.uid() = user_id);

drop policy if exists "Users create own topups" on public.topup_purchases;
create policy "Users create own topups" on public.topup_purchases
  for insert with check (auth.uid() = user_id);

-- 4. Track whether the user requested an in-person agent visit on the application
alter table public.applications
  add column if not exists visit_requested boolean default false;

-- 5. Revenue analytics view
create or replace view public.revenue_summary as
select date_trunc('day', purchased_at) as day,
       'scheme_pack'::text as source,
       count(*) as units,
       sum(amount_paid) as gross_revenue
from public.scheme_packs
group by 1
union all
select date_trunc('day', started_at) as day,
       'saathi_plus_annual'::text as source,
       count(*) as units,
       sum(amount_paid) as gross_revenue
from public.subscriptions
where plan_type = 'saathi_plus_annual'
group by 1
union all
select date_trunc('day', purchased_at) as day,
       topup_type as source,
       count(*) as units,
       sum(amount_paid) as gross_revenue
from public.topup_purchases
group by 1, topup_type
order by day desc;