-- Plaza = area/zone; Street Spot = individual obstacle. Existing array API stays stable.
begin;
create or replace function public.valid_spot_types(t text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(t = array['plaza'] or t = array['street_spot'], false)
$$;

-- 23 PLAZA-layer places + 4 Plaza icons in the source's "사진 필요" layer.
-- Source obstacle tags remain in data/dailygrind-spots.json and original descriptions.
update public.spots
set types = case when id in (
  '61bfcced-eaa3-54ca-a0c8-12b047d3848e'::uuid,
  'bae05d7b-f4a2-5b67-a641-adcb1bfde6c6'::uuid,
  'e7c45c66-88cc-5c37-ad54-ad284a20c345'::uuid,
  '221dca41-d244-5bfc-a683-1fd018f8eed8'::uuid,
  '9384b877-cb0b-58b5-a725-cbb4e1c16447'::uuid,
  '41c4eb19-d576-5af5-a5b8-677a9759d144'::uuid,
  '9da5ff2c-1f09-5458-ad71-4860046ef857'::uuid,
  '0ab39bc3-4571-552e-a0a8-63dd5995f357'::uuid,
  '02bcaf51-9c7c-55dd-a66f-75d8967921d6'::uuid,
  '66c7eae6-208d-56b6-adc2-bd3b7d05e64c'::uuid,
  'e7762719-a76d-55cd-a4e0-ed4db9879501'::uuid,
  'cd5c9a18-b6fb-56d8-a2f9-b97e9c07d1bb'::uuid,
  'e7f8ea11-94ce-5c53-a329-0d77f7887499'::uuid,
  'b22945b3-66ee-5a30-ab4c-3dc714ba70b1'::uuid,
  '9a69d2eb-3b02-5854-aa3f-3f783ed92b75'::uuid,
  '7320c686-08be-5099-a8f8-2ad4744f9f2b'::uuid,
  '9ec04161-2f04-548e-a51e-66ef89b41684'::uuid,
  'cfe107e3-d45d-5cf7-a407-4f7924b4b77c'::uuid,
  '94e20967-c333-55cf-aa37-dd63406c36e5'::uuid,
  'cc8bd10b-490a-5940-ae9f-127a4dccaa3d'::uuid,
  '22d1cbb0-ae1c-53ce-adf0-0809c1b1f00e'::uuid,
  '11b84ac8-9fd2-5c3d-a9a0-ef1d94d2cb1e'::uuid,
  'b0363c4a-eab4-56c3-ac1b-c6ac7e8b0272'::uuid,
  '7f45e72d-ac12-5e38-ae56-4c73e3b32e2f'::uuid,
  '90c06db6-3c88-5179-a808-68a4c33b0537'::uuid,
  'a2fa840a-1e46-5de8-a588-51715de4a8ce'::uuid,
  'f6773e88-a00f-5eca-a765-e7b53dca22eb'::uuid
) or types @> array['park'] then array['plaza'] else array['street_spot'] end,
    description = case
      when created_by = 'import_dailygrind_1ZOHd2CTv61X5HGhsCpQDV7pLyt-gQEQ' then description
      else concat_ws(E'\n\n', description, '기존 장애물 유형: ' || array_to_string(types, ', '))
    end
where cardinality(types) > 0 and not public.valid_spot_types(types);
commit;
