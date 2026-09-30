// API end-to-end check against a running app, Supabase (data) and a Clerk *development* instance (auth).
// Usage: BASE=http://localhost:3000 node --env-file=.env.local scripts/e2e-api.mjs
import assert from "node:assert/strict";
import { createClerkClient } from "@clerk/backend";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BASE = process.env.BASE ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const created = [];

// "+clerk_test" addresses never send real mail in Clerk dev instances.
async function login(email) {
  const user = await clerk.users.createUser({ emailAddress: [email], skipLegalChecks: true });
  created.push(user.id);
  return session(user.id);
}
async function session(userId) {
  const s = await clerk.sessions.createSession({ userId }); // dev instances only
  const { jwt } = await clerk.sessions.getToken(s.id, undefined, 600);
  return { token: jwt, id: userId };
}

const call = async (path, { token, ...init } = {}) => {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  const res = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
  const body = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  return { status: res.status, body, res };
};

// JPEG with EXIF (orientation + GPS-ish metadata) to prove stripping
const photo = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#888" } })
  .jpeg()
  .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "SECRET-META" } } })
  .toBuffer();

const spotForm = (data, img = photo, type = "image/jpeg") => {
  const fd = new FormData();
  fd.set("data", JSON.stringify(data));
  if (img) fd.set("photo", new Blob([img], { type }), "p.jpg");
  return fd;
};

const stamp = Date.now();
const A = await login(`e2e-a-${stamp}+clerk_test@example.com`);
const B = await login(`e2e-b-${stamp}+clerk_test@example.com`);
const key = crypto.randomUUID();
const valid = {
  submission_key: key,
  name: "  E2E 레지  ",
  description: "매끈한 화강암 렛지, 저녁엔 경비가 있음",
  types: ["street_spot"],
  location: { lat: 37.5443, lng: 127.0374 },
};

// 401 without login
assert.equal((await call("/api/spots", { method: "POST", body: spotForm(valid) })).status, 401);

// 422 validation (A09): server rejects even if client is bypassed
let r = await call("/api/spots", { token: A.token, method: "POST", body: spotForm({ ...valid, submission_key: crypto.randomUUID(), types: ["kicker"], location: { lat: 0, lng: 0 } }) });
assert.equal(r.status, 422);
assert.ok(r.body.fields.types && r.body.fields.location);

// A07: fake extension / corrupt image rejected server-side
r = await call("/api/spots", { token: A.token, method: "POST", body: spotForm({ ...valid, submission_key: crypto.randomUUID() }, Buffer.from("not an image"), "image/jpeg") });
assert.equal(r.status, 422);
r = await call("/api/spots", { token: A.token, method: "POST", body: spotForm({ ...valid, submission_key: crypto.randomUUID() }, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "image/jpeg") });
assert.equal(r.status, 422, "svg must be rejected");

// create + idempotent retry (A11)
const [c1, c2] = await Promise.all([
  call("/api/spots", { token: A.token, method: "POST", body: spotForm(valid) }),
  call("/api/spots", { token: A.token, method: "POST", body: spotForm(valid) }),
]);
assert.equal(c1.status, 200, JSON.stringify(c1.body));
assert.equal(c2.status, 200);
assert.equal(c1.body.id, c2.body.id, "double submit → one spot");
const id = c1.body.id;
const again = await call("/api/spots", { token: A.token, method: "POST", body: spotForm(valid) });
assert.equal(again.body.id, id);

// detail: public, trimmed, no owner id/email leak
r = await call(`/api/spots/${id}`);
assert.equal(r.status, 200);
assert.equal(r.body.name, "E2E 레지");
assert.equal(r.body.isOwner, false);
assert.ok(!JSON.stringify(r.body).includes(A.id), "no internal user id");
assert.equal((await call(`/api/spots/${id}`, { token: A.token })).body.isOwner, true);

// photo: redirect to signed URL; stored file has no metadata, oriented, ≤2048 (A08)
r = await call(`/api/photos/${id}`);
assert.equal(r.status, 302);
const stored = Buffer.from(await (await fetch(r.res.headers.get("location"))).arrayBuffer());
const meta = await sharp(stored).metadata();
assert.equal(meta.format, "jpeg");
assert.ok(!meta.exif && !meta.orientation, "metadata stripped");
assert.ok(!stored.includes("SECRET-META"));
assert.equal(Math.max(meta.width, meta.height), 2048);
assert.ok(meta.height > meta.width, "EXIF orientation 6 applied (portrait)");
assert.ok(stored.length <= 2 * 1024 * 1024);

// map bbox (region search is Kakao-only; no spot-name search)
r = await call("/api/spots?bbox=126.9,37.4,127.2,37.7");
assert.equal(r.body.mode, "spots");
assert.ok(r.body.spots.some((s) => s.id === id));

// A13: other user cannot edit/delete
const editBody = { ...valid, name: "Hijack" };
assert.equal((await call(`/api/spots/${id}`, { token: B.token, method: "PATCH", body: spotForm(editBody, null) })).status, 404);
assert.equal((await call(`/api/spots/${id}`, { token: B.token, method: "DELETE" })).status, 404);
assert.equal((await call("/api/admin/reports", { token: B.token })).status, 403);

// author edit with photo replacement; old file cleaned (A14)
const { data: before } = await admin.from("spots").select("photo_path").eq("id", id).single();
r = await call(`/api/spots/${id}`, { token: A.token, method: "PATCH", body: spotForm({ ...valid, name: "E2E 레지 v2" }) });
assert.equal(r.status, 200);
const { data: after } = await admin.from("spots").select("photo_path, name").eq("id", id).single();
assert.equal(after.name, "E2E 레지 v2");
assert.notEqual(after.photo_path, before.photo_path);
const { data: oldFile } = await admin.storage.from("spot-photos").download(before.photo_path);
assert.equal(oldFile, null, "old photo removed");

// reports: create, duplicate, other needs text (A16)
assert.equal((await call("/api/reports", { token: B.token, method: "POST", body: JSON.stringify({ spot_id: id, reason: "other", description: "짧음" }) })).status, 422);
r = await call("/api/reports", { token: B.token, method: "POST", body: JSON.stringify({ spot_id: id, reason: "wrong_info", description: "이름이 틀렸어요" }) });
assert.deepEqual(r.body, { ok: true });
r = await call("/api/reports", { token: B.token, method: "POST", body: JSON.stringify({ spot_id: id, reason: "dangerous" }) });
assert.equal(r.body.duplicate, true);

// operator: hide via report → public gone, owner sees hidden (A15)
await clerk.users.updateUserMetadata(B.id, { publicMetadata: { role: "admin" } }); // backend-only field
const OP = B;
r = await call("/api/admin/reports", { token: OP.token });
const rep = r.body.reports.find((x) => x.spot_id === id);
assert.ok(rep);
r = await call(`/api/admin/reports/${rep.id}`, { token: OP.token, method: "POST", body: JSON.stringify({ status: "resolved", resolution: "hidden", note: "확인" }) });
assert.equal(r.status, 200);
assert.equal((await call(`/api/spots/${id}`)).status, 404);
assert.equal((await call(`/api/photos/${id}`)).status, 404);
assert.equal((await call(`/api/spots/${id}`, { token: A.token })).body.visibility, "hidden");
assert.equal((await call(`/api/spots/${id}`, { token: A.token, method: "PATCH", body: spotForm(valid, null) })).status, 404, "author can't edit hidden");
const { data: mine } = await call("/api/me/spots", { token: A.token }).then((x) => ({ data: x.body }));
assert.equal(mine.spots.find((s) => s.id === id).visibility, "hidden");

// account deletion: spots + files gone (A15)
const { data: last } = await admin.from("spots").select("photo_path").eq("id", id).single();
assert.equal((await call("/api/me", { token: A.token, method: "DELETE" })).status, 200);
const { count } = await admin.from("spots").select("*", { count: "exact", head: true }).eq("id", id);
assert.equal(count, 0);
const { data: gone } = await admin.storage.from("spot-photos").download(last.photo_path);
assert.equal(gone, null);
await assert.rejects(clerk.users.getUser(A.id), "Clerk user deleted on account deletion");

// reverse geocode: string with Kakao key, null without (never an error)
const geo = (await call("/api/geocode/reverse?lat=37.5&lng=127")).body;
assert.ok(geo.address === null || typeof geo.address === "string");
assert.deepEqual((await call("/api/geocode/reverse?lat=abc&lng=127")).body, { address: null });

// A deleted themselves via /api/me; remove B from Clerk (their open report stays anonymizable)
for (const id of created) await clerk.users.deleteUser(id).catch(() => {});
await admin.from("spot_reports").delete().eq("reported_by", B.id);
await admin.from("rate_events").delete().in("user_id", created);
await admin.from("moderation_actions").delete().eq("handled_by", B.id);

console.log("e2e api ok");
