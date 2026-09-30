// Kakao coord→address for display only; never stored (PRD §4, §5). Failure → { address: null }.
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const lat = Number(p.get("lat"));
  const lng = Number(p.get("lng"));
  const key = process.env.KAKAO_REST_API_KEY;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !key) return Response.json({ address: null });

  const url = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(3000),
  }).catch(() => null);
  if (!res?.ok) return Response.json({ address: null });

  type Doc = { road_address: { address_name: string } | null; address: { address_name: string } | null };
  const json = (await res.json().catch(() => null)) as { documents?: Doc[] } | null;
  const d = json?.documents?.[0];
  return Response.json({ address: d?.road_address?.address_name ?? d?.address?.address_name ?? null });
}
