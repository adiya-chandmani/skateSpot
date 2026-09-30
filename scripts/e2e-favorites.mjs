// Run against the app + Clerk development instance: node --env-file=.env.local scripts/e2e-favorites.mjs
import assert from 'node:assert/strict';
import {createClerkClient} from '@clerk/backend';
import {createClient} from '@supabase/supabase-js';
import sharp from 'sharp';
const base = process.env.BASE ?? 'http://localhost:3000';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const clerk = createClerkClient({secretKey: process.env.CLERK_SECRET_KEY});
const users = [];
const call = async (path, user, method = 'GET', body) => {
  const r = await fetch(base + path, {method, body, headers: user ? {authorization: `Bearer ${user.token}`} : {}});
  return {status:r.status, body:await r.json()};
};
async function login(label) {
  const user = await clerk.users.createUser({emailAddress:[`favorites-${label}-${Date.now()}+clerk_test@example.com`],skipLegalChecks:true});
  users.push(user.id);
  const session = await clerk.sessions.createSession({userId:user.id});
  return {id:user.id, token:(await clerk.sessions.getToken(session.id, undefined, 600)).jwt};
}
async function createSpot(user) {
  const form = new FormData();
  form.set('data',JSON.stringify({submission_key:crypto.randomUUID(),name:'E2E X-GAME PARK',description:'즐겨찾기 계정 격리 검증용 임시 스팟입니다.',types:['xgame_park'],location:{lat:37.51,lng:127.02}}));
  const jpg=await sharp({create:{width:64,height:64,channels:3,background:'#eee'}}).jpeg().toBuffer();
  form.set('photo',new Blob([jpg],{type:'image/jpeg'}),'test.jpg');
  const result=await call('/api/spots',user,'POST',form);
  assert.equal(result.status,200,JSON.stringify(result.body));
  return result.body.id;
}
try {
  assert.equal((await call('/api/me/favorites')).status,401);
  assert.equal((await call('/api/me/favorites/not-a-uuid',null,'PUT')).status,401);
  assert.equal((await call('/api/me/favorites/not-a-uuid',null,'DELETE')).status,401);
  const a=await login('a'),b=await login('b');
  const first=await createSpot(a),second=await createSpot(b);
  assert.equal((await call('/api/me/favorites/not-a-uuid',a,'PUT')).status,400);
  assert.equal((await call(`/api/me/favorites/${crypto.randomUUID()}`,a,'PUT')).status,404);
  for(let i=0;i<2;i++)assert.equal((await call(`/api/me/favorites/${first}`,a,'PUT')).status,200);
  let saved=await call('/api/me/favorites',a);assert.equal(saved.status,200);assert.equal(saved.body.spots.length,1);
  assert(!JSON.stringify(saved.body).includes(a.id),'no user id in payload');
  assert.deepEqual((await call('/api/me/favorites',b)).body.spots,[],'account isolation');
  assert.equal((await call(`/api/me/favorites/${first}`,b,'DELETE')).status,200);
  assert.equal((await call('/api/me/favorites',a)).body.spots.length,1,'other user cannot remove favorite');
  assert.equal((await call(`/api/me/favorites/${first}`,b,'PUT')).status,200);
  const map=await call('/api/spots');assert.equal(map.status,200);assert.equal(map.body.mode,'spots');
  assert.equal(map.body.total,map.body.spots.length);assert(map.body.spots.some(s=>s.id===first));
  await db.from('spots').update({visibility:'hidden'}).eq('id',first).throwOnError();
  assert.deepEqual((await call('/api/me/favorites',a)).body.spots,[],'hidden favorites are not disclosed');
  assert.equal((await call(`/api/me/favorites/${first}`,a,'PUT')).status,404);
  assert(!(await call('/api/spots')).body.spots.some(s=>s.id===first),'hidden excluded from all pins');
  assert.equal((await call(`/api/me/favorites/${first}`,a,'DELETE')).status,200,'can remove hidden favorite');
  await db.from('spots').update({visibility:'published'}).eq('id',first).throwOnError();
  for(const user of [a,b])assert.equal((await call(`/api/me/favorites/${second}`,user,'PUT')).status,200);
  assert.equal((await call('/api/me',a,'DELETE')).status,200,'delete account with favorites');
  const {data:left,error}=await db.from('spot_favorites').select('user_id,spot_id').in('user_id',users);
  if(error)throw error;
  assert.deepEqual(left,[{user_id:b.id,spot_id:second}],'own favorites cleared and deleted-spot favorites cascaded');
  assert.equal((await call(`/api/me/favorites/${second}`,b,'DELETE')).status,200);
  assert.equal((await call(`/api/me/favorites/${second}`,b,'DELETE')).status,200,'idempotent removal');
  console.log('favorites E2E ok: auth, account isolation, repeat saves, hidden/deleted spots, account cleanup, all-map API, X-GAME PARK registration');
} finally {
  if(users.length){
    const {data:spots}=await db.from('spots').select('photo_path').in('created_by',users);
    const paths=(spots??[]).map(s=>s.photo_path).filter(Boolean);
    if(paths.length)await db.storage.from('spot-photos').remove(paths);
    await db.from('spot_favorites').delete().in('user_id',users);
    await db.from('spots').delete().in('created_by',users);
    await db.from('rate_events').delete().in('user_id',users);
    for(const id of users)await clerk.users.deleteUser(id).catch(()=>{});
  }
}
