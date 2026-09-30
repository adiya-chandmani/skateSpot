"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Icon from "@/components/Icon";
import KakaoMap from "@/components/KakaoMap";
import { getLocation } from "@/lib/client";
import { coordError, KOREA_CENTER, LEVEL, type Coord } from "@/lib/spot-rules";

export type LocSource = "exif" | "browser" | "manual";

type Props = {
  value: Coord | null;
  source: LocSource | null;
  confirmed: boolean;
  exif: Coord | null;
  error?: string;
  onChange: (c: Coord, source: LocSource) => void;
  onConfirm: () => void;
};

const SOURCE_TEXT: Record<LocSource, string> = {
  exif: "사진에 기록된 위치입니다. 스팟의 실제 위치와 다를 수 있으니 확인해 주세요.",
  browser: "이 기기의 현재 위치입니다. 과거 사진의 장소와 다를 수 있습니다.",
  manual: "지도에서 직접 선택한 위치입니다.",
};

/** Location suggestion + explicit confirmation (PRD §6.2). Map click, marker drag, or typed coordinates. */
export default function LocationPicker({ value, source, confirmed, exif, error, onChange, onConfirm }: Props) {
  const id = useId();
  const mapRef = useRef<any>(null);
  const kakaoRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const changes = useRef(0); // bumps on every user change; late async answers compare against it
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [geo, setGeo] = useState<{ busy: boolean; error: string | null; pending: (Coord & { accuracy: number }) | null }>({
    busy: false,
    error: null,
    pending: null,
  });
  // typed text wins only while `value` is the coordinate it produced; otherwise show value
  const [text, setText] = useState<{ lat: string; lng: string; for: Coord | null }>({ lat: "", lng: "", for: null });
  const typedFor = text.for === value;
  const latText = typedFor ? text.lat : (value?.lat.toFixed(6) ?? "");
  const lngText = typedFor ? text.lng : (value?.lng.toFixed(6) ?? "");

  const set = useCallback(
    (c: Coord, s: LocSource, acc: number | null = null) => {
      changes.current++;
      setAccuracy(acc);
      onChange(c, s);
    },
    [onChange],
  );

  // draggable black pin (DESIGN.md: monochrome); created on first value
  const placeMarker = useCallback(
    (c: Coord) => {
      const kakao = kakaoRef.current;
      const map = mapRef.current;
      if (!kakao || !map) return;
      const pos = new kakao.maps.LatLng(c.lat, c.lng);
      if (markerRef.current) {
        markerRef.current.setPosition(pos);
      } else {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46"><path d="M18 45C18 45 3 28 3 17a15 15 0 0 1 30 0c0 11-15 28-15 28z" fill="#111" stroke="#fff" stroke-width="3"/><circle cx="18" cy="17" r="5.5" fill="#fff"/></svg>`;
        const image = new kakao.maps.MarkerImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, new kakao.maps.Size(36, 46), {
          offset: new kakao.maps.Point(18, 45),
        });
        markerRef.current = new kakao.maps.Marker({ map, position: pos, draggable: true, image, title: "선택한 위치" });
        kakao.maps.event.addListener(markerRef.current, "dragend", () => {
          const p = markerRef.current.getPosition();
          set({ lat: p.getLat(), lng: p.getLng() }, "manual");
        });
      }
      if (!map.getBounds().contain(pos)) map.setCenter(pos);
    },
    [set],
  );

  // keep marker in sync with value
  useEffect(() => {
    if (value) placeMarker(value);
  }, [value, placeMarker]);

  const onReady = useCallback(
    (map: any, kakao: any) => {
      mapRef.current = map;
      kakaoRef.current = kakao;
      kakao.maps.event.addListener(map, "click", (e: any) => set({ lat: e.latLng.getLat(), lng: e.latLng.getLng() }, "manual"));
      if (value) {
        map.setLevel(LEVEL.pick);
        placeMarker(value);
      }
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function useCurrent() {
    const before = changes.current;
    setGeo({ busy: true, error: null, pending: null });
    try {
      const p = await getLocation();
      // user already moved the pin while waiting → offer, don't overwrite (PRD §6.2, A05)
      if (changes.current !== before && value) setGeo({ busy: false, error: null, pending: p });
      else {
        setGeo({ busy: false, error: null, pending: null });
        set(p, "browser", p.accuracy);
        mapRef.current?.setLevel(LEVEL.pick);
      }
    } catch (e) {
      setGeo({ busy: false, error: (e as Error).message, pending: null });
    }
  }

  function pickOnMap() {
    const map = mapRef.current;
    if (map) {
      const c = map.getCenter();
      set({ lat: c.getLat(), lng: c.getLng() }, "manual");
    } else if (!value) set({ lat: KOREA_CENTER.lat, lng: KOREA_CENTER.lng }, "manual");
    document.getElementById(`${id}-map`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function typed(latS: string, lngS: string) {
    const lat = Number(latS);
    const lng = Number(lngS);
    if (latS.trim() !== "" && lngS.trim() !== "" && Number.isFinite(lat) && Number.isFinite(lng)) {
      const c = { lat, lng };
      setText({ lat: latS, lng: lngS, for: c });
      changes.current++;
      setAccuracy(null);
      onChange(c, "manual");
    } else setText({ lat: latS, lng: lngS, for: value });
  }

  const liveErr = value ? coordError(value) : null;
  const chip = "press inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-bg px-4 text-subhead font-semibold text-link disabled:opacity-40";

  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {exif && (
          <button type="button" className={chip} onClick={() => set(exif, "exif")}>
            <Icon name="camera" className="h-4 w-4" />
            사진 위치
          </button>
        )}
        <button type="button" className={chip} onClick={useCurrent} disabled={geo.busy}>
          <Icon name="location" className="h-4 w-4" />
          {geo.busy ? "확인 중…" : "현재 위치"}
        </button>
        <button type="button" className={chip} onClick={pickOnMap}>
          <Icon name="map" className="h-4 w-4" />
          지도에서 선택
        </button>
      </div>
      {geo.error && (
        <p role="alert" className="field-error">
          {geo.error} 지도에서 직접 선택할 수 있습니다.
        </p>
      )}
      {geo.pending && (
        <div className="card flex flex-col gap-2 text-subhead" role="status">
          <span>현재 위치를 확인했습니다. 선택한 위치 대신 적용할까요?</span>
          <div className="flex gap-4">
            <button
              type="button"
              className="btn-plain font-semibold"
              onClick={() => {
                set(geo.pending!, "browser", geo.pending!.accuracy);
                setGeo((g) => ({ ...g, pending: null }));
              }}
            >
              적용
            </button>
            <button type="button" className="btn-plain" onClick={() => setGeo((g) => ({ ...g, pending: null }))}>
              무시
            </button>
          </div>
        </div>
      )}

      <div className="group-inset" id={`${id}-map`}>
        <KakaoMap
          center={value ?? KOREA_CENTER}
          level={value ? LEVEL.pick : KOREA_CENTER.level}
          onReady={onReady}
          className="relative h-56 w-full"
          label="위치 선택 지도. 지도를 눌러 위치를 선택하거나 아래에 좌표를 입력하세요."
          fallbackHint="아래에 위도·경도를 직접 입력할 수 있습니다."
        />
        <div className="row">
          <label htmlFor={`${id}-lat`} className="w-12 shrink-0 text-body">
            위도
          </label>
          <input
            id={`${id}-lat`}
            className="min-w-0 flex-1 bg-transparent text-right text-body tabular-nums outline-none"
            inputMode="decimal"
            placeholder="37.5665"
            value={latText}
            onChange={(e) => typed(e.target.value, lngText)}
            aria-invalid={!!error}
          />
        </div>
        <div className="row">
          <label htmlFor={`${id}-lng`} className="w-12 shrink-0 text-body">
            경도
          </label>
          <input
            id={`${id}-lng`}
            className="min-w-0 flex-1 bg-transparent text-right text-body tabular-nums outline-none"
            inputMode="decimal"
            placeholder="126.9780"
            value={lngText}
            onChange={(e) => typed(latText, e.target.value)}
            aria-invalid={!!error}
          />
        </div>
      </div>

      <div className="px-4 text-footnote text-label-2">
        {source && value && <p>{SOURCE_TEXT[source]}</p>}
        {accuracy != null && (
          <p className={accuracy > 100 ? "font-semibold text-danger" : ""}>
            정확도 약 ±{Math.round(accuracy)}m
            {accuracy > 100 && " — 오차가 큽니다. 지도를 확대해 핀 위치를 직접 조정해 주세요."}
          </p>
        )}
      </div>
      {liveErr && <p className="field-error">{liveErr}</p>}

      {confirmed ? (
        <p className="flex items-center gap-2 px-1 text-subhead font-semibold text-success" role="status">
          <Icon name="check" className="h-5 w-5" />
          위치 확정됨 · 좌표를 바꾸면 다시 확정해야 합니다
        </p>
      ) : (
        <button type="button" className="btn-primary w-full" onClick={onConfirm} disabled={!value || !!liveErr}>
          이 위치로 확정
        </button>
      )}
      {error && !liveErr && (
        <p id={`${id}-err`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
