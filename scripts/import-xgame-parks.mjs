// --check: offline validation. Default: read-only dry run. --apply: insert missing parks.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { validateSpot, distanceM } from '../src/lib/spot-rules.ts';

const source = JSON.parse(await readFile(new URL('../data/xgame-parks.json', import.meta.url), 'utf8'));
const owner = 'import_korea_xgame_parks';
const rows = source.spots.map((s) => {
  assert(s.sources.length && s.sources.every((url) => /^https?:\/\//.test(url)), s.name);
  const hash = createHash('sha256').update(`${owner}|${s.key}`).digest('hex');
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const description = [`주소: ${s.address}`, s.evidence,
    '방문 전 운영 시간·출입 및 장비 이용 조건을 확인해 주세요. 현장 사진은 아직 없습니다.',
    `자료 조회일: ${source.retrieved_at.slice(0, 10)}`, ...s.sources].join('\n\n');
  const v = validateSpot({ name: s.name, description, types: ['xgame_park'], location: s });
  assert(v.ok, `${s.name}: ${JSON.stringify(v.errors)}`);
  return { id, created_by: owner, submission_key: id, name: v.value.name,
    description: v.value.description, types: v.value.types, lat: s.lat, lng: s.lng,
    visibility: 'published', photo_path: `${owner}/${id}.jpg` };
});
assert.equal(rows.length, 70);
assert.equal(new Set(rows.map((s) => s.id)).size, rows.length);
assert(rows.some((s) => s.name === '죽전 엑스파크공원'));
assert(rows.filter((s) => /한강/.test(s.name)).length >= 3);
for (let i = 0; i < rows.length; i++) for (const other of rows.slice(i + 1))
  assert(distanceM(rows[i], other) > 30, `Possible duplicate: ${rows[i].name}, ${other.name}`);
console.log(`Validated ${rows.length} parks; historical review candidates are not imported.`);
if (process.argv.includes('--check')) process.exit(0);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const existing = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await db.from('spots').select('id,name,lat,lng,types').order('id').range(offset, offset + 999);
  if (error) throw error;
  existing.push(...data);
  if (data.length < 1000) break;
}
const pending = rows.filter((s) => !existing.some((e) => e.id === s.id ||
  (e.name.normalize('NFC') === s.name.normalize('NFC') && distanceM(e, s) < 100) ||
  (e.types.includes('xgame_park') && distanceM(e, s) < 50)));
console.log(`${pending.length} new, ${rows.length - pending.length} already present.`);
if (!process.argv.includes('--apply') || !pending.length) process.exit(0);
// Fail before uploading if the required migration is missing.
const { data: allowed, error: ruleError } = await db.rpc('valid_spot_types', { t: ['xgame_park'] });
if (ruleError) throw ruleError;
assert(allowed, 'Apply 0008_favorites_and_xgame.sql first');
const photo = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#f2f2f7"/><text x="600" y="450" text-anchor="middle" font-family="sans-serif" font-size="46" fill="#636366">사진 없음 · NO PHOTO</text></svg>')).jpeg().toBuffer();
for (const row of pending) {
  const { error } = await db.storage.from('spot-photos').upload(row.photo_path, photo,
    { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
}
const { data, error } = await db.from('spots').upsert(pending, { onConflict: 'id', ignoreDuplicates: true }).select('id');
if (error) throw error;
assert.equal(data.length, pending.length);
console.log(`Imported ${data.length} parks.`);
