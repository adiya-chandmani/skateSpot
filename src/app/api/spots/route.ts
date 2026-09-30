import { db, fail, getUser, PhotoError, removePhotos, sanitizePhoto, unauthorized, uploadPhoto } from "@/lib/server";
import { validateSpot } from "@/lib/spot-rules";
import type { SpotPin } from "@/components/SpotMeta";

// GET /api/spots?bbox=minLng,minLat,maxLng,maxLat
export async function GET(req: Request) {
  if (!new URL(req.url).searchParams.has("bbox")) {
    // Load every published pin; page through Supabase's 1,000-row response limit.
    const spots: SpotPin[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from("spots").select("id,name,types,lat,lng,created_at")
        .eq("visibility", "published").order("id").range(offset, offset + 999);
      if (error) return fail(500, "스팟을 불러오지 못했습니다.");
      spots.push(...data);
      if (data.length < 1000) break;
    }
    return Response.json({ mode: "spots", total: spots.length, spots });
  }
  const bbox = new URL(req.url).searchParams.get("bbox")?.split(",").map(Number);
  if (!bbox || bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n))) return fail(400, "잘못된 영역입니다.");
  const [min_lng, min_lat, max_lng, max_lat] = bbox;
  const { data, error } = await db.rpc("spots_in_bbox", { min_lng, min_lat, max_lng, max_lat });
  if (error) return fail(500, "스팟을 불러오지 못했습니다.");
  return Response.json(data);
}

// POST /api/spots (multipart: photo, data=JSON{submission_key, name, description, types, location})
export async function POST(req: Request) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const form = await req.formData().catch(() => null);
  const photo = form?.get("photo");
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(String(form?.get("data")));
  } catch {
    return fail(400, "잘못된 요청입니다.");
  }
  const key = String(body.submission_key ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(key)) return fail(400, "제출 키가 없습니다.");

  // Idempotent retry: same key returns the same spot without re-uploading (PRD §6.4, A11)
  const { data: existing } = await db
    .from("spots")
    .select("id")
    .eq("created_by", user.id)
    .eq("submission_key", key)
    .maybeSingle();
  if (existing) return Response.json({ id: existing.id });

  const v = validateSpot(body);
  if (!v.ok) return fail(422, "입력값을 확인해 주세요.", { fields: v.errors });
  if (!(photo instanceof File)) return fail(422, "사진을 선택해 주세요.", { fields: { photo: "사진이 필요합니다." } });

  let jpeg: Buffer;
  try {
    jpeg = await sanitizePhoto(photo);
  } catch (e) {
    if (e instanceof PhotoError) return fail(422, e.message, { fields: { photo: e.message } });
    throw e;
  }

  const path = `${user.id}/${key}.jpg`;
  try {
    await uploadPhoto(path, jpeg);
  } catch {
    return fail(502, "사진 저장에 실패했습니다. 다시 시도해 주세요.");
  }

  const { value } = v;
  const { data, error } = await db.rpc("create_spot", {
    p_user: user.id,
    p_key: key,
    p_name: value.name,
    p_description: value.description,
    p_lat: value.location.lat,
    p_lng: value.location.lng,
    p_types: value.types,
    p_photo_path: path,
  });
  if (error || data?.error) {
    // orphan file; cron cleans it if this fails too (PRD §6.4)
    await removePhotos([path]).catch(() => {});
    if (data?.error === "rate_limited")
      return fail(429, "오늘 등록 한도(10개)를 초과했습니다. 내일 0시(KST) 이후 다시 등록할 수 있습니다.");
    return fail(500, "저장에 실패했습니다. 다시 시도해 주세요.");
  }
  return Response.json({ id: data.id });
}
