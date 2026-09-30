-- Supabase advisor fixes (security: mutable search_path; performance: RLS initplan,
-- multiple permissive policies, unindexed FKs, missing PK).

-- Pin search_path. Every function body already schema-qualifies its own objects.
alter function public.valid_spot_types(text[]) set search_path = '';
alter function public.in_korea(double precision, double precision) set search_path = '';
alter function public.touch_updated_at() set search_path = '';
alter function public.kst_day_start() set search_path = '';
alter function public.rate_count(uuid, text) set search_path = '';
alter function public.search_spots(text) set search_path = '';
alter function public.create_spot(uuid, uuid, text, text, double precision, double precision, text[], smallint, text) set search_path = '';
alter function public.create_report(uuid, uuid, text, text) set search_path = '';

-- One SELECT policy for spots: everyone sees published; authors also see their hidden rows.
drop policy if exists spots_public_read on public.spots;
drop policy if exists spots_owner_read on public.spots;
create policy spots_read on public.spots for select to anon, authenticated
  using (
    visibility = 'published'
    or (visibility = 'hidden' and created_by = (select auth.uid()))
  );

-- FK indexes (also speed up ON DELETE SET NULL when spots are removed)
create index if not exists spot_reports_spot_id_idx on public.spot_reports (spot_id);
create index if not exists moderation_actions_spot_id_idx on public.moderation_actions (spot_id);
create index if not exists moderation_actions_report_id_idx on public.moderation_actions (report_id);

alter table public.rate_events add column if not exists id bigint generated always as identity primary key;

-- spot_reports, moderation_actions, rate_events intentionally have RLS on and no policies:
-- only the server (service role) touches them.
