import { db, deleteSpot, fail, getUser, isOperator } from "@/lib/server";
import { clean } from "@/lib/spot-rules";

const RESOLUTIONS = ["no_action", "corrected", "hidden", "deleted"];

// body: { status: 'reviewing' | 'resolved' | 'dismissed', resolution?, note? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user || !(await isOperator(user))) return fail(403, "권한이 없습니다.");
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = String(body.status ?? "");
  const note = clean(body.note).slice(0, 1000) || null;

  const { data: report } = await db.from("spot_reports").select("id, spot_id, reason").eq("id", id).maybeSingle();
  if (!report) return fail(404, "신고가 없습니다.");

  if (status === "reviewing") {
    await db.from("spot_reports").update({ status }).eq("id", id);
    return Response.json({ ok: true });
  }
  if (status !== "resolved" && status !== "dismissed") return fail(422, "잘못된 상태입니다.");
  const resolution = status === "dismissed" ? "no_action" : String(body.resolution ?? "");
  if (!RESOLUTIONS.includes(resolution)) return fail(422, "처리 결과를 선택해 주세요.");

  if (report.spot_id && resolution === "hidden") {
    await db.from("spots").update({ visibility: "hidden" }).eq("id", report.spot_id);
    await db.from("moderation_actions").insert({ spot_id: report.spot_id, report_id: id, action: "hide", note, handled_by: user.id });
  }
  if (report.spot_id && resolution === "deleted") {
    await db.from("moderation_actions").insert({ spot_id: null, report_id: id, action: "delete", note, handled_by: user.id });
    await deleteSpot(report.spot_id);
  }

  // Rights/privacy reports: keep only the minimal operator note once handled (PRD §11)
  const sensitive = ["private_info", "photo_rights"].includes(report.reason);
  const { error } = await db
    .from("spot_reports")
    .update({
      status,
      resolution,
      note,
      handled_by: user.id,
      handled_at: new Date().toISOString(),
      ...(sensitive ? { description: null } : {}),
    })
    .eq("id", id);
  if (error) return fail(500, error.message);
  return Response.json({ ok: true });
}
