import { db, fail, getSpotRow, getUser, notifyOperators, unauthorized } from "@/lib/server";
import { clean, len, PRIORITY_REASONS, REPORT_REASONS } from "@/lib/spot-rules";

export async function POST(req: Request) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason ?? "");
  const description = clean(body.description);

  if (!REPORT_REASONS.some((r) => r.value === reason)) return fail(422, "신고 사유를 선택해 주세요.");
  if (len(description) > 1000) return fail(422, "설명은 1000자 이하로 입력해 주세요.");
  if (reason === "other" && len(description) < 10) return fail(422, "기타 사유는 10자 이상 설명해 주세요.");

  const spot = await getSpotRow(String(body.spot_id ?? ""));
  if (!spot || spot.visibility !== "published") return fail(404, "이용할 수 없는 스팟입니다.");

  const { data, error } = await db.rpc("create_report", {
    p_user: user.id,
    p_spot: spot.id,
    p_reason: reason,
    p_description: description,
  });
  if (error) return fail(500, "신고 접수에 실패했습니다.");
  if (data.error === "rate_limited")
    return fail(429, "오늘 신고 한도(20개)를 초과했습니다. 내일 0시(KST) 이후 다시 신고할 수 있습니다.");
  if (data.duplicate) return Response.json({ duplicate: true });

  // Priority alert: link only, no reporter identity or text (PRD §8)
  if (PRIORITY_REASONS.includes(reason)) {
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
    await notifyOperators(`[SPOTK8] 우선 신고 접수 — ${origin}/admin`);
  }
  return Response.json({ ok: true });
}
