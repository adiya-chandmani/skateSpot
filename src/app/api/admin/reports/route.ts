import { db, fail, getUser, isOperator } from "@/lib/server";

// Operator report queue. Priority reasons first, then oldest.
export async function GET(req: Request) {
  if (!(await isOperator(await getUser(req)))) return fail(403, "권한이 없습니다.");
  const status = new URL(req.url).searchParams.get("status") ?? "open";
  const statuses = status === "done" ? ["resolved", "dismissed"] : ["open", "reviewing"];
  const { data, error } = await db
    .from("spot_reports")
    .select("id, spot_id, reason, description, status, resolution, note, handled_at, created_at, spots(name, visibility)")
    .in("status", statuses)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return fail(500, error.message);
  return Response.json({ reports: data });
}
