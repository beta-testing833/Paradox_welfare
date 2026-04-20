-- Re-create with security_invoker=on so it respects the caller's RLS, not the
-- view owner's. This addresses the linter's "Security Definer View" warning.
drop view if exists public.agent_bookings;

create view public.agent_bookings
with (security_invoker = on)
as
select
  agent_id,
  (scheduled_at at time zone 'UTC')::date as booking_date,
  to_char(scheduled_at at time zone 'UTC', 'HH24:MI') as slot_start
from public.interactions
where interaction_type in ('call_booked','visit_booked')
  and scheduled_at >= now() - interval '1 day'
  and completed_at is null;