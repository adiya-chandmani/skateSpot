-- Add "park" (official skatepark) to allowed spot types. Keep in sync with src/lib/spot-rules.ts.
create or replace function public.valid_spot_types(t text[]) returns boolean
language sql immutable as $$
  select cardinality(t) >= 1
    and t <@ array['park','stair','rail','ledge','gap','bank','manual_pad','flat_ground','bowl','transition','other']
    and cardinality(t) = (select count(distinct x) from unnest(t) x)
$$;
