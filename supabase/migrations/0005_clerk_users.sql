-- Auth moves from Supabase Auth to Clerk. User ids become Clerk ids (text, e.g. "user_2ab…"),
-- so user columns drop their auth.users FKs and turn into text. The server (service role) remains
-- the only writer; account deletion cleanup is done by the app, not by FK cascades.

-- policy depends on created_by/auth.uid(); owner-hidden visibility is enforced by the server
drop policy if exists spots_read on public.spots;

alter table public.spots drop constraint if exists spots_created_by_fkey;
alter table public.spots alter column created_by type text using created_by::text;

alter table public.rate_events drop constraint if exists rate_events_user_id_fkey;
alter table public.rate_events alter column user_id type text using user_id::text;

alter table public.spot_reports drop constraint if exists spot_reports_reported_by_fkey;
alter table public.spot_reports alter column reported_by type text using reported_by::text;
alter table public.spot_reports alter column handled_by type text using handled_by::text;

alter table public.moderation_actions alter column handled_by type text using handled_by::text;

create policy spots_read on public.spots for select to anon, authenticated
  using (visibility = 'published');

-- Recreate user-keyed functions with text ids (same bodies as 0001).
drop function if exists public.create_spot(uuid, uuid, text, text, double precision, double precision, text[], smallint, text);
drop function if exists public.create_report(uuid, uuid, text, text);
drop function if exists public.rate_count(uuid, text);

create function public.rate_count(p_user text, p_kind text) returns int
language sql stable set search_path = '' as $$
  select count(*)::int from public.rate_events
  where user_id = p_user and kind = p_kind and created_at >= public.kst_day_start()
$$;

create function public.create_spot(
  p_user text, p_key uuid, p_name text, p_description text,
  p_lat double precision, p_lng double precision, p_types text[], p_difficulty smallint, p_photo_path text
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  existing uuid;
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_user || 'spot_create'));
  select id into existing from public.spots where created_by = p_user and submission_key = p_key;
  if existing is not null then
    return jsonb_build_object('id', existing, 'existing', true);
  end if;
  if public.rate_count(p_user, 'spot_create') >= 10 then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  insert into public.spots (created_by, submission_key, name, description, lat, lng, types, difficulty, photo_path, visibility)
  values (p_user, p_key, p_name, p_description, p_lat, p_lng, p_types, p_difficulty, p_photo_path, 'published')
  returning id into new_id;
  insert into public.rate_events (user_id, kind) values (p_user, 'spot_create');
  return jsonb_build_object('id', new_id, 'existing', false);
end $$;

create function public.create_report(
  p_user text, p_spot uuid, p_reason text, p_description text
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_user || 'report'));
  if exists (select 1 from public.spot_reports where reported_by = p_user and spot_id = p_spot
             and status in ('open', 'reviewing')) then
    return jsonb_build_object('duplicate', true);
  end if;
  if public.rate_count(p_user, 'report') >= 20 then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  insert into public.spot_reports (spot_id, reported_by, reason, description)
  values (p_spot, p_user, p_reason, nullif(btrim(p_description), ''))
  returning id into new_id;
  insert into public.rate_events (user_id, kind) values (p_user, 'report');
  return jsonb_build_object('id', new_id);
end $$;

revoke execute on function public.create_spot(text, uuid, text, text, double precision, double precision, text[], smallint, text),
  public.create_report(text, uuid, text, text), public.rate_count(text, text)
  from public, anon, authenticated;
