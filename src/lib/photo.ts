"use client";
import { gps } from "exifr";

export const PHOTO_HINT = "JPEG·PNG·WebP 정적 이미지, 10MB·40메가픽셀 이하. HEIC는 JPEG로 내보낸 뒤 선택해 주세요.";
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export type ProcessedPhoto = {
  blob: Blob;
  previewUrl: string;
  exif: { lat: number; lng: number } | null;
};

/**
 * Browser-side: read EXIF GPS from the original, apply orientation, resize to ≤2048px,
 * flatten on white, re-encode JPEG ≤2MB. Output has no metadata (canvas export). PRD §6.1.
 */
export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  if (!ACCEPTED.includes(file.type)) throw new Error(`지원하지 않는 형식입니다. ${PHOTO_HINT}`);
  if (file.size > 10 * 1024 * 1024) throw new Error("파일이 10MB를 넘습니다.");

  let exif: ProcessedPhoto["exif"] = null;
  try {
    const g = await gps(file);
    if (g && Number.isFinite(g.latitude) && Number.isFinite(g.longitude)) exif = { lat: g.latitude, lng: g.longitude };
  } catch {
    // parse failure = no location (PRD §6.1)
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("이미지를 읽을 수 없습니다. 손상되었거나 지원하지 않는 파일입니다. 다른 사진을 선택해 주세요.");
  }
  if (bitmap.width * bitmap.height > 40_000_000) {
    bitmap.close();
    throw new Error("40메가픽셀을 넘는 이미지입니다.");
  }

  const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 처리할 수 없습니다.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const q of [0.85, 0.75, 0.65, 0.55]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (!blob) break;
    if (blob.size <= 2 * 1024 * 1024) return { blob, previewUrl: URL.createObjectURL(blob), exif };
  }
  // never fall back to uploading the original (PRD §6.1)
  throw new Error("이미지를 처리할 수 없습니다. 다른 사진을 선택해 주세요.");
}
