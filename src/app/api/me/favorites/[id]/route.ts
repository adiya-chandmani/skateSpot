import { db, fail, getSpotRow, getUser, unauthorized } from "@/lib/server";

type Ctx = { params: Promise<{ id: string }> };
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function PUT(req: Request, { params }: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  if (!validId(id)) return fail(400, "잘못된 스팟입니다.");
  const spot = await getSpotRow(id);
  if (!spot || spot.visibility !== "published") return fail(404, "이용할 수 없는 스팟입니다.");
  const { error } = await db.from("spot_favorites").upsert(
    { user_id: user.id, spot_id: id }, { onConflict: "user_id,spot_id", ignoreDuplicates: true },
  );
  if (error) return fail(500, "즐겨찾기를 저장하지 못했습니다.");
  return Response.json({ spot: { id: spot.id, name: spot.name, types: spot.types, lat: spot.lat, lng: spot.lng } });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  if (!validId(id)) return fail(400, "잘못된 스팟입니다.");
  const { error } = await db.from("spot_favorites").delete().eq("user_id", user.id).eq("spot_id", id);
  if (error) return fail(500, "즐겨찾기를 해제하지 못했습니다.");
  return Response.json({ ok: true });
}
