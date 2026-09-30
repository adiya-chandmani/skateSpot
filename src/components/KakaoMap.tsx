"use client";
import { useEffect, useRef, useState } from "react";

// ponytail: Kakao Maps SDK has no official TS types; typed as any at this one boundary.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    kakao?: any;
  }
}

let loader: Promise<any> | null = null;

/** Loads Kakao Maps JS SDK once (autoload=false → kakao.maps.load). */
export function loadKakaoMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject();
  if (window.kakao?.maps?.Map) return Promise.resolve(window.kakao);
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  if (!key) return Promise.reject(new Error("지도 키가 설정되지 않았습니다."));
  loader ??= new Promise((resolve, reject) => {
    const fail = () => {
      loader = null;
      reject(new Error("지도를 불러오지 못했습니다."));
    };
    // wrong key / unregistered domain can leave the SDK silent; don't block the list forever
    const timer = setTimeout(fail, 10000);
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    s.async = true;
    s.onload = () =>
      window.kakao?.maps
        ? window.kakao.maps.load(() => {
            clearTimeout(timer);
            resolve(window.kakao);
          })
        : fail();
    s.onerror = () => {
      clearTimeout(timer);
      fail();
    };
    document.head.appendChild(s);
  });
  return loader;
}

type Props = {
  center: { lat: number; lng: number };
  /** Kakao zoom level: 1 (closest) … 14 (farthest) */
  level: number;
  onReady: (map: any, kakao: any) => void;
  onError?: () => void;
  /** Must give the box a position and size, e.g. "relative h-56 w-full" or "absolute inset-0". */
  className?: string;
  label: string;
  fallbackHint?: string;
  fallbackClassName?: string;
};

/** Renders a Kakao map. On failure shows a notice; callers keep list/search usable (PRD §4). */
export default function KakaoMap({
  center,
  level,
  onReady,
  onError,
  className,
  label,
  fallbackHint = "목록과 검색은 계속 이용할 수 있습니다.",
  fallbackClassName = "",
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const init = useRef({ center, level, onReady, onError });

  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | undefined;
    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !el.current) return;
        const { center, level, onReady } = init.current;
        el.current.innerHTML = "";
        const map = new kakao.maps.Map(el.current, {
          center: new kakao.maps.LatLng(center.lat, center.lng),
          level,
        });
        // Kakao needs relayout when its container changes size (rotation, desktop panel); keep the center
        ro = new ResizeObserver(() => {
          const c = map.getCenter();
          map.relayout();
          map.setCenter(c);
        });
        ro.observe(el.current);
        setError(null);
        onReady(map, kakao);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e?.message ?? "지도를 불러오지 못했습니다.");
        init.current.onError?.();
      });
    return () => {
      cancelled = true;
      ro?.disconnect();
    };
  }, [attempt]);

  return (
    <div className={className ?? "relative h-64 w-full"}>
      <div ref={el} className="absolute inset-0" role="region" aria-label={label} />
      {error && (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#e9e6df] p-6 text-center text-subhead text-label-2 ${fallbackClassName}`}
        >
          <p>
            {error} {fallbackHint}
          </p>
          <button className="btn bg-bg" onClick={() => setAttempt((a) => a + 1)}>
            지도 다시 불러오기
          </button>
        </div>
      )}
    </div>
  );
}
