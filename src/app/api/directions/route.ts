import { fail } from "@/lib/server";
import { coordError } from "@/lib/spot-rules";

// Car route via Kakao Mobility (the only public Kakao routing API). Failure → { route: null };
// the client then falls back to straight-line estimates.
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const parse = (v: string | null) => {
    const [lat, lng] = (v ?? "").split(",").map(Number);
    return { lat, lng };
  };
  const from = parse(p.get("from"));
  const to = parse(p.get("to"));
  if (coordError(from) || coordError(to)) return fail(400, "잘못된 좌표입니다.");
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return Response.json({ route: null });

  const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${from.lng},${from.lat}&destination=${to.lng},${to.lat}`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!res?.ok) return Response.json({ route: null });

  type Road = { vertexes: number[] };
  type Route = { result_code: number; summary: { distance: number; duration: number }; sections: { roads: Road[] }[] };
  const r = ((await res.json().catch(() => null)) as { routes?: Route[] } | null)?.routes?.[0];
  if (!r || r.result_code !== 0) return Response.json({ route: null });

  // vertexes are flat [x, y, x, y, …]; keep ≤ ~500 points for the client polyline
  const pts: [number, number][] = [];
  for (const s of r.sections) for (const road of s.roads)
    for (let i = 0; i + 1 < road.vertexes.length; i += 2) pts.push([road.vertexes[i + 1], road.vertexes[i]]);
  const step = Math.ceil(pts.length / 500);
  const path = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  return Response.json({ route: { distance: r.summary.distance, duration: r.summary.duration, path } });
}
