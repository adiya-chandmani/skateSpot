// Dry run: node --experimental-strip-types --env-file=.env.local scripts/import-dailygrind.mjs
// Import: append --apply. Existing rows (including hidden ones) are never overwritten.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { validateSpot } from '../src/lib/spot-rules.ts';

const source = JSON.parse(await readFile(new URL('../data/dailygrind-spots.json', import.meta.url), 'utf8'));
const owner = 'import_dailygrind_1ZOHd2CTv61X5HGhsCpQDV7pLyt-gQEQ';
const identity = (s) => `${s.name.normalize('NFC').trim()}|${s.lat}|${s.lng}`;
const rows = source.spots.map((s) => {
  const hash = createHash('sha256').update(`${owner}|${identity(s)}`).digest('hex');
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const description = [s.description, `출처: ${source.title} / ${s.layer}`, source.url,
    '원본 지도에 기록된 정보이며 현재 상태와 이용 가능 여부는 현장에서 확인해 주세요.',
    ...(!s.photo_url ? ['원본 지도에 사진이 없습니다.'] : [])].filter(Boolean).join('\n\n');
  const v = validateSpot({ ...s, types: [s.category], description, location: { lat: s.lat, lng: s.lng } });
  assert(v.ok, `${s.name}: ${JSON.stringify(v.errors)}`);
  if (s.photo_url) {
    const url = new URL(s.photo_url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'mymaps.usercontent.google.com');
  }
  return { id, created_by: owner, submission_key: id, name: v.value.name, description: v.value.description,
    lat: s.lat, lng: s.lng, types: v.value.types, visibility: 'published', photo_path: `${owner}/${id}.jpg` };
});
assert.equal(rows.length, 218, 'Unexpected source count');
assert.equal(new Set(rows.map(identity)).size, rows.length, 'Duplicate source places');
assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, 'Duplicate import ids');
assert.deepEqual(rows.find((r) => r.name === 'CULT(훈련원공원)').types, ['plaza']);
assert(rows.find((r) => r.name === '상봉터미널 HANDRAIL').types.includes('street_spot'));
assert.equal(source.spots.filter((s) => !s.photo_url).length, 11);
console.log(`Validated ${rows.length} places, 207 source photos, 11 missing-photo placeholders.`);
if (process.argv.includes('--check')) process.exit(0);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const existing = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await db.from('spots').select('id,name,lat,lng').order('id').range(offset, offset + 999);
  if (error) throw error;
  existing.push(...data);
  if (data.length < 1000) break;
}
const ids = new Set(existing.map((r) => r.id));
const places = new Set(existing.map(identity));
const pending = rows.filter((r) => !ids.has(r.id) && !places.has(identity(r)));
console.log(`${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host}: ${pending.length} new, ${rows.length - pending.length} already present.`);
if (!process.argv.includes('--apply') || !pending.length) process.exit(0);

const placeholder = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#f2f2f7"/><text x="600" y="450" text-anchor="middle" font-family="sans-serif" font-size="46" fill="#636366">사진 없음 · NO PHOTO</text><text x="600" y="510" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#636366">DAILY GRIND 지도에 사진이 없는 장소입니다</text></svg>`)).jpeg().toBuffer();
for (let offset = 0; offset < pending.length; offset += 6) {
  const results = await Promise.allSettled(pending.slice(offset, offset + 6).map(async (row) => {
    const s = source.spots[rows.indexOf(row)];
    let photo = placeholder;
    if (s.photo_url) {
      const url = new URL(s.photo_url);
      url.searchParams.set('fife', 's1600');
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`${row.name}: photo HTTP ${response.status}`);
      const input = Buffer.from(await response.arrayBuffer());
      assert(input.length <= 10 * 1024 * 1024, `${row.name}: photo exceeds 10 MB`);
      photo = await sharp(input, { limitInputPixels: 40_000_000 }).rotate()
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).toBuffer();
    }
    assert(photo.length <= 2 * 1024 * 1024, `${row.name}: photo exceeds bucket limit`);
    const { error } = await db.storage.from('spot-photos').upload(row.photo_path, photo,
      { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
  }));
  for (const result of results) if (result.status === 'rejected') throw result.reason;
  console.log(`Photos ready: ${Math.min(offset + 6, pending.length)}/${pending.length}`);
}
// One atomic insert after every image is ready; a retry cannot overwrite user/moderator edits.
const { data, error } = await db.from('spots').upsert(pending,
  { onConflict: 'id', ignoreDuplicates: true }).select('id');
if (error) throw error;
assert.equal(data.length, pending.length, 'Import count changed; run dry run to verify');
console.log(`Imported ${data.length} published places.`);
