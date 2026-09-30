-- Run via: npm run test:db (asserts raise on failure)
\set ON_ERROR_STOP 1
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');

-- create: valid
select public.create_spot('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
  'Seoul Ledge', 'Nice granite ledge here', 37.5, 127.0, array['street_spot'],
  '00000000-0000-0000-0000-000000000001/a.jpg') ->> 'existing' as first_existing;
-- idempotent retry
select public.create_spot('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
  'Seoul Ledge', 'Nice granite ledge here', 37.5, 127.0, array['street_spot'],
  '00000000-0000-0000-0000-000000000001/a.jpg') ->> 'existing' as retry_existing;
select count(*) as spots_after_retry from spots;

-- DB rejects: outside Korea, dup types, bad name, other user's photo path
do $$ declare bad text[] := array[
  $q$select public.create_spot('00000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Zero', 'Null island spot', 0, 0, array['street_spot'], '00000000-0000-0000-0000-000000000001/b.jpg')$q$,
  $q$select public.create_spot('00000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Dup', 'duplicate types!!', 37, 127, array['plaza','street_spot'], '00000000-0000-0000-0000-000000000001/c.jpg')$q$,
  $q$select public.create_spot('00000000-0000-0000-0000-000000000001', gen_random_uuid(), ' x', 'short name test', 37, 127, array['street_spot'], '00000000-0000-0000-0000-000000000001/d.jpg')$q$,
  $q$select public.create_spot('00000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Steal', 'other user photo', 37, 127, array['street_spot'], '00000000-0000-0000-0000-000000000002/e.jpg')$q$
]; s text; begin
  foreach s in array bad loop
    begin execute s; raise exception 'SHOULD HAVE FAILED: %', s;
    exception when check_violation then raise notice 'rejected ok'; end;
  end loop;
end $$;

-- rate limit: 9 more succeed (10 total), 11th limited
do $$ declare r jsonb; begin
  for i in 1..9 loop
    r := public.create_spot('00000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Spot '||i, 'generated spot text', 37 + i*0.001, 127.0, array['street_spot'], '00000000-0000-0000-0000-000000000001/g'||i||'.jpg');
    assert r ? 'id', 'expected id at '||i;
  end loop;
  r := public.create_spot('00000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Eleventh', 'should be limited', 37, 127, array['street_spot'], '00000000-0000-0000-0000-000000000001/h.jpg');
  assert r->>'error' = 'rate_limited', 'expected rate limit, got '||r;
end $$;

-- bbox: spots mode vs grid mode
select spots_in_bbox(126, 36, 128, 38) ->> 'mode' as mode_small, (spots_in_bbox(126, 36, 128, 38) ->> 'total') as total;
insert into spots (created_by, submission_key, name, description, lat, lng, types, photo_path, visibility)
select '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 'Bulk '||g, 'bulk generated spot', 35 + random()*2, 127 + random()*2, array['street_spot'], '00000000-0000-0000-0000-000000000002/'||g||'.jpg', 'published'
from generate_series(1, 250) g;
select spots_in_bbox(124.5, 33, 132, 38.9) ->> 'mode' as mode_big,
  (select sum((c->>'count')::int) from jsonb_array_elements(spots_in_bbox(124.5, 33, 132, 38.9)->'cells') c) as grid_sum,
  spots_in_bbox(124.5, 33, 132, 38.9) ->> 'total' as total;
set search_path = public, extensions; set enable_seqscan = off; explain (costs off) select count(*) from spots s where s.location && extensions.st_makeenvelope(126,36,127,37,4326);

-- hidden excluded
update spots set visibility = 'hidden' where name = 'Spot 1';

-- RLS as anon: only published
set role anon;
select count(*) filter (where visibility <> 'published') as anon_sees_nonpublished from spots;
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
-- 0005: owner-hidden visibility is enforced by the server, not RLS
do $$ begin assert (select count(*) from spots where visibility = 'hidden') = 0, 'authenticated must not see hidden via RLS'; end $$;
-- users cannot write
do $$ begin
  begin update spots set visibility='published'; raise exception 'UPDATE ALLOWED'; exception when insufficient_privilege then raise notice 'update denied ok'; end;
  begin perform public.create_spot(null::text,null::uuid,null::text,null::text,null::float8,null::float8,null::text[],null::text); raise exception 'RPC ALLOWED'; exception when insufficient_privilege then raise notice 'rpc denied ok'; end;
end $$;
reset role;

-- reports: dup open blocked, other needs text, resolve needs handler, anonymize on account delete
select create_report('00000000-0000-0000-0000-000000000002', (select id from spots where name='Seoul Ledge'), 'wrong_info', '') ->> 'id' is not null as report_created;
select create_report('00000000-0000-0000-0000-000000000002', (select id from spots where name='Seoul Ledge'), 'dangerous', '') ->> 'duplicate' as report_dup;
do $$ begin
  begin insert into spot_reports (spot_id, reported_by, reason, description) values (null, '00000000-0000-0000-0000-000000000002', 'other', 'short'); raise exception 'OTHER SHORT ALLOWED';
  exception when check_violation then raise notice 'other short rejected ok'; end;
  begin update spot_reports set status='resolved'; raise exception 'RESOLVE W/O HANDLER';
  exception when check_violation then raise notice 'resolve w/o handler rejected ok'; end;
end $$;
insert into spot_reports (spot_id, reported_by, reason, description) values (null, '00000000-0000-0000-0000-000000000002', 'other', 'long enough text');
update spot_reports set description = null, reported_by = null where reported_by = '00000000-0000-0000-0000-000000000002';
-- account delete: users live in Clerk (no FK cascade); the app deletes rows like /api/me does
delete from spots where created_by = '00000000-0000-0000-0000-000000000002';
delete from rate_events where user_id = '00000000-0000-0000-0000-000000000002';
select count(*) as spots_of_deleted_user from spots where created_by = '00000000-0000-0000-0000-000000000002';
select count(*) as reports_kept from spot_reports;

-- orphan files
insert into storage.objects (bucket_id, name, created_at) values ('spot-photos', '00000000-0000-0000-0000-000000000001/a.jpg', now() - interval '2 hours'), ('spot-photos', 'orphan.jpg', now() - interval '2 hours'), ('spot-photos', 'fresh.jpg', now());
select array_agg(name) as orphans from orphan_photo_paths(now() - interval '1 hour');
select kst_day_start();

-- hard asserts for the values printed above
do $$ begin
  assert (select count(*) from spots where created_by = '00000000-0000-0000-0000-000000000002') = 0, 'app cleanup on account delete';
  assert (select count(*) from spot_reports where reported_by is not null) = 0, 'reports anonymized';
  assert (select array_agg(name) from orphan_photo_paths(now() - interval '1 hour')) = array['orphan.jpg'], 'orphan detection';
  assert (spots_in_bbox(126, 36, 128, 38) ->> 'mode') = 'spots' or (spots_in_bbox(126, 36, 128, 38) ->> 'total')::int > 200, 'mode switch';
end $$;

-- 0003: end-user roles can't write or truncate, and can't read reports/rate events
do $$ begin
  assert not has_table_privilege('anon', 'public.spots', 'INSERT'), 'anon insert';
  assert not has_table_privilege('authenticated', 'public.spots', 'UPDATE'), 'auth update';
  assert not has_table_privilege('authenticated', 'public.spots', 'TRUNCATE'), 'auth truncate';
  assert has_table_privilege('anon', 'public.spots', 'SELECT'), 'anon can read (RLS limits rows)';
  assert not has_table_privilege('authenticated', 'public.spot_reports', 'SELECT'), 'reports hidden';
  assert not has_function_privilege('anon', 'public.rate_count(text,text)', 'EXECUTE'), 'rate_count hidden';
  assert has_function_privilege('anon', 'public.spots_in_bbox(double precision,double precision,double precision,double precision)', 'EXECUTE'), 'map rpc public';
end $$;

-- 0004: pinned search_path still works end to end, merged policy keeps owner-hidden visibility
do $$ begin
  assert (select count(*) from pg_policies where tablename = 'spots') = 1, 'single spots policy';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname in ('create_spot','create_report','rate_count')
            and 'search_path=""' = any(p.proconfig)) = 3, 'search_path pinned';
end $$;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000003');
do $$ declare r jsonb; begin
  r := public.create_spot('00000000-0000-0000-0000-000000000003', gen_random_uuid(), 'After Pin', 'search path pinned ok',
    37.5, 127.0, array['plaza'], '00000000-0000-0000-0000-000000000003/p.jpg');
  assert r ? 'id', 'create_spot after pin: ' || r;
  assert public.rate_count('00000000-0000-0000-0000-000000000003', 'spot_create') = 1, 'rate_count after pin';
end $$;

-- 0005: user ids are Clerk-style text
do $$ declare r jsonb; begin
  r := public.create_spot('user_2abcClerkId', gen_random_uuid(), 'Clerk Spot', 'created by a clerk user id',
    37.5, 127.0, array['street_spot'], 'user_2abcClerkId/x.jpg');
  assert r ? 'id', 'create_spot with clerk id: ' || r;
  assert (select created_by from public.spots where id = (r->>'id')::uuid) = 'user_2abcClerkId', 'clerk id stored';
  begin
    perform public.create_spot('user_2abcClerkId', gen_random_uuid(), 'Steal', 'other users photo path',
      37.5, 127.0, array['street_spot'], 'user_other/x.jpg');
    raise exception 'FOREIGN PHOTO PATH ALLOWED';
  exception when check_violation then null; end;
  assert (public.create_report('user_2abcClerkId', (r->>'id')::uuid, 'wrong_info', '') ? 'id'), 'report with clerk id';
end $$;

-- 0006: difficulty and name search are gone; map payload has no difficulty
do $$ begin
  assert not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'spots' and column_name = 'difficulty'), 'difficulty column dropped';
  assert to_regprocedure('public.search_spots(text)') is null, 'search_spots dropped';
  assert not (public.spots_in_bbox(126, 36, 128, 38) -> 'spots' -> 0 ? 'difficulty'), 'bbox payload without difficulty';
end $$;

-- 0007: exactly one of the two categories, including direct SQL writes.
do $$ begin
  assert public.valid_spot_types(array['plaza']);
  assert public.valid_spot_types(array['street_spot']);
  assert not public.valid_spot_types(array['plaza', 'street_spot']);
  assert not public.valid_spot_types(array['ledge']);
  assert not public.valid_spot_types(array[]::text[]);
  assert not public.valid_spot_types(array[null]::text[]);
end $$;
