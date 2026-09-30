-- Product change (2026-09-30):
-- * Difficulty removed: it is subjective per skater, so it is no longer collected or shown.
-- * Search is region-only (Kakao); spot-name search is gone, so search_spots() is dropped.

-- completeness check without difficulty
alter table public.spots drop constraint if exists spots_check1;
alter table public.spots add constraint spots_complete check (visibility = 'draft' or (
      name is not null and name = btrim(name) and char_length(name) between 2 and 80
  and description is not null and description = btrim(description) and char_length(description) between 10 and 1000
  and lat is not null and lng is not null and public.in_korea(lat, lng)
  and types is not null and public.valid_spot_types(types)
  and photo_path is not null
));

drop function if exists public.search_spots(text);

-- map query without difficulty
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
        'id', s.id, 'name', s.name, 'types', s.types, 'lat', s.lat, 'lng', s.lng
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

-- create without difficulty
drop function if exists public.create_spot(text, uuid, text, text, double precision, double precision, text[], smallint, text);
create function public.create_spot(
  p_user text, p_key uuid, p_name text, p_description text,
  p_lat double precision, p_lng double precision, p_types text[], p_photo_path text
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
  insert into public.spots (created_by, submission_key, name, description, lat, lng, types, photo_path, visibility)
  values (p_user, p_key, p_name, p_description, p_lat, p_lng, p_types, p_photo_path, 'published')
  returning id into new_id;
  insert into public.rate_events (user_id, kind) values (p_user, 'spot_create');
  return jsonb_build_object('id', new_id, 'existing', false);
end $$;
revoke execute on function public.create_spot(text, uuid, text, text, double precision, double precision, text[], text)
  from public, anon, authenticated;

alter table public.spots drop column if exists difficulty;
