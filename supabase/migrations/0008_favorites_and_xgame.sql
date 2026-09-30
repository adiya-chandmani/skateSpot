begin;

create or replace function public.valid_spot_types(t text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(t = array['plaza'] or t = array['street_spot'] or t = array['xgame_park'], false)
$$;

create table public.spot_favorites (
  user_id text not null,
  spot_id uuid not null references public.spots(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, spot_id)
);
create index spot_favorites_spot_id_idx on public.spot_favorites (spot_id);
-- Private account data. Clerk ownership is checked in server routes, as for /api/me.
alter table public.spot_favorites enable row level security;
revoke all on public.spot_favorites from anon, authenticated;
grant select, insert, update, delete on public.spot_favorites to service_role;

commit;
