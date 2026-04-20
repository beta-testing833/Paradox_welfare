-- Recreate views with security_invoker so RLS applies based on the querying user
alter view public.revenue_summary set (security_invoker = true);
alter view public.upcoming_consultations set (security_invoker = true);