import { fail } from "@/lib/server";
import { coordError, type Coord } from "@/lib/spot-rules";

type Route = { distance: number; duration: number; path: [number, number][] };

// ≤ ~500 points is plenty for the detail map polyline
const thin = (pts: [number, number][]) => {
  const step = Math.ceil(pts.length / 500);
  return pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
};

/** Car: Kakao Mobility (the only public Kakao routing API; key stays server-side). */
async function car(from: Coord, to: Coord): Promise<Route | null> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return null;
  const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${from.lng},${from.lat}&destination=${to.lng},${to.lat}`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!res?.ok) return null;
  type R = { result_code: number; summary: { distance: number; duration: number }; sections: { roads: { vertexes: number[] }[] }[] };
  const r = ((await res.json().catch(() => null)) as { routes?: R[] } | null)?.routes?.[0];
  if (!r || r.result_code !== 0) return null;
  const pts: [number, number][] = [];
  for (const s of r.sections) for (const road of s.roads)
    for (let i = 0; i + 1 < road.vertexes.length; i += 2) pts.push([road.vertexes[i + 1], road.vertexes[i]]);
  return { distance: r.summary.distance, duration: r.summary.duration, path: thin(pts) };
}

/**
 * Walking (also used for skateboards): Kakao has no public walking API, so use the
 * OpenStreetMap foot router run by FOSSGIS.
 * ponytail: free shared server with fair-use limits and no SLA; swap for TMAP pedestrian API (needs a key) if it gets busy.
 */
async function walk(from: Coord, to: Coord): Promise<Route | null> {
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url, { headers: { "User-Agent": "skatespot.vercel.app" }, signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!res?.ok) return null;
  type R = { distance: number; duration: number; geometry: { coordinates: [number, number][] } };
  const r = ((await res.json().catch(() => null)) as { code?: string; routes?: R[] } | null)?.routes?.[0];
  if (!r) return null;
  return { distance: r.distance, duration: r.duration, path: thin(r.geometry.coordinates.map(([lng, lat]) => [lat, lng])) };
}

// GET ?from=lat,lng&to=lat,lng&mode=car|walk → { route } ; failure → { route: null } (client falls back to estimates)
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const parse = (v: string | null) => {
    const [lat, lng] = (v ?? "").split(",").map(Number);
    return { lat, lng };
  };
  const from = parse(p.get("from"));
  const to = parse(p.get("to"));
  if (coordError(from) || coordError(to)) return fail(400, "잘못된 좌표입니다.");
  const route = p.get("mode") === "walk" ? await walk(from, to) : await car(from, to);
  return Response.json({ route });
}
