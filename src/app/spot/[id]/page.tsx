"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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

function BackButton({ onPhoto }: { onPhoto: boolean }) {
  const router = useRouter();
  return (
    <button
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      aria-label="뒤로"
      className={`icon-btn press fixed left-3 top-[max(12px,env(safe-area-inset-top))] z-30 shadow-float ${onPhoto ? "glass" : "bg-bg"}`}
    >
      <Icon name="chevronLeft" className="h-6 w-6 text-label" />
    </button>
  );
}

export default function SpotPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const session = useSession();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "gone" | "error">("loading");
  const [address, setAddress] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "report" | "delete" | "login">("none");
  const [msg, setMsg] = useState<string | null>(null);
  const [me, setMe] = useState<GeoResult | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [dirOpen, setDirOpen] = useState(false);
  const [mode, setMode] = useState<TravelMode>("skate");
  const [route, setRoute] = useState<Route | null | undefined>(undefined); // undefined = not fetched yet
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<{ map: any; kakao: any; overlays: any[] } | null>(null);

  const locate = useCallback(() => {
    setLocErr(null);
    return getLocation().then(setMe, (e: Error) => setLocErr(e.message));
  }, []);

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

  // Car route (the only routable mode); walk/skate estimates reuse its road distance.
  useEffect(() => {
    if (!dirOpen || !me || !spot) return;
    let live = true;
    api<{ route: Route | null }>(`/api/directions?from=${me.lat},${me.lng}&to=${spot.lat},${spot.lng}`)
      .then((r) => live && setRoute(r.route))
      .catch(() => live && setRoute(null));
    return () => {
      live = false;
    };
  }, [dirOpen, me, spot]);

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
      setMapReady(true);
    },
    [spot],
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
          // walk/skate follow different paths than cars; dashed says "approximate"
          strokeStyle: mode === "car" ? "solid" : "shortdash",
        }),
      );
    // fit both points (and the route) unless they're far apart and we're just browsing
    if (!dirOpen && distanceM(me, spot) > 30000) return;
    const b = new kakao.maps.LatLngBounds();
    b.extend(LL(spot.lat, spot.lng));
    b.extend(LL(me.lat, me.lng));
    if (showRoute) route.path.forEach(([lat, lng]) => b.extend(LL(lat, lng)));
    map.setBounds(b, 40, 40, 40, 40);
  }, [me, route, mode, dirOpen, spot, mapReady]);

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
      <div className="min-h-dvh bg-bg-grouped" aria-busy>
        <BackButton onPhoto={false} />
        <div className="lg:mx-auto lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10 lg:px-20 lg:pt-6">
          <div className="aspect-[4/3] w-full animate-pulse bg-fill md:mx-auto md:mt-4 md:max-w-2xl md:rounded-2xl lg:mt-0" />
          <div className="mx-auto w-full max-w-2xl space-y-3 p-4 lg:p-0">
            <div className="h-8 w-2/3 animate-pulse rounded-lg bg-fill" />
            <div className="h-5 w-1/2 animate-pulse rounded-lg bg-fill" />
          </div>
        </div>
      </div>
    );
  if (state === "error")
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg-grouped p-8 text-center">
        <BackButton onPhoto={false} />
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
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg-grouped p-8 text-center">
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
  const actions: { icon: IconName; label: string; onClick?: () => void; href?: string; danger?: boolean }[] = [
    { icon: "route", label: "길찾기", onClick: startDirections },
    ...(spot.isOwner
      ? [
          ...(!hidden ? [{ icon: "pencil" as const, label: "수정", href: `/spot/${spot.id}/edit` }] : []),
          { icon: "trash" as const, label: "삭제", onClick: () => setPanel("delete"), danger: true },
        ]
      : [{ icon: "flag" as const, label: "신고", onClick: () => setPanel(session ? "report" : "login") }]),
  ];

  return (
    <div className="min-h-dvh bg-bg-grouped pb-[max(24px,env(safe-area-inset-bottom))]">
      <BackButton onPhoto={!hidden} />
      {/* lg+: photo column stays in view on the left, details scroll on the right */}
      <div className="lg:mx-auto lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-10 lg:px-20 lg:pt-6">
      {!hidden ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/photos/${spot.id}`}
          alt={`${spot.name} 사진`}
          fetchPriority="high"
          className="aspect-[4/3] max-h-[60dvh] w-full bg-fill object-cover md:mx-auto md:mt-4 md:max-w-2xl md:rounded-2xl lg:sticky lg:top-6 lg:mt-0 lg:max-h-[calc(100dvh-48px)] lg:max-w-none"
        />
      ) : (
        <div className="h-[calc(64px+env(safe-area-inset-top))]" />
      )}

      <article className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-4 lg:px-0 lg:pt-0">
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
          <h1 className="text-large-title font-bold tracking-tight">{spot.name}</h1>
          <SpotMeta types={spot.types} />
        </header>
        {!hidden && <FavoriteButton spotId={spot.id} />}

        <div className="grid auto-cols-fr grid-flow-col gap-2">
          {actions.map((a) => {
            const cls = `press flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-bg text-caption font-semibold ${a.danger ? "text-danger" : "text-link"}`;
            return a.href ? (
              <Link key={a.label} href={a.href} className={cls}>
                <Icon name={a.icon} className="h-6 w-6" />
                {a.label}
              </Link>
            ) : (
              <button key={a.label} className={cls} onClick={a.onClick}>
                <Icon name={a.icon} className="h-6 w-6" />
                {a.label}
              </button>
            );
          })}
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
          <p className="card whitespace-pre-wrap break-words text-body">{spot.description}</p>
        </section>

        {dirOpen && (
          <Directions
            spot={spot}
            me={me}
            locErr={locErr}
            onRetry={locate}
            mode={mode}
            setMode={setMode}
            route={route}
          />
        )}

        <section aria-labelledby="where">
          <h2 id="where" className="group-header">
            위치
          </h2>
          <div className="group-inset">
            <KakaoMap
              center={spot}
              level={LEVEL.spot}
              onReady={onMap}
              className={`relative w-full ${dirOpen ? "h-72" : "h-44"}`}
              label={`${spot.name} 위치 지도`}
              fallbackHint="좌표는 아래에 표시됩니다."
            />
            {address && (
              <div className="row">
                <span className="flex-1 text-body">{address} 부근</span>
                <CopyButton text={address} label="주소 복사" />
              </div>
            )}
            <div className="row">
              <span className="text-subhead text-label-2">좌표</span>
              <span className="ml-auto text-subhead tabular-nums">
                {spot.lat.toFixed(6)}, {spot.lng.toFixed(6)}
              </span>
              <CopyButton text={`${spot.lat.toFixed(6)}, ${spot.lng.toFixed(6)}`} label="좌표 복사" />
            </div>
            <div className="row">
              <span className="text-subhead text-label-2">내 위치에서</span>
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
      </article>
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
  route,
}: {
  spot: Spot;
  me: GeoResult | null;
  locErr: string | null;
  onRetry: () => void;
  mode: TravelMode;
  setMode: (m: TravelMode) => void;
  route: Route | null | undefined;
}) {
  const meters = me ? roadMeters(me, spot, route?.distance) : null;
  const timeFor = (m: TravelMode) => {
    if (m === "bus") return "카카오맵";
    if (!me) return "–";
    if (m === "car") return route === undefined ? "…" : route ? formatMinutes(Math.max(1, Math.round(route.duration / 60))) : "–";
    return `약 ${formatMinutes(estimateMinutes(m, meters!)!)}`;
  };
  const note =
    mode === "bus"
      ? "버스·지하철 노선과 시간은 카카오맵에서 확인하세요."
      : mode === "car"
        ? route
          ? `도로 ${formatDistance(route.distance)} · 카카오 길찾기 기준`
          : me && route === null
            ? "경로를 불러오지 못했습니다. 카카오맵에서 확인하세요."
            : null
        : meters
          ? `도로 약 ${formatDistance(meters)} 기준 추정${mode === "skate" ? " · 보드는 도보 경로로 안내" : ""}. 실제 길과 다를 수 있습니다.`
          : null;
  const links = routeLinks(mode, spot, me);
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return (
    <section id="directions" aria-labelledby="dir" className="scroll-mt-16">
      <h2 id="dir" className="group-header">
        길찾기
      </h2>
      <div className="card flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="이동 수단">
          {TRAVEL_MODES.map((t) => (
            <button
              key={t.value}
              role="radio"
              aria-checked={mode === t.value}
              onClick={() => setMode(t.value)}
              className={`press flex min-h-[68px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 ${mode === t.value ? "bg-tint text-white" : "bg-fill text-label"}`}
            >
              <span aria-hidden className="text-[22px] leading-none">{t.emoji}</span>
              <span className="text-caption font-semibold">{t.label}</span>
              <span className={`text-caption tabular-nums ${mode === t.value ? "text-white/80" : "text-label-2"}`}>{timeFor(t.value)}</span>
            </button>
          ))}
        </div>
        {locErr ? (
          <div role="alert" className="flex flex-col gap-1 text-subhead">
            <p>{locErr}</p>
            <p className="text-label-2">출발지는 지도 앱에서 현재 위치로 정해집니다.</p>
            <button className="btn-plain self-start" onClick={onRetry}>
              위치 다시 확인
            </button>
          </div>
        ) : (
          !me && <p className="text-subhead text-label-2">현재 위치를 확인하는 중…</p>
        )}
        {note && <p className="text-footnote text-label-2">{note}</p>}
        <button className="btn-primary w-full" onClick={() => openRoute(links)}>
          <Icon name="route" className="h-5 w-5" />
          길안내 시작
        </button>
        {mobile && (
          <a href={links.naverApp} className="btn-plain self-center text-subhead">
            네이버지도로 열기
          </a>
        )}
      </div>
    </section>
  );
}
