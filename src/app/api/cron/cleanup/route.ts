import { BUCKET, db, fail, removePhotos } from "@/lib/server";

// Daily 03:00 KST (vercel.json; Hobby plan allows daily crons only — PRD §7 wants ≤1h, go hourly on Pro). Idempotent: finishes deletions, drops stale drafts and orphan files (PRD §6.4, §7).
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET)
    return fail(401, "unauthorized");

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // 1) rows stuck in 'deleting', and drafts older than 24h
  const { data: dead } = await db
    .from("spots")
    .select("id, photo_path")
    .or(`visibility.eq.deleting,and(visibility.eq.draft,created_at.lt.${dayAgo})`)
    .limit(500);
  if (dead?.length) {
    await removePhotos(dead.map((d) => d.photo_path).filter(Boolean));
    await db.from("spots").delete().in("id", dead.map((d) => d.id));
  }

  // 2) files no spot points at (failed saves / replaced photos), older than 1h to skip in-flight uploads
  const { data: orphans } = await db.rpc("orphan_photo_paths", { older_than: new Date(Date.now() - 3600 * 1000).toISOString() });
  const paths = (orphans ?? []).map((o: { name: string }) => o.name);
  if (paths.length) await db.storage.from(BUCKET).remove(paths);

  // 3) rate events only matter for the current day; keep 90 days for abuse review
  await db.from("rate_events").delete().lt("created_at", new Date(Date.now() - 90 * 86400 * 1000).toISOString());

  return Response.json({ spots: dead?.length ?? 0, orphans: paths.length });
}
