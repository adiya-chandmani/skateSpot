-- Defense in depth. End users never write directly: every write goes through server routes
-- using the service role (PRD §3, §11). Supabase's default privileges give anon/authenticated
-- full DML on new public tables, including TRUNCATE, which RLS does not govern.

revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from anon, authenticated;

alter default privileges in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from anon, authenticated;

-- No end-user reads either: reports (reporter identity), moderation log, rate counters.
revoke select on public.spot_reports, public.moderation_actions, public.rate_events
  from anon, authenticated;

-- Per-user counters are server-only.
revoke execute on function public.rate_count(uuid, text) from public, anon, authenticated;
