import { BUCKET, db, fail, getSpotRow, PHOTO_URL_TTL } from "@/lib/server";

// <img src="/api/photos/:id"> → checks published state, then redirects to a short-lived signed URL.
// The browser may reuse the redirect for 5 min (URL stays valid 10 min, PRD §9); private = no shared cache.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const row = await getSpotRow((await params).id);
  if (!row || row.visibility !== "published") return fail(404, "not found");
  const { data } = await db.storage.from(BUCKET).createSignedUrl(row.photo_path, PHOTO_URL_TTL);
  if (!data) return fail(404, "not found");
  return new Response(null, {
    status: 302,
    headers: { location: data.signedUrl, "cache-control": "private, max-age=300" },
  });
}
