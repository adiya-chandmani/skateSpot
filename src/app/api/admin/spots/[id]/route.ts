import { db, deleteSpot, fail, getSpotRow, getUser, isOperator } from "@/lib/server";
import { clean } from "@/lib/spot-rules";

// Direct operator action without a report (PRD §8). body: { action: 'hide'|'restore'|'delete', note }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user || !(await isOperator(user))) return fail(403, "권한이 없습니다.");
  const row = await getSpotRow((await params).id);
  if (!row || row.visibility === "deleting") return fail(404, "스팟이 없습니다.");
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const note = clean(body.note).slice(0, 1000) || null;

  if (action === "delete") {
    await db.from("moderation_actions").insert({ spot_id: null, action, note, handled_by: user.id });
    await deleteSpot(row.id);
    return Response.json({ ok: true });
  }
  const visibility = { hide: "hidden", restore: "published" }[action];
  if (!visibility) return fail(422, "잘못된 조치입니다.");
  await db.from("spots").update({ visibility }).eq("id", row.id);
  await db.from("moderation_actions").insert({ spot_id: row.id, action, note, handled_by: user.id });
  return Response.json({ ok: true });
}
