-- SKATESPOT MVP schema (PRD §11).
-- All writes go through server routes using the service role; end users only get read policies.

create extension if not exists postgis with schema extensions;

-- Shared rules (keep in sync with src/lib/spot-rules.ts)
create or replace function public.valid_spot_types(t text[]) returns boolean
language sql immutable as $$
  select cardinality(t) >= 1
    and t <@ array['stair','rail','ledge','gap','bank','manual_pad','flat_ground','bowl','transition','other']
    and cardinality(t) = (select count(distinct x) from unnest(t) x)
$$;

-- MVP registration area: South Korea bbox (PRD §6.2 초기 기준)
create or replace function public.in_korea(lat double precision, lng double precision) returns boolean
language sql immutable as $$
  select lat between 33.0 and 38.9 and lng between 124.5 and 132.0
$$;

create table public.spots (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  submission_key uuid not null,
  name text,
  description text,
  lat double precision,
  lng double precision,
  -- derived for spatial index; lat/lng are the source of truth
  location extensions.geometry(Point, 4326)
    generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)) stored,
  types text[],
  difficulty smallint,
  visibility text not null default 'draft'
    check (visibility in ('draft', 'published', 'hidden', 'deleting')),
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, submission_key),
  -- photo must live under the author's own folder
  check (photo_path is null or photo_path like created_by::text || '/%'),
  -- everything except draft must be complete and valid
  check (visibility = 'draft' or (
        name is not null and name = btrim(name) and char_length(name) between 2 and 80
    and description is not null and description = btrim(description) and char_length(description) between 10 and 1000
    and lat is not null and lng is not null and public.in_korea(lat, lng)
    and types is not null and public.valid_spot_types(types)
    and difficulty between 1 and 5
    and photo_path is not null
  ))
);

create index spots_location_idx on public.spots using gist (location);
create index spots_created_by_idx on public.spots (created_by);
create index spots_visibility_idx on public.spots (visibility);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger spots_touch before update on public.spots
for each row execute function public.touch_updated_at();

create table public.spot_reports (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid references public.spots(id) on delete set null,
  reported_by uuid references auth.users(id) on delete set null,
  reason text not null check (reason in (
    'not_found', 'skatestopper', 'no_skating', 'wrong_location', 'duplicate',
    'wrong_info', 'dangerous', 'private_info', 'photo_rights', 'other')),
  description text check (description is null or char_length(description) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution text check (resolution is null or resolution in ('no_action', 'corrected', 'hidden', 'deleted')),
  handled_by uuid,
  handled_at timestamptz,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- anonymized rows (account deleted) may lose their text
  check (reason <> 'other' or reported_by is null or char_length(btrim(coalesce(description, ''))) >= 10),
  check (status not in ('resolved', 'dismissed') or (handled_by is not null and handled_at is not null))
);

-- one open report per user+spot
create unique index spot_reports_open_uniq on public.spot_reports (reported_by, spot_id)
  where status in ('open', 'reviewing');

create trigger spot_reports_touch before update on public.spot_reports
for each row execute function public.touch_updated_at();

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid references public.spots(id) on delete set null,
  report_id uuid references public.spot_reports(id) on delete set null,
  action text not null check (action in ('hide', 'restore', 'delete', 'edit')),
  note text check (note is null or char_length(note) <= 1000),
  handled_by uuid not null,
  created_at timestamptz not null default now()
);

-- counts for daily limits; survives spot deletion so delete+recreate can't bypass
create table public.rate_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('spot_create', 'report')),
  created_at timestamptz not null default now()
);
create index rate_events_idx on public.rate_events (user_id, kind, created_at);

-- RLS: public reads published only; authors read their own rows (account list). No user writes.
alter table public.spots enable row level security;
alter table public.spot_reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.rate_events enable row level security;

create policy spots_public_read on public.spots for select
  using (visibility = 'published');
create policy spots_owner_read on public.spots for select to authenticated
  using (created_by = auth.uid() and visibility in ('published', 'hidden'));

-- KST day start (PRD §8)
create or replace function public.kst_day_start() returns timestamptz
language sql stable as $$
  select date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
$$;

create or replace function public.rate_count(p_user uuid, p_kind text) returns int
language sql stable as $$
  select count(*)::int from public.rate_events
  where user_id = p_user and kind = p_kind and created_at >= public.kst_day_start()
$$;

-- Map query: <=200 spots, otherwise grid aggregation over ALL published spots in bbox (PRD §4).
create or replace function public.spots_in_bbox(
  min_lng double precision, min_lat double precision,
  max_lng double precision, max_lat double precision
) returns jsonb
language plpgsql stable security invoker set search_path = public, extensions as $$
declare
  env extensions.geometry := extensions.st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326);
  total int;
  cell double precision;
begin
  select count(*) into total from public.spots s
  where s.visibility = 'published' and s.location && env;

  if total <= 200 then
    return jsonb_build_object('mode', 'spots', 'total', total, 'spots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'types', s.types, 'difficulty', s.difficulty,
        'lat', s.lat, 'lng', s.lng
      ) order by s.created_at desc, s.id)
      from public.spots s
      where s.visibility = 'published' and s.location && env
    ), '[]'::jsonb));
  end if;

  cell := greatest(max_lng - min_lng, max_lat - min_lat) / 10;
  return jsonb_build_object('mode', 'grid', 'total', total, 'cells', (
    select jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng, 'count', n))
    from (
      select avg(s.lat) lat, avg(s.lng) lng, count(*) n
      from public.spots s
      where s.visibility = 'published' and s.location && env
      group by floor(s.lng / cell), floor(s.lat / cell)
    ) c
  ));
end $$;

-- Name search: literal substring, case-insensitive, max 20 (+1 to detect overflow)
create or replace function public.search_spots(q text) returns table (
  id uuid, name text, types text[], difficulty smallint, lat double precision, lng double precision
)
language sql stable security invoker as $$
  select s.id, s.name, s.types, s.difficulty, s.lat, s.lng
  from public.spots s
  where s.visibility = 'published'
    and s.name ilike '%' || replace(replace(replace(btrim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by s.name, s.id
  limit 21
$$;

-- Atomic create: idempotent on (user, submission_key), enforces daily limit (PRD §6.4, §8)
create or replace function public.create_spot(
  p_user uuid, p_key uuid, p_name text, p_description text,
  p_lat double precision, p_lng double precision, p_types text[], p_difficulty smallint, p_photo_path text
) returns jsonb
language plpgsql as $$
declare
  existing uuid;
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text || 'spot_create'));
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

create or replace function public.create_report(
  p_user uuid, p_spot uuid, p_reason text, p_description text
) returns jsonb
language plpgsql as $$
declare
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text || 'report'));
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

-- Storage files not referenced by any spot (cron cleanup)
create or replace function public.orphan_photo_paths(older_than timestamptz) returns table (name text)
language sql stable security definer set search_path = public, storage as $$
  select o.name from storage.objects o
  where o.bucket_id = 'spot-photos' and o.created_at < older_than
    and not exists (select 1 from public.spots s where s.photo_path = o.name)
  limit 1000
$$;

-- Write/maintenance functions are server-only.
revoke execute on function public.create_spot, public.create_report, public.orphan_photo_paths
  from public, anon, authenticated;

-- Private photo bucket; no user policies, served via short signed URLs (PRD §9).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spot-photos', 'spot-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;
