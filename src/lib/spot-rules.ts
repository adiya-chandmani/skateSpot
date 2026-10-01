// Shared spot rules (PRD §6.2, §6.3). Keep in sync with supabase/migrations/0008_favorites_and_xgame.sql.

export const SPOT_TYPES = [
  { value: "plaza", label: "PLAZA", description: "Area / Zone · 구역형 스팟", emoji: "⛲", color: "#0F766E" },
  { value: "xgame_park", label: "X-GAME PARK", description: "스케이트·BMX 전용 파크", emoji: "🛹", color: "#C2410C" },
  { value: "street_spot", label: "STREET SPOTS", description: "개별 장애물형 스팟", emoji: "📷", color: "#6D28D9" },
] as const;

export type SpotType = (typeof SPOT_TYPES)[number]["value"];

const kindOf = (types: string[]) => SPOT_TYPES.find((t) => types.includes(t.value));
export const spotEmoji = (types: string[]) => kindOf(types)?.emoji ?? "📷";
/** Kind color (DESIGN.md Pins); same kind as spotEmoji picks. */
export const spotColor = (types: string[]) => kindOf(types)?.color ?? "#111111";

/** Equal RGB mix of the distinct kind colors in a group (one kind → its own color). */
export function mixColor(spots: { types: string[] }[]) {
  const colors = [...new Set(spots.map((s) => spotColor(s.types)))];
  const rgb = [0, 2, 4].map((i) =>
    Math.round(colors.reduce((a, c) => a + parseInt(c.slice(1 + i, 3 + i), 16), 0) / colors.length),
  );
  return `#${rgb.map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export const typeLabel = (t: string) => SPOT_TYPES.find((x) => x.value === t)?.label ?? t;

// ponytail: bbox, not the real border. Good enough to keep MVP data in Korea.
export const KOREA = { minLat: 33.0, maxLat: 38.9, minLng: 124.5, maxLng: 132.0 };
// Kakao map level: 1 (closest) … 14 (farthest)
export const KOREA_CENTER = { lat: 35.9, lng: 127.8, level: 13 };
export const LEVEL = { area: 5, spot: 3, pick: 2 };


export const REPORT_REASONS = [
  { value: "not_found", label: "장소 없음" },
  { value: "skatestopper", label: "스케이트 방지 장치" },
  { value: "no_skating", label: "스케이트 금지" },
  { value: "wrong_location", label: "잘못된 위치" },
  { value: "duplicate", label: "중복" },
  { value: "wrong_info", label: "잘못된 정보" },
  { value: "dangerous", label: "위험" },
  { value: "private_info", label: "사적 주소·개인정보" },
  { value: "photo_rights", label: "사진 권리 침해" },
  { value: "other", label: "기타" },
] as const;

export const PRIORITY_REASONS = ["private_info", "photo_rights", "dangerous"];

/** NFC + trim; length in code points. */
export const clean = (s: unknown) => (typeof s === "string" ? s.normalize("NFC").trim() : "");
export const len = (s: string) => [...s].length;

export type Coord = { lat: number; lng: number };

export function coordError(c: Partial<Coord> | null | undefined): string | null {
  if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") return "위치를 확정해 주세요.";
  const { lat, lng } = c;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "좌표가 올바르지 않습니다.";
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return "좌표가 범위를 벗어났습니다.";
  if (lat < KOREA.minLat || lat > KOREA.maxLat || lng < KOREA.minLng || lng > KOREA.maxLng)
    return "현재 대한민국 내 스팟만 등록할 수 있습니다.";
  return null;
}

export type SpotInput = {
  name: string;
  description: string;
  types: string[];
  location: Coord | null;
};

export type SpotErrors = Partial<Record<"name" | "description" | "types" | "location", string>>;

/** Returns cleaned values and field errors. Used by both the form and the API. */
export function validateSpot(raw: Partial<Record<keyof SpotInput, unknown>>) {
  const name = clean(raw.name);
  const description = clean(raw.description);
  const types = Array.isArray(raw.types) ? raw.types : [];
  const location = raw.location as Coord | null;
  const errors: SpotErrors = {};

  if (len(name) < 2 || len(name) > 80) errors.name = "이름은 2~80자로 입력해 주세요.";
  if (len(description) < 10 || len(description) > 1000) errors.description = "설명은 10~1000자로 입력해 주세요.";
  const allowed = SPOT_TYPES.map((t) => t.value as string);
  if (types.length !== 1) errors.types = "스팟 유형을 하나 선택해 주세요.";
  else if (types.some((t) => !allowed.includes(t)))
    errors.types = "허용되지 않은 유형입니다.";
  const ce = coordError(location);
  if (ce) errors.location = ce;

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { name, description, types, location: location as Coord },
  };
}

/** Straight-line distance in meters (haversine). */
export function distanceM(a: Coord, b: Coord) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const formatDistance = (m: number) => (m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`);

// Directions. Skateboard follows walking routes (bike paths have stretches boards can't use);
// only its time estimate uses board speed.
export const TRAVEL_MODES = [
  { value: "bus", label: "버스", emoji: "🚌", kakaoApp: "PUBLICTRANSIT", naver: "public", kakaoWeb: "traffic", kmh: 0 },
  { value: "car", label: "자동차", emoji: "🚗", kakaoApp: "CAR", naver: "car", kakaoWeb: "car", kmh: 0 },
  { value: "walk", label: "도보", emoji: "🚶", kakaoApp: "FOOT", naver: "walk", kakaoWeb: "walk", kmh: 4.5 },
  { value: "skate", label: "스케이트보드", emoji: "🛹", kakaoApp: "FOOT", naver: "walk", kakaoWeb: "walk", kmh: 12 },
] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number]["value"];
const modeOf = (m: TravelMode) => TRAVEL_MODES.find((t) => t.value === m)!;

// ponytail: walk/skate distance = car road distance, else straight line × 1.3 (typical urban detour).
export const roadMeters = (from: Coord, to: Coord, carMeters?: number | null) => carMeters ?? distanceM(from, to) * 1.3;

/** Minutes at the mode's speed; null for modes we can't estimate (bus, car without API). */
export function estimateMinutes(mode: TravelMode, meters: number) {
  const kmh = modeOf(mode).kmh;
  return kmh ? Math.max(1, Math.round(meters / 1000 / kmh * 60)) : null;
}

export const formatMinutes = (min: number) => (min < 60 ? `${min}분` : `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ""}`);

/** App and web links for a route; without `from` the apps use the device's current position. */
export function routeLinks(mode: TravelMode, to: Coord & { name: string }, from?: Coord | null) {
  const m = modeOf(mode);
  const name = encodeURIComponent(to.name.replace(/,/g, " "));
  const kakaoApp = `kakaomap://route?${from ? `sp=${from.lat},${from.lng}&` : ""}ep=${to.lat},${to.lng}&by=${m.kakaoApp}`;
  const naverApp = `nmap://route/${m.naver}?${from ? `slat=${from.lat}&slng=${from.lng}&sname=${encodeURIComponent("내 위치")}&` : ""}dlat=${to.lat}&dlng=${to.lng}&dname=${name}&appname=skatespot.vercel.app`;
  const kakaoWeb = from
    ? `https://map.kakao.com/link/by/${m.kakaoWeb}/${encodeURIComponent("내 위치")},${from.lat},${from.lng}/${name},${to.lat},${to.lng}`
    : `https://map.kakao.com/link/to/${name},${to.lat},${to.lng}`;
  return { kakaoApp, naverApp, kakaoWeb };
}
