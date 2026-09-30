-- Run after migrations; fixture is rolled back. Also runnable against the local migration fixture.
begin;
do $$ declare sid uuid; begin
  select id into sid from public.spots limit 1;
  assert sid is not null, 'test needs one spot';
  assert public.valid_spot_types(array['xgame_park']);
  assert not public.valid_spot_types(array['xgame_park','plaza']);
  insert into public.spot_favorites(user_id,spot_id) values ('favorite-test-a',sid),('favorite-test-b',sid);
  insert into public.spot_favorites(user_id,spot_id) values ('favorite-test-a',sid) on conflict do nothing;
  assert (select count(*) from public.spot_favorites where user_id='favorite-test-a')=1, 'idempotent favorite';
  delete from public.spot_favorites where user_id='favorite-test-b' and spot_id=sid;
  assert (select count(*) from public.spot_favorites where user_id='favorite-test-a')=1, 'other account preserved';
  assert not has_table_privilege('anon','public.spot_favorites','SELECT'), 'anonymous cannot read favorites';
  assert not has_table_privilege('authenticated','public.spot_favorites','SELECT'), 'direct client cannot read favorites';
  assert not has_table_privilege('authenticated','public.spot_favorites','INSERT'), 'direct client cannot write favorites';
  assert (select relrowsecurity from pg_class where oid='public.spot_favorites'::regclass), 'RLS enabled';
  delete from public.spots where id=sid;
  assert not exists(select 1 from public.spot_favorites where spot_id=sid), 'spot deletion cascades';
end $$;
rollback;
