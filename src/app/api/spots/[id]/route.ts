import {
  db,
  deleteSpot,
  fail,
  getSpotRow,
  getUser,
  isOperator,
  PhotoError,
  removePhotos,
  sanitizePhoto,
  unauthorized,
  uploadPhoto,
} from "@/lib/server";
import { validateSpot } from "@/lib/spot-rules";

type Ctx = { params: Promise<{ id: string }> };

const gone = () => fail(404, "이용할 수 없는 스팟입니다.");

// Public detail. Hidden/deleted/missing all look the same (PRD §4).
export async function GET(req: Request, { params }: Ctx) {
  const row = await getSpotRow((await params).id);
  const user = await getUser(req);
  const isOwner = !!row && row.created_by === user?.id;
  if (!row || (row.visibility !== "published" && !(isOwner && row.visibility === "hidden"))) return gone();
  return Response.json({
    id: row.id,
    name: row.name,
    description: row.description,
    types: row.types,
    lat: row.lat,
    lng: row.lng,
    updated_at: row.updated_at,
    visibility: isOwner ? row.visibility : undefined,
    isOwner,
  });
}

// Author edit; photo optional (PRD §7)
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const row = await getSpotRow((await params).id);
  if (!row || row.created_by !== user.id || row.visibility !== "published") return gone();

  const form = await req.formData().catch(() => null);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(String(form?.get("data")));
  } catch {
    return fail(400, "잘못된 요청입니다.");
  }
  const v = validateSpot(body);
  if (!v.ok) return fail(422, "입력값을 확인해 주세요.", { fields: v.errors });

  const photo = form?.get("photo");
  let newPath: string | null = null;
  if (photo instanceof File) {
    try {
      const jpeg = await sanitizePhoto(photo);
      newPath = `${user.id}/${crypto.randomUUID()}.jpg`;
      await uploadPhoto(newPath, jpeg);
    } catch (e) {
      if (e instanceof PhotoError) return fail(422, e.message, { fields: { photo: e.message } });
      return fail(502, "사진 저장에 실패했습니다. 기존 사진은 유지됩니다.");
    }
  }

  const { value } = v;
  const { error } = await db
    .from("spots")
    .update({
      name: value.name,
      description: value.description,
      types: value.types,
      lat: value.location.lat,
      lng: value.location.lng,
      ...(newPath ? { photo_path: newPath } : {}),
    })
    .eq("id", row.id)
    .eq("visibility", "published");
  if (error) {
    if (newPath) await removePhotos([newPath]).catch(() => {});
    return fail(500, "저장에 실패했습니다. 기존 스팟은 유지됩니다.");
  }
  // old file removed only after DB points at the new one (A14)
  if (newPath) await removePhotos([row.photo_path]).catch(() => {});
  return Response.json({ id: row.id });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const row = await getSpotRow((await params).id);
  if (!row || row.visibility === "deleting") return Response.json({ ok: true }); // retry-safe
  if (row.created_by !== user.id && !(await isOperator(user))) return gone();
  await deleteSpot(row.id);
  if (row.created_by !== user.id)
    await db.from("moderation_actions").insert({ spot_id: null, action: "delete", handled_by: user.id });
  return Response.json({ ok: true });
}
