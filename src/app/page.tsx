"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { FavoriteButton, useFavorites } from "@/components/Favorites";
import BottomSheet, { type Detent } from "@/components/BottomSheet";
import Icon from "@/components/Icon";
import KakaoMap from "@/components/KakaoMap";
import { Footer } from "@/components/Screen";
import SpotMeta, { type SpotPin } from "@/components/SpotMeta";
import { api, getLocation, useSession, type GeoResult } from "@/lib/client";
import { distanceM, formatDistance, KOREA_CENTER, LEVEL, mixColor, SPOT_TYPES, spotColor, spotEmoji, typeLabel, type SpotType } from "@/lib/spot-rules";

const EMOJI_FONT = `"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;

type Result = { mode: "spots"; total: number; spots: SpotPin[] };

type View = { lat: number; lng: number; level: number; selected?: string | null };

type Sort = "near" | "name" | "new";
const SORTS: { value: Sort; label: string }[] = [
  { value: "near", label: "가까운순" },
  { value: "name", label: "이름순" },
  { value: "new", label: "최신순" },
];

const VIEW_KEY = "skatespot:view";

/** Filter shared by map pins and the list. Empty kinds = every kind. */
const matches = (s: SpotPin, kinds: SpotType[], favOnly: boolean, favIds: Set<string>) =>
  (!kinds.length || kinds.some((k) => s.types.includes(k))) && (!favOnly || favIds.has(s.id));

function readView(params: URLSearchParams): View {
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (params.has("lat") && Number.isFinite(lat) && Number.isFinite(lng))
    return { lat, lng, level: Number(params.get("level")) || LEVEL.area, selected: params.get("selected") };
  try {
    const v = JSON.parse(sessionStorage.getItem(VIEW_KEY) ?? "null");
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.level)) return v;
  } catch {}
  return KOREA_CENTER;
}

function saveView(v: View) {
  try {
    sessionStorage.setItem(VIEW_KEY, JSON.stringify(v));
  } catch {}
}

function Home() {
  const params = useSearchParams();
  const [initial] = useState<View>(() => (typeof window === "undefined" ? KOREA_CENTER : readView(params)));
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [selected, setSelected] = useState<string | null>(initial.selected ?? null);
  const [group, setGroup] = useState<SpotPin[] | null>(null);
  const [me, setMe] = useState<GeoResult | null>(null);
  const [loc, setLoc] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const [mapReady, setMapReady] = useState(false);
  const [viewTick, setViewTick] = useState(0);
  const [detent, setDetent] = useState<Detent>("peek");
  const [kinds, setKinds] = useState<SpotType[]>([]); // empty = all kinds
  const [favOnly, setFavOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("near");
  const session = useSession();
  const favorites = useFavorites();
  const favoriteIds = new Set(favorites.spots.map((s) => s.id));
  const shown = (s: SpotPin) => matches(s, kinds, favOnly, favoriteIds);

  const mapRef = useRef<any>(null);
  const kakaoRef = useRef<any>(null);
  const reqId = useRef(0);
  const markers = useRef<any[]>([]);
  const meMarker = useRef<any>(null);
  const [follow, setFollow] = useState(false);
  const watchId = useRef<number | null>(null);
  const stopFollow = useCallback(() => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setFollow(false);
  }, []);
  useEffect(() => stopFollow, [stopFollow]);
  const selectedRef = useRef(selected);

  const load = useCallback(() => {
    const id = ++reqId.current;
    return api<Result>("/api/spots").then((r) => {
      if (id !== reqId.current) return;
      setResult(r);
      setStatus("ok");
    }).catch(() => {
      if (id === reqId.current) setStatus("error");
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const select = (id: string | null) => {
    setGroup(null);
    setSelected(id);
    if (id) setDetent("half");
  };

  /**
   * Center a point in the visible map. On md+ the docked panel (left 16 + 380 wide) covers the map,
   * so aim half its width to the right. Moving the map never replaces the loaded national spot set.
   */
  const moveTo = (lat: number, lng: number, level?: number, animate = false) => {
    const map = mapRef.current;
    const kakao = kakaoRef.current;
    if (!map) return;
    if (level) map.setLevel(level);
    const offset = window.matchMedia("(min-width: 768px)").matches ? 198 : 0;
    const proj = map.getProjection();
    const p = proj.containerPointFromCoords(new kakao.maps.LatLng(lat, lng));
    const c = proj.coordsFromContainerPoint(new kakao.maps.Point(p.x - offset, p.y));
    if (animate) map.panTo(c);
    else map.setCenter(c);
  };

  /** Select from a list: bring the spot into view (zoom in if far out, else pan). */
  const focus = (s: SpotPin) => {
    select(s.id);
    const map = mapRef.current;
    if (!map) return;
    if (map.getLevel() > LEVEL.spot) moveTo(s.lat, s.lng, LEVEL.spot);
    else moveTo(s.lat, s.lng, undefined, true);
  };

  /** Desktop list hover/focus lifts the matching pin or cluster without rebuilding markers. */
  const pinEls = useRef(new Map<string, { el: HTMLElement; o: any; z: number }>());
  const highlight = (id: string, on: boolean) => {
    const m = pinEls.current.get(id);
    if (!m) return;
    m.el.classList.toggle("is-hot", on);
    m.o.setZIndex(on ? 200 : m.z);
  };

  const onReady = useCallback(
    (map: any, kakao: any) => {
      mapRef.current = map;
      kakaoRef.current = kakao;
      // keep Kakao attribution visible: sheet/panel sit bottom-left (PRD §10)
      map.setCopyrightPosition(kakao.maps.CopyrightPosition.BOTTOMRIGHT, true);
      setMapReady(true);
      kakao.maps.event.addListener(map, "idle", () => {
        const c = map.getCenter();
        saveView({ lat: c.getLat(), lng: c.getLng(), level: map.getLevel(), selected: selectedRef.current });
        setViewTick((t) => t + 1);
      });
      kakao.maps.event.addListener(map, "dragstart", stopFollow); // dragging the map releases the location lock
      kakao.maps.event.addListener(map, "click", () => {
        setSelected(null);
        setGroup(null);
        setDetent("peek");
      });
    },
    [stopFollow],
  );

  useEffect(() => {
    selectedRef.current = selected;
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    saveView({ lat: c.getLat(), lng: c.getLng(), level: map.getLevel(), selected });
  }, [selected]);

  // Cluster the complete dataset locally; panning/selection never drops other pins.
  useEffect(() => {
    const map = mapRef.current;
    const kakao = kakaoRef.current;
    if (!map || !kakao || !result) return;
    const favIds = new Set(favorites.spots.map((f) => f.id));
    const visible = result.spots.filter((s) => matches(s, kinds, favOnly, favIds));
    markers.current.forEach((m) => m.setMap(null));
    markers.current = [];
    pinEls.current.clear();

    const add = (ids: string[], lat: number, lng: number, html: string, label: string, onClick: () => void, tail = false, saved = false) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "kmarker";
      el.setAttribute("aria-label", saved ? `${label} · 즐겨찾기` : label);
      el.innerHTML = `<div style="position:relative">${html}${saved ? '<span aria-hidden="true" style="position:absolute;right:-5px;top:-5px;width:20px;height:20px;border-radius:50%;background:#007aff;color:white;border:2px solid white;font:14px/18px system-ui">★</span>' : ""}</div>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onClick();
      });
      const o = new kakao.maps.CustomOverlay({
        map,
        position: new kakao.maps.LatLng(lat, lng),
        content: el,
        xAnchor: 0.5,
        yAnchor: tail ? 1 : 0.5,
        zIndex: tail ? 100 : 1,
        clickable: true,
      });
      markers.current.push(o);
      for (const id of ids) pinEls.current.set(id, { el, o, z: tail ? 100 : 1 });
    };
    // selected pin inverts fill and ring and gains a tail
    // Kind colors (DESIGN.md Pins); mixed clusters use the mix of their kinds' colors.
    const bubble = (n: number, c: string) =>
      `<div style="min-width:36px;height:36px;padding:0 8px;box-sizing:border-box;border-radius:18px;display:flex;align-items:center;justify-content:center;font:600 15px -apple-system,system-ui;background:${c};color:#fff;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25)">${n}</div>`;
    const pin = (emoji: string, on: boolean, c: string) =>
      on
        ? `<div style="display:flex;flex-direction:column;align-items:center"><div style="width:44px;height:44px;border-radius:50%;background:#fff;border:3px solid ${c};box-shadow:0 4px 14px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center"><span aria-hidden="true" style="font:24px/1 ${EMOJI_FONT}">${emoji}</span></div><div style="width:10px;height:10px;margin-top:-6px;transform:rotate(45deg);background:#fff;border-right:3px solid ${c};border-bottom:3px solid ${c}"></div></div>`
        : `<div style="width:30px;height:30px;border-radius:50%;background:${c};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center"><span aria-hidden="true" style="font:18px/1 ${EMOJI_FONT}">${emoji}</span></div>`;
    // Category emojis at every zoom; close zoom uses larger pins.
    const emojiPin = (emoji: string, on: boolean, c: string) =>
      on
        ? `<div style="display:flex;flex-direction:column;align-items:center"><div style="width:52px;height:52px;border-radius:50%;background:${c};border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font:28px/1 ${EMOJI_FONT}">${emoji}</div><div style="width:12px;height:12px;margin-top:-7px;transform:rotate(45deg);background:${c};border-right:3px solid #fff;border-bottom:3px solid #fff"></div></div>`
        : `<div style="width:40px;height:40px;border-radius:50%;background:#fff;border:3px solid ${c};box-shadow:0 2px 8px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font:21px/1 ${EMOJI_FONT}">${emoji}</div>`;
    const close = map.getLevel() <= LEVEL.area;

    const zoomIn = (lat: number, lng: number) => {
        map.setLevel(Math.max(1, map.getLevel() - 2), { anchor: new kakao.maps.LatLng(lat, lng), animate: { duration: 300 } });
    };

    // ponytail: all pins fit in memory at current scale; use viewport tiles if the dataset becomes large.
    // Grid in Kakao's fixed WCONGNAMUL coordinates (not screen pixels), so panning never shifts the
    // grid and regroups pins; only zoom does. Pixels-per-unit is measured from two fixed points.
    const proj = map.getProjection();
    const r0 = new kakao.maps.LatLng(37, 127);
    const r1 = new kakao.maps.LatLng(38, 128);
    const [p0, p1] = [r0, r1].map((r) => proj.containerPointFromCoords(r));
    const [w0, w1] = [r0, r1].map((r) => r.toCoords());
    const sx = Math.abs((p1.x - p0.x) / (w1.getX() - w0.getX()));
    const sy = Math.abs((p1.y - p0.y) / (w1.getY() - w0.getY()));
    const cells = new Map<string, SpotPin[]>();
    for (const s of visible) {
      const w = new kakao.maps.LatLng(s.lat, s.lng).toCoords();
      const cell = close ? 64 : 56; // emoji pins are bigger
      const key = s.id === selected ? s.id : `${Math.floor((w.getX() * sx) / cell)}:${Math.floor((w.getY() * sy) / cell)}`;
      cells.set(key, [...(cells.get(key) ?? []), s]);
    }
    for (const g of cells.values()) {
      if (g.length === 1) {
        const s = g[0];
        const on = s.id === selected;
        add([s.id], s.lat, s.lng, close ? emojiPin(spotEmoji(s.types), on, spotColor(s.types)) : pin(spotEmoji(s.types), on, spotColor(s.types)), s.name, () => select(s.id), on, favorites.spots.some((f) => f.id === s.id));
      } else {
        const lat = g.reduce((a, s) => a + s.lat, 0) / g.length;
        const lng = g.reduce((a, s) => a + s.lng, 0) / g.length;
        const samePlace = g.every((s) => distanceM(s, g[0]) < 5);
        add(g.map((s) => s.id), lat, lng, bubble(g.length, mixColor(g)), `스팟 ${g.length}개`, () => {
          if (samePlace || map.getLevel() <= 1) {
            setSelected(null);
            setGroup(g);
            setDetent("half");
          } else zoomIn(lat, lng);
        }, false, g.some((s) => favorites.spots.some((f) => f.id === s.id)));
      }
    }
  }, [result, selected, viewTick, mapReady, favorites.spots, kinds, favOnly]);

  // blue user-location dot (DESIGN.md --location)
  useEffect(() => {
    const map = mapRef.current;
    const kakao = kakaoRef.current;
    if (!map || !kakao || !me) return;
    const pos = new kakao.maps.LatLng(me.lat, me.lng);
    if (meMarker.current) meMarker.current.setPosition(pos);
    else
      meMarker.current = new kakao.maps.CustomOverlay({
        map,
        position: pos,
        zIndex: 50,
        content: `<div style="width:22px;height:22px;border-radius:50%;background:#007aff;border:3px solid #fff;box-shadow:0 0 0 8px rgba(0,122,255,.18),0 1px 4px rgba(0,0,0,.3)" aria-label="내 위치"></div>`,
      });
  }, [me, mapReady]);

  const zoom = (d: number) => {
    const map = mapRef.current;
    if (map) map.setLevel(Math.min(14, Math.max(1, map.getLevel() + d)), { animate: { duration: 250 } });
  };

  async function myLocation() {
    setLoc({ busy: true, error: null });
    try {
      const p = await getLocation();
      setMe(p);
      setLoc({ busy: false, error: null });
      const map = mapRef.current;
      if (map) moveTo(p.lat, p.lng, map.getLevel() > LEVEL.area ? LEVEL.area : undefined);
      return true;
    } catch (e) {
      setLoc({ busy: false, error: (e as Error).message });
      return false;
    }
  }

  /** Location lock: center on me and keep following until tapped again or the map is dragged. */
  async function toggleFollow() {
    if (follow) return stopFollow();
    if (!(await myLocation())) return;
    setFollow(true);
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const g = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        setMe(g);
        moveTo(g.lat, g.lng, undefined, true);
      },
      stopFollow,
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  }

  const spots = result?.spots ?? [];
  const sel = spots.find((s) => s.id === selected) ?? null;
  const filtered = kinds.length > 0 || favOnly;
  const listed = spots.filter(shown).sort(
    sort === "near" && me
      ? (a, b) => distanceM(me, a) - distanceM(me, b)
      : sort === "new"
        ? (a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")
        : (a, b) => a.name.localeCompare(b.name, "ko"),
  );
  const summary =
    status === "loading"
      ? "불러오는 중…"
      : status === "error"
        ? "불러오지 못했습니다"
        : filtered
          ? `스팟 ${listed.length}개 · 전체 ${result?.total ?? 0}개`
          : `전체 스팟 ${result?.total ?? 0}개`;
  const toggleKind = (k: SpotType) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));
  const chooseSort = (v: Sort) => {
    setSort(v);
    if (v === "near" && !me && !loc.busy) myLocation();
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#e9e6df]">
      <KakaoMap
        center={initial}
        level={initial.level}
        onReady={onReady}
        className="absolute inset-x-0 bottom-[148px] top-0 md:bottom-0"
        label="스팟 지도"
        fallbackClassName="justify-start pt-[calc(env(safe-area-inset-top)+80px)] md:pl-[400px]"
      />

      {/* floating chrome over the map */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 px-3 pt-[max(12px,env(safe-area-inset-top))] md:left-[396px]">
        <p className="glass pointer-events-auto rounded-full px-3 py-1.5 text-footnote font-bold tracking-tight shadow-float md:invisible">
          SKATE<span className="ml-0.5 rounded-full bg-label px-1.5 py-0.5 text-white">SPOT</span>
        </p>
        <div className="flex flex-col gap-2">
          <div className="glass pointer-events-auto flex flex-col overflow-hidden rounded-xl shadow-float">
            <button
              className={`icon-btn rounded-none ${follow ? "bg-location text-white" : "text-link"}`}
              onClick={toggleFollow}
              disabled={loc.busy}
              aria-pressed={follow}
              aria-label={follow ? "내 위치 고정 해제" : "내 위치 고정"}
            >
              <Icon name="location" className={`h-5 w-5 ${loc.busy ? "animate-pulse" : ""}`} />
            </button>
          </div>
          {/* phones pinch; desktop gets explicit zoom */}
          <div className="glass pointer-events-auto hidden flex-col overflow-hidden rounded-xl shadow-float md:flex">
            <button className="icon-btn rounded-none text-link hover:bg-fill" onClick={() => zoom(-1)} aria-label="확대">
              <Icon name="plus" className="h-5 w-5" />
            </button>
            <span className="mx-2 h-px bg-separator" aria-hidden />
            <button className="icon-btn rounded-none text-link hover:bg-fill" onClick={() => zoom(1)} aria-label="축소">
              <Icon name="minus" className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <BottomSheet
        detent={detent}
        onDetent={setDetent}
        label="스팟 목록"
        header={
          <>
          <div className="hidden items-center gap-3 px-4 pb-2 pt-4 md:flex">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-9 w-9" />
            <div className="leading-tight">
              <p className="text-headline font-bold tracking-tight">SKATESPOT</p>
              <p className="text-footnote text-label-2">한국 스트리트 스케이트 스팟 지도</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 pb-3 pt-1">
            <Link
              href="/search"
              className="press flex h-11 flex-1 items-center gap-2 rounded-[10px] bg-fill px-3 text-body text-label-2"
            >
              <Icon name="search" className="h-[18px] w-[18px]" />
              지역 검색
            </Link>
            <Link href="/add" className="icon-btn bg-tint text-white" aria-label="스팟 등록">
              <Icon name="plus" className="h-6 w-6" />
            </Link>
            <Link
              href="/account"
              className="icon-btn bg-fill text-label-2"
              aria-label={session ? "내 계정" : "로그인"}
            >
              {session?.user.email ? (
                <span className="text-headline font-semibold uppercase text-label">{session.user.email[0]}</span>
              ) : (
                <Icon name="person" className="h-6 w-6" />
              )}
            </Link>
          </div>
          </>
        }
      >
        {sel ? (
          <PlaceCard spot={sel} me={me} onClose={() => select(null)} />
        ) : group ? (
          <GroupList spots={group} onClose={() => setGroup(null)} onPick={(id) => focus(group.find((g) => g.id === id)!)} />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between" aria-live="polite">
              <h1 className="text-title3 font-semibold">{summary}</h1>
              {status === "error" && (
                <button className="btn-plain" onClick={() => { setStatus("loading"); load(); }}>
                  다시 시도
                </button>
              )}
            </div>

            {status === "ok" && (result?.total ?? 0) > 0 && (
              <div className="-mx-4 flex flex-col gap-2">
                <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:flex-wrap md:overflow-visible" role="group" aria-label="스팟 종류 필터">
                  <FilterChip on={!kinds.length} onClick={() => setKinds([])}>전체</FilterChip>
                  {SPOT_TYPES.map((t) => (
                    <FilterChip key={t.value} on={kinds.includes(t.value)} onClick={() => toggleKind(t.value)}>
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white" style={{ background: t.color }} />
                      {t.label}
                    </FilterChip>
                  ))}
                  <FilterChip on={favOnly} onClick={() => setFavOnly((f) => !f)}>
                    <Icon name={favOnly ? "starFilled" : "star"} className="h-4 w-4" />
                    즐겨찾기
                  </FilterChip>
                </div>
                <div className="mx-4 flex rounded-[9px] bg-fill p-0.5" role="radiogroup" aria-label="정렬">
                  {SORTS.map((o) => (
                    <button
                      key={o.value}
                      role="radio"
                      aria-checked={sort === o.value}
                      onClick={() => chooseSort(o.value)}
                      className={`press min-h-9 flex-1 rounded-[7px] text-footnote font-semibold ${sort === o.value ? "bg-bg shadow-[0_1px_4px_rgba(0,0,0,.12)]" : "text-label-2"}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {status === "ok" && filtered && listed.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="text-subhead text-label-2">조건에 맞는 스팟이 없습니다.</p>
                <button className="btn" onClick={() => { setKinds([]); setFavOnly(false); }}>
                  필터 초기화
                </button>
              </div>
            )}

            {loc.error && (
              <div role="alert" className="card flex flex-col gap-2 bg-bg-grouped text-subhead">
                <p>{loc.error}</p>
                <div className="flex gap-4">
                  <button className="btn-plain" onClick={myLocation}>
                    다시 시도
                  </button>
                  <Link className="btn-plain" href="/search">
                    지역 검색
                  </Link>
                </div>
              </div>
            )}

            {status === "ok" && result?.mode === "spots" && result.total === 0 && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="text-subhead text-label-2">등록된 스팟이 없습니다.</p>
                <div className="flex gap-2">
                  <Link className="btn" href="/search">
                    다른 지역 찾기
                  </Link>
                  <Link className="btn-primary min-h-11" href="/add">
                    스팟 등록
                  </Link>
                </div>
              </div>
            )}

            {listed.length > 0 && (
              <ul className="group-inset bg-bg-grouped">
                {listed.map((s) => (
                  <li key={s.id}>
                    <button
                      className="row press w-full text-left hover:bg-black/[.03]"
                      onClick={() => {
                        focus(s);
                      }}
                      onMouseEnter={() => highlight(s.id, true)}
                      onMouseLeave={() => highlight(s.id, false)}
                      onFocus={() => highlight(s.id, true)}
                      onBlur={() => highlight(s.id, false)}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg text-[22px] leading-none" style={{ boxShadow: `inset 0 0 0 2px ${spotColor(s.types)}` }} aria-hidden>
                        {spotEmoji(s.types)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-headline font-semibold">{s.name}</span>
                        <span className="block truncate text-subhead text-label-2">
                          {s.types.map(typeLabel).join(" · ")}
                          {me && ` · ${formatDistance(distanceM(me, s))}`}
                        </span>
                      </span>
                      {favoriteIds.has(s.id) && <span aria-label="즐겨찾기" className="text-link"><Icon name="starFilled" /></span>}
                      <Icon name="chevronRight" className="h-4 w-4 text-separator" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Footer />
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-pressed={on}
      onClick={onClick}
      className={`press inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-footnote font-semibold ${on ? "bg-tint text-white" : "bg-fill text-label"}`}
    >
      {children}
    </button>
  );
}

function PlaceCard({ spot, me, onClose }: { spot: SpotPin; me: GeoResult | null; onClose: () => void }) {
  return (
    <article className="flex flex-col gap-3" aria-label={`${spot.name} 정보`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-title2 font-bold">{spot.name}</h2>
          <p className="text-subhead text-label-2">
            스케이트 스팟{me && ` · 직선 ${formatDistance(distanceM(me, spot))}`}
          </p>
        </div>
        <button className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="닫기">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-fill text-label-2">
            <Icon name="xmark" className="h-4 w-4" />
          </span>
        </button>
      </div>
      <Link href={`/spot/${spot.id}`} className="btn-primary w-full">
        상세 보기
      </Link>
      <FavoriteButton spotId={spot.id} />
      <SpotMeta types={spot.types} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/photos/${spot.id}`} alt={`${spot.name} 사진`} className="aspect-[4/3] w-full rounded-xl bg-fill object-cover md:order-first" />
    </article>
  );
}

function GroupList({ spots, onClose, onPick }: { spots: SpotPin[]; onClose: () => void; onPick: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-title3 font-semibold">이 위치의 스팟 {spots.length}개</h2>
        <button className="icon-btn -mr-2" onClick={onClose} aria-label="닫기">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-fill text-label-2">
            <Icon name="xmark" className="h-4 w-4" />
          </span>
        </button>
      </div>
      <ul className="group-inset bg-bg-grouped">
        {spots.map((s) => (
          <li key={s.id}>
            <button className="row press w-full text-left" onClick={() => onPick(s.id)}>
              <span className="flex-1 truncate text-headline font-semibold">{s.name}</span>
              <Icon name="chevronRight" className="h-4 w-4 text-separator" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
