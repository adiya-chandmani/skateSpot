import { clerkClient } from "@clerk/nextjs/server";
import { db, fail, getUser, removePhotos, unauthorized } from "@/lib/server";

// Account deletion (PRD §3). Users live in Clerk, so there are no FK cascades:
// hide spots now, remove files and rows, anonymize reports, then delete the Clerk user.
// Anything left in 'deleting' is finished by the cleanup cron.
export async function DELETE(req: Request) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const { error: favoritesError } = await db.from("spot_favorites").delete().eq("user_id", user.id);
  if (favoritesError) return fail(500, "즐겨찾기 삭제에 실패했습니다. 다시 시도해 주세요.");

  const { data: spots } = await db
    .from("spots")
    .update({ visibility: "deleting" })
    .eq("created_by", user.id)
    .select("photo_path");

  // unlink reports and strip free text that may identify the user
  await db.from("spot_reports").update({ description: null, reported_by: null }).eq("reported_by", user.id);

  await removePhotos((spots ?? []).map((s) => s.photo_path).filter(Boolean)).catch(() => {});
  await db.from("spots").delete().eq("created_by", user.id);
  await db.from("rate_events").delete().eq("user_id", user.id);

  try {
    await (await clerkClient()).users.deleteUser(user.id);
  } catch {
    return fail(500, "탈퇴 처리에 실패했습니다. 다시 시도해 주세요.");
  }
  return Response.json({ ok: true });
}
