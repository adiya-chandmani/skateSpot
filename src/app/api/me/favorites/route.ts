import { db, fail, getUser, unauthorized } from "@/lib/server";
import type { SpotPin } from "@/components/SpotMeta";

export async function GET(req: Request) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const spots: SpotPin[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("spot_favorites")
      .select("spot:spots!inner(id,name,types,lat,lng,visibility)")
      .eq("user_id", user.id).eq("spot.visibility", "published")
      .order("created_at", { ascending: false }).order("spot_id")
      .range(offset, offset + 999);
    if (error) return fail(500, "즐겨찾기를 불러오지 못했습니다.");
    for (const { spot } of data as unknown as { spot: SpotPin }[])
      spots.push({ id: spot.id, name: spot.name, types: spot.types, lat: spot.lat, lng: spot.lng });
    if (data.length < 1000) break;
  }
  return Response.json({ spots }, { headers: { "cache-control": "private, no-store" } });
}
