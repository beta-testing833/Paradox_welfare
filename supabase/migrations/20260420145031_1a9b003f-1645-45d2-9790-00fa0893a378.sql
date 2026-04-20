-- Agents table: our internal consultants who handle scheme applications
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  specialization text[] default '{}',
  languages text[] default '{English,Hindi}',
  is_active boolean default true,
  created_at timestamptz not null default now()
);

alter table public.agents enable row level security;

-- Any signed-in user can read the agent roster (needed for Change Agent modal etc)
create policy "Agents readable by all authenticated users"
  on public.agents
  for select
  to authenticated
  using (true);

-- Seed dummy agents so assignment logic always has candidates
insert into public.agents (full_name, phone, email, specialization) values
  ('Ravi Kumar',       '+91-90000-10001', 'ravi@welfareconnect.in',      array['Agriculture','Food Security']),
  ('Priya Sharma',     '+91-90000-10002', 'priya@welfareconnect.in',     array['Women Empowerment','Health']),
  ('Arjun Banerjee',   '+91-90000-10003', 'arjun@welfareconnect.in',     array['Education','Skill Development']),
  ('Meena Das',        '+91-90000-10004', 'meena@welfareconnect.in',     array['Disability','Health']),
  ('Suresh Iyer',      '+91-90000-10005', 'suresh@welfareconnect.in',    array['Agriculture','Food Security']),
  ('Kavita Ghosh',     '+91-90000-10006', 'kavita@welfareconnect.in',    array['Education','Women Empowerment']),
  ('Amit Chatterjee',  '+91-90000-10007', 'amit@welfareconnect.in',      array['Health','Food Security']),
  ('Shreya Menon',     '+91-90000-10008', 'shreya@welfareconnect.in',    array['Skill Development','Disability'])
on conflict do nothing;

-- Per-scheme agent continuity + when this scheme's support window ends
alter table public.applications
  add column if not exists assigned_agent_id uuid references public.agents(id),
  add column if not exists agent_assigned_at timestamptz,
  add column if not exists support_expires_at timestamptz;

-- Interactions table: every event that happens on an application (timeline source)
create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  agent_id uuid references public.agents(id),
  interaction_type text not null check (interaction_type in (
    'call_booked','call_completed','visit_booked','visit_completed',
    'documents_reviewed','status_update','note','agent_changed'
  )),
  scheduled_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by text not null default 'user' check (created_by in ('user','agent','system'))
);

alter table public.interactions enable row level security;

-- A user can read interactions only for their own applications
create policy "Users read own interactions"
  on public.interactions
  for select
  using (
    exists (
      select 1 from public.applications a
      where a.id = interactions.application_id
        and a.user_id = auth.uid()
    )
  );

-- A user can insert interactions only for their own applications
create policy "Users insert own interactions"
  on public.interactions
  for insert
  with check (
    exists (
      select 1 from public.applications a
      where a.id = interactions.application_id
        and a.user_id = auth.uid()
    )
  );

-- A user can update interactions only for their own applications (used when
-- the Change Agent modal silently re-routes future bookings to a new agent).
create policy "Users update own interactions"
  on public.interactions
  for update
  using (
    exists (
      select 1 from public.applications a
      where a.id = interactions.application_id
        and a.user_id = auth.uid()
    )
  );

-- Helpful index for timeline ordering and agent-availability lookups
create index if not exists idx_interactions_app on public.interactions(application_id);
create index if not exists idx_interactions_agent_sched on public.interactions(agent_id, scheduled_at);

-- View: which slots is each agent currently booked into?
-- Used by the Book Next Call modal to filter the time-slot dropdown.
create or replace view public.agent_bookings as
select
  agent_id,
  (scheduled_at at time zone 'UTC')::date as booking_date,
  to_char(scheduled_at at time zone 'UTC', 'HH24:MI') as slot_start
from public.interactions
where interaction_type in ('call_booked','visit_booked')
  and scheduled_at >= now() - interval '1 day'
  and completed_at is null;