import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

export const BUCKET = "spot-photos";
export const PHOTO_URL_TTL = 600; // 10 min signed URLs (PRD §9)

// Service-role client: bypasses RLS. Server only. Every route must check auth/ownership itself.
export const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type AuthUser = { id: string };

/** Clerk session from the request (cookie, or `Authorization: Bearer <session token>`). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getUser(_req?: Request): Promise<AuthUser | null> {
  const { userId } = await auth();
  return userId ? { id: userId } : null;
}

// Operator role lives in Clerk publicMetadata, which only the backend can write (PRD §3).
export async function isOperator(u: AuthUser | null) {
  if (!u) return false;
  const user = await (await clerkClient()).users.getUser(u.id);
  return user.publicMetadata?.role === "admin";
}

export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  Response.json({ error, ...extra }, { status });

export const unauthorized = () => fail(401, "로그인이 필요합니다.");

/** Re-encode on the upload boundary: real decode, size/pixel limits, EXIF-less JPEG ≤2MB (PRD §6.1). */
export async function sanitizePhoto(file: File): Promise<Buffer> {
  if (file.size > 10 * 1024 * 1024) throw new PhotoError("파일이 10MB를 넘습니다.");
  const input = Buffer.from(await file.arrayBuffer());
  let meta;
  try {
    meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new PhotoError("이미지를 읽을 수 없습니다. 다른 사진을 선택해 주세요.");
  }
  if (!["jpeg", "png", "webp"].includes(meta.format ?? "")) throw new PhotoError("JPEG·PNG·WebP만 지원합니다.");
  if ((meta.pages ?? 1) > 1) throw new PhotoError("애니메이션 이미지는 지원하지 않습니다.");

  for (const quality of [85, 75, 65, 55]) {
    try {
      // sharp drops all metadata unless withMetadata() is called
      const out = await sharp(input, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (out.length <= 2 * 1024 * 1024) return out;
    } catch {
      throw new PhotoError("이미지를 처리할 수 없습니다. 다른 사진을 선택해 주세요.");
    }
  }
  throw new PhotoError("이미지를 2MB 이하로 줄일 수 없습니다.");
}

export class PhotoError extends Error {}

export async function uploadPhoto(path: string, data: Buffer) {
  const { error } = await db.storage.from(BUCKET).upload(path, data, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
}

export async function removePhotos(paths: string[]) {
  if (paths.length) await db.storage.from(BUCKET).remove(paths);
}

/** Soft-delete now, clean files/rows now if possible; cron retries anything left (PRD §7). */
export async function deleteSpot(id: string) {
  const { data } = await db.from("spots").update({ visibility: "deleting" }).eq("id", id).select("photo_path").single();
  try {
    if (data?.photo_path) await removePhotos([data.photo_path]);
    await db.from("spots").delete().eq("id", id);
  } catch {
    // left in 'deleting'; /api/cron/cleanup finishes it
  }
}

/** Strips anything unsafe for public output (no created_by / email). */
export type PublicSpot = {
  id: string;
  name: string;
  description: string;
  types: string[];
  lat: number;
  lng: number;
  updated_at: string;
};

export type SpotRow = PublicSpot & { created_by: string; visibility: string; photo_path: string };

export async function getSpotRow(id: string): Promise<SpotRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db
    .from("spots")
    .select("id, created_by, name, description, types, lat, lng, visibility, photo_path, updated_at")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function notifyOperators(text: string) {
  // ponytail: one webhook (Slack/Discord-compatible) is enough for MVP alerts. Swap for email if needed.
  const url = process.env.OPERATOR_WEBHOOK_URL;
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, content: text }),
  }).catch(() => {});
}
