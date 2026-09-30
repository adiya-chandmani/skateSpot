// --check: offline manifest checks. Default: read-only plan. --apply: sync import rows to the manifest photos
// (spots without `photo` go back to the placeholder).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { validateSpot } from '../src/lib/spot-rules.ts';

const owner = 'import_korea_xgame_parks';
const source = JSON.parse(await readFile(new URL('../data/xgame-parks.json', import.meta.url), 'utf8'));
const selected = source.spots.filter((s) => s.photo);
assert(selected.length, 'No reviewed photos');
assert.equal(new Set(selected.map((s) => s.key)).size, selected.length);
for (const s of selected) {
  assert(s.photo.credit && s.photo.source && s.photo.url, `${s.name}: missing photo provenance`);
  for (const url of [s.photo.source, s.photo.url]) assert(['http:', 'https:'].includes(new URL(url).protocol));
  assert(!/staticmap|logo_profile/.test(s.photo.url), `${s.name}: not a facility photo`);
}
console.log(`Validated ${selected.length} reviewed photo sources.`);
if (process.argv.includes('--check')) process.exit(0);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const { data: rows, error } = await db.from('spots').select('id,name,description,photo_path,lat,lng,types,visibility')
  .eq('created_by', owner);
if (error) throw error;
const NO_PHOTO = ' 현장 사진은 아직 없습니다.';
const pending = [];
for (const s of source.spots) {
  const hash = createHash('sha256').update(`${owner}|${s.key}`).digest('hex');
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const row = rows.find((r) => r.id === id);
  // Only rows whose photo still comes from this import; preserve user/moderator changes.
  if (!row || row.visibility !== 'published' || !row.photo_path.startsWith(`${owner}/${id}`)) continue;
  const base = row.description.split('\n\n사진 출처: ')[0].replace(NO_PHOTO, '');
  const description = s.photo
    ? `${base}\n\n사진 출처: ${s.photo.credit}\n${s.photo.source}\n${s.photo.note ?? '출처에 게시된 사진이며 현재 모습과 다를 수 있습니다.'}`
    : base.replace('확인해 주세요.', `확인해 주세요.${NO_PHOTO}`);
  if (description === row.description) continue;
  const v = validateSpot({ ...row, description, location: row });
  assert(v.ok, `${row.name}: ${JSON.stringify(v.errors)}`);
  pending.push({ row, photo: s.photo, description });
}
console.log(`${pending.length} rows to update (${pending.filter((p) => !p.photo).length} back to placeholder).`);
if (!process.argv.includes('--apply') || !pending.length) process.exit(0);
const backup = join(tmpdir(), `skatespot-before-park-photos-${Date.now()}.json`);
await writeFile(backup, JSON.stringify(pending.map(({ row }) => row), null, 2));
console.log(`Backup: ${backup}`);
async function uploadPhoto(row, photo) {
  const response = await fetch(photo.url, { signal: AbortSignal.timeout(30000) });
  assert(response.ok, `${row.name}: photo HTTP ${response.status}`);
  assert(Number(response.headers.get('content-length') ?? 0) <= 10 * 1024 * 1024, 'Photo too large');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    assert(size <= 10 * 1024 * 1024, `${row.name}: photo exceeds 10 MB`);
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks);
  const meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  assert(['jpeg', 'png', 'webp'].includes(meta.format) && (meta.pages ?? 1) === 1, `${row.name}: unsupported image`);
  assert(meta.width >= 300 && meta.height >= 180, `${row.name}: image too small`);
  const jpg = await sharp(input, { limitInputPixels: 40_000_000 }).rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' })
    .jpeg({ quality: 82 }).toBuffer();
  assert(jpg.length <= 2 * 1024 * 1024);
  const digest = createHash('sha256').update(jpg).digest('hex').slice(0, 16);
  const path = `${owner}/${row.id}-${digest}.jpg`;
  const { error: uploadError } = await db.storage.from('spot-photos').upload(path, jpg, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) throw uploadError;
  return path;
}
for (const { row, photo, description } of pending) {
  const placeholder = `${owner}/${row.id}.jpg`;
  const path = photo ? await uploadPhoto(row, photo) : placeholder;
  const { data, error: updateError } = await db.from('spots').update({ photo_path: path, description })
    .eq('id', row.id).eq('created_by', owner).eq('visibility', 'published')
    .eq('photo_path', row.photo_path).eq('description', row.description).select('id');
  if (updateError) throw updateError;
  assert.equal(data.length, 1, `${row.name}: changed during import; existing row preserved`);
  // Old import-owned upload is now unreferenced; the placeholder stays for future reverts.
  if (row.photo_path !== placeholder && row.photo_path !== path) await db.storage.from('spot-photos').remove([row.photo_path]);
  console.log(`Updated: ${row.name}`);
}
console.log(`Updated ${pending.length} park rows.`);
