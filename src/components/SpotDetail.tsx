"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import { LoginModal } from "@/components/LoginForm";
import KakaoMap from "@/components/KakaoMap";
import ReportForm from "@/components/ReportForm";
import SpotMeta from "@/components/SpotMeta";
import { FavoriteButton } from "@/components/Favorites";
import { api, ApiError, getLocation, openRoute, useSession, type GeoResult } from "@/lib/client";
import { distanceM, estimateMinutes, formatDistance, formatMinutes, LEVEL, roadMeters, routeLinks, spotColor, TRAVEL_MODES, type TravelMode } from "@/lib/spot-rules";

type Route = { distance: number; duration: number; path: [number, number][] };

type Spot = {
  id: string;
  name: string;
  description: string;
  types: string[];
  lat: number;
  lng: number;
  updated_at: string;
  visibility?: string;
  isOwner: boolean;
};

/** Page layout classes only apply to the full page; docked keeps the panel's single column. */
const strip = (cls: string) => cls.split(/\s+/).filter((c) => !/^(md|lg):/.test(c)).join(" ");

function BackButton({ onPhoto, docked }: { onPhoto: boolean; docked?: Docked }) {
  const router = useRouter();
  if (docked)
    return (
      <button onClick={docked.onClose} className="btn-plain -ml-1 self-start">
        <Icon name="chevronLeft" className="h-5 w-5" />
        목록
      </button>
    );
  return (
    <button
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      aria-label="뒤로"
      className={`icon-btn press fixed left-3 top-[max(12px,env(safe-area-inset-top))] z-30 shadow-float lg:left-6 lg:top-6 lg:w-auto lg:gap-0.5 lg:bg-bg lg:pl-2 lg:pr-4 ${onPhoto ? "glass" : "bg-bg"}`}
    >
      <Icon name="chevronLeft" className="h-6 w-6 text-label" />
      <span aria-hidden className="hidden text-headline font-semibold text-label lg:inline">
        지도
      </span>
    </button>
  );
}

/** The home map, when the detail is docked in the map panel (desktop) instead of its own page. */
export type Docked = { map: any; kakao: any; onClose: () => void };

/**
 * Spot detail. As a page it has its own location map; docked in the map panel it draws my
 * position and the route on the big map next to it instead.
 */
export default function SpotDetail({ id, docked }: { id: string; docked?: Docked }) {
  const router = useRouter();
  const L = (page: string, dock = strip(page)) => (docked ? dock : page);
  const session = useSession();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "gone" | "error">("loading");
  const [address, setAddress] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "report" | "delete" | "login">("none");
  const [msg, setMsg] = useState<string | null>(null);
  const [me, setMe] = useState<GeoResult | null>(null);
  // where routes were fetched from; only moves after 300m so following doesn't refetch every fix
  const [origin, setOrigin] = useState<GeoResult | null>(null);
  const [follow, setFollow] = useState(false);
  const watchId = useRef<number | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [dirOpen, setDirOpen] = useState(false);
  const [mode, setMode] = useState<TravelMode>("skate");
  // undefined = not fetched yet, null = unavailable (fall back to estimates)
  const [routes, setRoutes] = useState<{ car?: Route | null; walk?: Route | null }>({});
  const [mapReady, setMapReady] = useState(!!docked);
  const mapRef = useRef<{ map: any; kakao: any; overlays: any[] } | null>(docked ? { map: docked.map, kakao: docked.kakao, overlays: [] } : null);
  // docked: overlays live on the shared home map, so take them down when the detail closes
  useEffect(() => {
    const m = mapRef.current;
    return () => m?.overlays.forEach((o) => o.setMap(null));
  }, []);
  const fitted = useRef(""); // what the view was last fitted to; user zoom survives everything else

  const updateMe = useCallback((p: GeoResult) => {
    setMe(p);
    setOrigin((o) => (!o || distanceM(o, p) > 300 ? p : o));
  }, []);

  const locate = useCallback(() => {
    setLocErr(null);
    return getLocation().then(updateMe, (e: Error) => setLocErr(e.message));
  }, [updateMe]);

  const stopFollow = useCallback(() => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setFollow(false);
  }, []);

  /** "내 위치 고정": keep the map on me and track movement until the map is dragged. */
  function toggleFollow() {
    if (follow) return stopFollow();
    if (!("geolocation" in navigator)) return setLocErr("이 브라우저는 위치 기능을 지원하지 않습니다.");
    setLocErr(null);
    setFollow(true);
    watchId.current = navigator.geolocation.watchPosition(
      (p) => updateMe({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => {
        stopFollow();
        setLocErr("현재 위치를 확인할 수 없습니다. 위치 권한을 확인해 주세요.");
      },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  }
  useEffect(() => stopFollow, [stopFollow]);

  // Show my position without a prompt only if permission was already granted.
  useEffect(() => {
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => {
        if (p.state === "granted") locate();
      })
      .catch(() => {});
  }, [locate]);

  function startDirections() {
    setDirOpen(true);
    requestAnimationFrame(() => document.getElementById("directions")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    if (!me) locate();
  }

  // Car route from Kakao; walking route (also used for skateboards) from the OSM foot router.
  useEffect(() => {
    if (!dirOpen || !origin || !spot) return;
    let live = true;
    for (const kind of ["car", "walk"] as const)
      api<{ route: Route | null }>(`/api/directions?mode=${kind}&from=${origin.lat},${origin.lng}&to=${spot.lat},${spot.lng}`)
        .then((r) => live && setRoutes((rs) => ({ ...rs, [kind]: r.route })))
        .catch(() => live && setRoutes((rs) => ({ ...rs, [kind]: null })));
    return () => {
      live = false;
    };
  }, [dirOpen, origin, spot]);
  const route = mode === "car" ? routes.car : mode === "bus" ? null : routes.walk;

  const load = useCallback(() => {
    api<Spot>(`/api/spots/${id}`)
      .then((s) => {
        setSpot(s);
        setState("ok");
        // display-only reverse geocode; failure just hides the address
        api<{ address: string | null }>(`/api/geocode/reverse?lat=${s.lat}&lng=${s.lng}`)
          .then((r) => setAddress(r.address))
          .catch(() => {});
      })
      .catch((e: ApiError) => setState(e.status === 404 ? "gone" : "error"));
  }, [id]);

  useEffect(() => {
    if (session !== undefined) load();
  }, [session, load]);

  const onMap = useCallback(
    (map: any, kakao: any) => {
      if (spot)
        new kakao.maps.CustomOverlay({
          map,
          position: new kakao.maps.LatLng(spot.lat, spot.lng),
          zIndex: 3,
          content: `<div style="width:30px;height:30px;border-radius:50%;background:${spotColor(spot.types)};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25)" aria-hidden="true"></div>`,
        });
      mapRef.current = { map, kakao, overlays: [] };
      kakao.maps.event.addListener(map, "dragstart", stopFollow); // moving the map by hand releases the lock
      setMapReady(true);
    },
    [spot, stopFollow],
  );

  // My position dot, route line, and a view that fits whatever is shown.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !spot) return;
    const { map, kakao } = m;
    m.overlays.forEach((o) => o.setMap(null));
    m.overlays = [];
    const LL = (lat: number, lng: number) => new kakao.maps.LatLng(lat, lng);
    if (!me) return;
    m.overlays.push(
      new kakao.maps.CustomOverlay({
        map,
        position: LL(me.lat, me.lng),
        zIndex: 2,
        content: `<div style="width:18px;height:18px;border-radius:50%;background:#007aff;border:3px solid #fff;box-shadow:0 0 0 6px rgba(0,122,255,.18),0 1px 4px rgba(0,0,0,.3)" aria-label="내 위치"></div>`,
      }),
    );
    const showRoute = dirOpen && route && mode !== "bus";
    if (showRoute)
      m.overlays.push(
        new kakao.maps.Polyline({
          map,
          path: route.path.map(([lat, lng]) => LL(lat, lng)),
          strokeWeight: 5,
          strokeColor: "#007aff",
          strokeOpacity: 0.85,
          // walking route is OSM-based and may differ from Kakao's; dashed says "approximate"
          strokeStyle: mode === "car" ? "solid" : "shortdash",
        }),
      );
    // Fit only when what's shown changes (first fix, directions, mode, route) — not on follow
    // toggles or later position updates, so the user's zoom is kept.
    const key = `${dirOpen}|${mode}|${showRoute ? route.path.length : 0}`;
    const changed = fitted.current !== key;
    fitted.current = key;
    if (follow) {
      map.panTo(LL(me.lat, me.lng));
      return;
    }
    if (!changed) return;
    // fit both points (and the route) unless they're far apart and we're just browsing
    if (!dirOpen && distanceM(me, spot) > 30000) return;
    const b = new kakao.maps.LatLngBounds();
    b.extend(LL(spot.lat, spot.lng));
    b.extend(LL(me.lat, me.lng));
    if (showRoute) route.path.forEach(([lat, lng]) => b.extend(LL(lat, lng)));
    map.relayout(); // the map grows when directions open; fit to the new size
    // docked on desktop the panel (16 + 380px) covers the map's left edge
    const left = docked && window.matchMedia("(min-width: 768px)").matches ? 440 : 40;
    map.setBounds(b, 60, 60, 60, left);
  }, [me, route, mode, dirOpen, spot, mapReady, follow, docked]);

  async function remove() {
    try {
      await api(`/api/spots/${id}`, { method: "DELETE" });
      router.replace("/account");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  if (state === "loading")
    return (
      <div className={L("min-h-dvh bg-bg-grouped", "flex flex-col gap-3")} aria-busy>
        <BackButton onPhoto={false} docked={docked} />
        <div className={L("lg:mx-auto lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10 lg:px-20 lg:pt-6")}>
          <div className={L("aspect-[4/3] w-full animate-pulse bg-fill md:mx-auto md:mt-4 md:max-w-2xl md:rounded-2xl lg:mt-0", "aspect-[4/3] w-full animate-pulse rounded-xl bg-fill")} />
          <div className={L("mx-auto w-full max-w-2xl space-y-3 p-4 lg:p-0", "space-y-3 pt-4")}>
            <div className="h-8 w-2/3 animate-pulse rounded-lg bg-fill" />
            <div className="h-5 w-1/2 animate-pulse rounded-lg bg-fill" />
          </div>
        </div>
      </div>
    );
  if (state === "error")
    return (
      <div className={L("flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg-grouped p-8 text-center", "flex flex-col items-center gap-3 py-8 text-center")}>
        <BackButton onPhoto={false} docked={docked} />
        <p role="alert" className="text-body">
          스팟을 불러오지 못했습니다.
        </p>
        <button
          className="btn"
          onClick={() => {
            setState("loading");
            load();
          }}
        >
          다시 시도
        </button>
      </div>
    );
  if (state === "gone" || !spot)
    return (
      <div className={L("flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg-grouped p-8 text-center", "flex flex-col items-center gap-3 py-8 text-center")}>
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-fill text-label-2" aria-hidden>
          <Icon name="map" className="h-7 w-7" />
        </span>
        <h1 className="text-title2 font-bold">이용할 수 없는 스팟입니다</h1>
        <p className="text-subhead text-label-2">삭제되었거나 비공개 처리된 스팟일 수 있습니다.</p>
        <Link href="/" className="btn-primary mt-2 w-full max-w-xs">
          지도로 가기
        </Link>
      </div>
    );

  const hidden = spot.visibility === "hidden";
  const actions: { icon: IconName; label: string; onClick?: () => void; href?: string; danger?: boolean; blue?: boolean }[] = [
    { icon: "route", label: "길찾기", onClick: startDirections, blue: true },
    ...(spot.isOwner
      ? [
          ...(!hidden ? [{ icon: "pencil" as const, label: "수정", href: `/spot/${spot.id}/edit` }] : []),
          { icon: "trash" as const, label: "삭제", onClick: () => setPanel("delete"), danger: true },
        ]
      : [{ icon: "flag" as const, label: "신고", onClick: () => setPanel(session ? "report" : "login") }]),
  ];

  return (
    <div className={L("min-h-dvh bg-bg-grouped pb-[max(24px,env(safe-area-inset-bottom))]", "flex flex-col gap-3")}>
      <BackButton onPhoto={!hidden} docked={docked} />
      {/* lg+: photo column stays in view on the left, details scroll on the right */}
      <div className={L("lg:mx-auto lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-10 lg:px-20 lg:pt-24")}>
      {!hidden ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/photos/${spot.id}`}
          alt={`${spot.name} 사진`}
          fetchPriority="high"
          className={L("aspect-[4/3] max-h-[60dvh] w-full bg-fill object-cover md:mx-auto md:mt-4 md:max-w-2xl md:rounded-2xl lg:col-start-1 lg:row-start-1 lg:mt-0 lg:max-w-none", "aspect-[4/3] w-full rounded-xl bg-fill object-cover")}
        />
      ) : (
        <div className={L("h-[calc(64px+env(safe-area-inset-top))] lg:hidden", "hidden")} />
      )}

      <article className={L("mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:px-0 lg:pt-0", "flex flex-col gap-5 pt-4")}>
        {hidden && (
          <p className="card text-subhead" role="status">
            운영 검토로 숨김 처리된 스팟입니다. 다른 사용자에게 보이지 않습니다. 정정 요청은{" "}
            <Link href="/privacy" className="text-link underline">
              운영 문의
            </Link>
            로 보내 주세요.
          </p>
        )}

        <header className="flex flex-col gap-2.5">
          <h1 className={docked ? "text-title2 font-bold" : "text-large-title font-bold tracking-tight"}>{spot.name}</h1>
          <SpotMeta types={spot.types} />
        </header>
        {/* phones: favorite bar + big tiles; desktop: one compact row (tiles first, favorite last) */}
        <div className={L("flex flex-col gap-5 lg:flex-row-reverse lg:gap-2", "flex flex-col gap-2")}>
        {!hidden && <div className={L("lg:w-40 lg:shrink-0", "order-last")}><FavoriteButton spotId={spot.id} /></div>}

        <div className={L("grid auto-cols-fr grid-flow-col gap-2 lg:flex-1", "grid auto-cols-fr grid-flow-col gap-2")}>
          {actions.map((a) => {
            const cls = `press flex items-center justify-center font-semibold ${docked ? "min-h-11 gap-1.5 rounded-[10px] text-headline" : "min-h-16 flex-col gap-1 rounded-xl text-caption lg:min-h-11 lg:flex-row lg:gap-1.5 lg:rounded-[10px] lg:text-headline"} ${a.blue ? "bg-directions text-white" : a.danger ? "bg-bg text-danger" : "bg-bg text-link"}`;
            return a.href ? (
              <Link key={a.label} href={a.href} className={cls}>
                <Icon name={a.icon} className={docked ? "h-5 w-5" : "h-6 w-6"} />
                {a.label}
              </Link>
            ) : (
              <button key={a.label} className={cls} onClick={a.onClick}>
                <Icon name={a.icon} className={docked ? "h-5 w-5" : "h-6 w-6"} />
                {a.label}
              </button>
            );
          })}
        </div>
        </div>

        {msg && (
          <p role="alert" className="text-subhead text-danger">
            {msg}
          </p>
        )}
        {panel === "delete" && (
          <div className="card flex flex-col gap-3" role="alertdialog" aria-labelledby="del-title">
            <p id="del-title" className="text-headline">
              이 스팟을 삭제할까요?
            </p>
            <p className="text-subhead text-label-2">사진과 정보가 즉시 비공개되고 24시간 이내 완전히 삭제됩니다. 되돌릴 수 없습니다.</p>
            <button className="btn-danger" onClick={remove}>
              삭제
            </button>
            <button className="btn" onClick={() => setPanel("none")}>
              취소
            </button>
          </div>
        )}
        {panel === "report" && <ReportForm spotId={spot.id} onClose={() => setPanel("none")} />}

        <section aria-labelledby="about">
          <h2 id="about" className="group-header">
            설명
          </h2>
          <p className="card whitespace-pre-wrap break-words text-body">{linkify(spot.description)}</p>
        </section>

        {dirOpen && (
          <Directions
            spot={spot}
            me={me}
            locErr={locErr}
            onRetry={locate}
            mode={mode}
            setMode={setMode}
            routes={routes}
          />
        )}

      </article>
      <div className={L("mx-auto w-full max-w-2xl px-4 pt-5 lg:col-start-1 lg:row-start-2 lg:px-0 lg:pt-8", "pt-2")}>
        <section aria-labelledby="where">
          <h2 id="where" className="group-header">
            위치
          </h2>
          <div className="group-inset">
            {!docked && (
            <div className="relative">
              <KakaoMap
                center={spot}
                level={LEVEL.spot}
                onReady={onMap}
                className={`relative w-full ${dirOpen ? "h-72" : "h-44"}`}
                label={`${spot.name} 위치 지도`}
                fallbackHint="좌표는 아래에 표시됩니다."
              />
              <button
                onClick={toggleFollow}
                aria-pressed={follow}
                aria-label={follow ? "내 위치 고정 해제" : "내 위치 고정"}
                className={`press absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-[10px] shadow-float ${follow ? "bg-location text-white" : "glass text-link"}`}
              >
                <Icon name="location" className="h-4 w-4" />
              </button>
            </div>
            )}
            {address && (
              <div className="row">
                <span className="flex-1 text-body">{address} 부근</span>
                <CopyButton text={address} label="주소 복사" />
              </div>
            )}
            <div className="row">
              <span className="shrink-0 text-subhead text-label-2">좌표</span>
              <span className="ml-auto text-subhead tabular-nums">
                {spot.lat.toFixed(6)}, {spot.lng.toFixed(6)}
              </span>
              <CopyButton text={`${spot.lat.toFixed(6)}, ${spot.lng.toFixed(6)}`} label="좌표 복사" />
            </div>
            <div className="row">
              <span className="shrink-0 text-subhead text-label-2">내 위치에서</span>
              {me ? (
                <span className="ml-auto text-subhead tabular-nums">직선 {formatDistance(distanceM(me, spot))}</span>
              ) : (
                <button className="btn-plain ml-auto text-subhead" onClick={locate}>
                  <Icon name="location" className="h-4 w-4" />
                  내 위치 표시
                </button>
              )}
            </div>
          </div>
          <p className="group-footer">
            최종 수정 {new Date(spot.updated_at).toLocaleDateString("ko-KR")} · ‘공개됨’은 안전하거나 스케이트가 허용된 장소임을 뜻하지 않습니다.
          </p>
        </section>
      </div>
      </div>

      {panel === "login" && <LoginModal onDone={() => setPanel("report")} onCancel={() => setPanel("none")} />}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
    } catch {
      setState("fail");
    }
    setTimeout(() => setState("idle"), 2000);
  }
  return (
    <button className="icon-btn -my-2 -mr-2 text-label-2 hover:text-label" onClick={copy} aria-label={label}>
      <Icon name={state === "done" ? "check" : "copy"} className={`h-5 w-5 ${state === "done" ? "text-success" : ""}`} />
      <span className="sr-only" aria-live="polite">
        {state === "done" ? "복사됨" : state === "fail" ? "복사하지 못했습니다" : ""}
      </span>
    </button>
  );
}

function Directions({
  spot,
  me,
  locErr,
  onRetry,
  mode,
  setMode,
  routes,
}: {
  spot: Spot;
  me: GeoResult | null;
  locErr: string | null;
  onRetry: () => void;
  mode: TravelMode;
  setMode: (m: TravelMode) => void;
  routes: { car?: Route | null; walk?: Route | null };
}) {
  const route = routes.car;
  const meters = me ? roadMeters(me, spot, routes.walk?.distance) : null;
  const estimate = mode === "walk" || mode === "skate";
  /** Minutes for a mode, or null while unknown / not estimable. */
  const minutes = (m: TravelMode) => {
    if (!me || m === "bus") return null;
    if (m === "car") return route ? Math.max(1, Math.round(route.duration / 60)) : null;
    return routes.walk === undefined ? null : estimateMinutes(m, meters!);
  };
  const loading = !!me && (mode === "car" ? route === undefined : estimate && routes.walk === undefined);
  const sel = TRAVEL_MODES.find((t) => t.value === mode)!;
  const min = minutes(mode);
  const detail =
    mode === "bus"
      ? "버스·지하철 노선은 지도 앱에서 안내해요"
      : mode === "car"
        ? route
          ? `자동차 · 도로 ${formatDistance(route.distance)}`
          : me && route === null
            ? "경로를 불러오지 못했어요"
            : null
        : meters
          ? `${sel.label} · ${routes.walk ? "도보 경로" : "직선 기준"} ${formatDistance(meters)}`
          : null;
  const links = routeLinks(mode, spot, me);
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return (
    <section id="directions" aria-labelledby="dir" className="scroll-mt-16">
      <h2 id="dir" className="group-header">
        길찾기
      </h2>
      <div className="rounded-xl bg-bg p-5">
        {/* iOS segmented control: one quiet track, the selected mode lifts out as a white pill */}
        <div className="grid grid-cols-4 rounded-[12px] bg-fill p-1" role="radiogroup" aria-label="이동 수단">
          {TRAVEL_MODES.map((t) => {
            const on = mode === t.value;
            const m = minutes(t.value);
            return (
              <button
                key={t.value}
                role="radio"
                aria-checked={on}
                aria-label={`${t.label}${m ? ` ${t.kmh ? "약 " : ""}${formatMinutes(m)}` : ""}`}
                onClick={() => setMode(t.value)}
                className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[9px] transition-[background,box-shadow] duration-200 ${on ? "bg-bg shadow-[0_1px_4px_rgba(0,0,0,.14)]" : ""}`}
              >
                <span aria-hidden className="text-[20px] leading-none">{t.emoji}</span>
                <span aria-hidden className={`text-caption tabular-nums ${on ? "font-semibold text-label" : "text-label-2"}`}>
                  {m ? formatMinutes(m) : t.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* the answer: one dominant number, then what it's based on */}
        <div className="mt-6" aria-live="polite">
          {mode === "bus" ? (
            <p className="text-title2 font-bold">카카오맵에서 확인</p>
          ) : min ? (
            <p className="flex items-baseline gap-1.5">
              {estimate && <span className="text-title3 font-semibold text-label-2">약</span>}
              <span className="text-large-title font-bold tabular-nums tracking-tight">{formatMinutes(min)}</span>
            </p>
          ) : (
            <p className="text-title2 font-bold text-label-2">{loading || !me ? "계산 중…" : "–"}</p>
          )}
          {detail && <p className="mt-1 text-subhead text-label-2">{detail}</p>}
          {estimate && min && <p className="mt-1 text-footnote text-label-2">걷는 길 기준 추정 시간이에요. 보드도 도보 경로로 안내해요.</p>}
        </div>

        {locErr && (
          <div role="alert" className="mt-4 rounded-[10px] bg-bg-grouped p-3 text-subhead">
            <p>{locErr}</p>
            <p className="mt-0.5 text-footnote text-label-2">출발지는 지도 앱에서 현재 위치로 정해져요.</p>
            <button className="btn-plain mt-1 min-h-9 text-subhead" onClick={onRetry}>
              위치 다시 확인
            </button>
          </div>
        )}

        <button className="btn-primary mt-6 w-full" onClick={() => openRoute(links)}>
          <Icon name="route" className="h-5 w-5" />
          길안내 시작
        </button>
        {mobile && (
          <a href={links.naverApp} className="press mt-1 flex min-h-11 items-center justify-center gap-0.5 text-subhead text-label-2">
            네이버지도로 열기
            <Icon name="chevronRight" className="h-4 w-4" />
          </a>
        )}
      </div>
    </section>
  );
}

/** Raw source URLs in descriptions read as noise; show them as short host links. */
function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
    if (i % 2 === 0) return part;
    let host = part;
    try {
      host = new URL(part).hostname.replace(/^www\./, "");
    } catch {}
    return (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-link underline underline-offset-2">
        {host} 링크 ↗
      </a>
    );
  });
}
