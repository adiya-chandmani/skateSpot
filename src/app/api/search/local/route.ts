import { fail } from "@/lib/server";
import { clean } from "@/lib/spot-rules";

// Kakao Local keyword search proxy. Results are display-only, never stored (PRD §5).
export async function GET(req: Request) {
  const q = clean(new URL(req.url).searchParams.get("q"));
  if ([...q].length < 2) return Response.json({ results: [] });
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return fail(503, "지역 검색을 사용할 수 없습니다.");

  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?size=10&query=${encodeURIComponent(q.slice(0, 50))}`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!res?.ok) {
    // status only — never log the query (PRD §9). 401/403 usually = key or disabled Kakao Map service.
    console.error("kakao local search failed", res?.status ?? "network");
    return fail(502, "지역 검색에 실패했습니다.");
  }

  const json = (await res.json()) as {
    documents: { place_name: string; road_address_name: string; address_name: string; x: string; y: string }[];
  };
  // x = longitude, y = latitude (WGS84)
  const results = json.documents
    .map((d) => ({ title: d.place_name, address: d.road_address_name || d.address_name, lat: Number(d.y), lng: Number(d.x) }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  return Response.json({ results });
}
