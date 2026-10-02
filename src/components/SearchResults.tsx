"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import type { SpotPin } from "@/components/SpotMeta";
import { api } from "@/lib/client";
import { clearPlaces, forgetPlace, useRecentPlaces, type Place } from "@/lib/search-history";
import { distanceM, formatDistance, spotColor, spotEmoji, typeLabel } from "@/lib/spot-rules";

type State<T> = { status: "idle" | "loading" | "ok" | "error"; data: T; error?: string };

/** Debounced search with stale-response protection (PRD §5). */
function useSearch<T>(q: string, url: (q: string) => string, empty: T, minLen: number): State<T> {
  const [res, setRes] = useState<(State<T> & { term: string }) | null>(null);
  const req = useRef(0);
  const term = q.trim();
  const active = [...term].length >= minLen;
  useEffect(() => {
    const id = ++req.current;
    if (!active) return; // empty query: no external request (PRD §5)
    const t = setTimeout(async () => {
      try {
        const r = await api<{ results: T }>(url(term));
        if (id === req.current) setRes({ term, status: "ok", data: r.results });
      } catch (e) {
        if (id === req.current) setRes({ term, status: "error", data: empty, error: (e as Error).message });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [term, active]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!active) return { status: "idle", data: empty };
  if (res?.term !== term) return { status: "loading", data: res?.data ?? empty };
  return res;
}

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, "");
const NEAR_M = 3000;

/**
 * Search inside the map panel: spots by name (local, instant), places from Kakao, and the
 * spots near the top place — so "강남역" also lists the parks and spots around it.
 */
export default function SearchResults({
  q,
  spots,
  onPlace,
  onSpot,
}: {
  q: string;
  spots: SpotPin[];
  onPlace: (p: Place) => void;
  onSpot: (s: SpotPin) => void;
}) {
  const region = useSearch<Place[]>(q, (t) => `/api/search/local?q=${encodeURIComponent(t)}`, [], 2);
  const recent = useRecentPlaces();
  const term = norm(q);

  if (!term)
    return (
      <section aria-labelledby="recent" className="flex flex-col">
        <div className="flex items-baseline justify-between">
          <h2 id="recent" className="group-header">
            최근 검색
          </h2>
          {recent.length > 0 && (
            <button className="btn-plain min-h-0 px-4 pb-2 text-footnote text-label-2" onClick={clearPlaces}>
              기록 지우기
            </button>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="group-inset bg-bg-grouped px-4 py-3.5 text-subhead text-label-2">최근 검색 기록이 없습니다.</p>
        ) : (
          <ul className="group-inset bg-bg-grouped">
            {recent.map((r) => (
              <li key={`${r.title}-${r.lat}-${r.lng}`}>
                <div className="row py-3">
                  <button className="press flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onPlace(r)}>
                    <PlaceIcon name="clock" />
                    <Lines title={r.title} sub={r.address} />
                  </button>
                  <button className="icon-btn -mr-2 text-label-2" onClick={() => forgetPlace(r)} aria-label={`${r.title} 기록 삭제`}>
                    <Icon name="xmark" className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="group-footer">스팟 이름이나 역·동네·장소를 검색하세요. 기록은 이 기기에만 저장됩니다.</p>
      </section>
    );

  const named = spots.filter((s) => norm(s.name).includes(term)).slice(0, 8);
  const top = region.data[0];
  const nearby = top
    ? spots
        .filter((s) => !named.includes(s) && distanceM(top, s) <= NEAR_M)
        .sort((a, b) => distanceM(top, a) - distanceM(top, b))
        .slice(0, 8)
    : [];
  const regionNote =
    region.status === "loading"
      ? "검색 중…"
      : region.status === "error"
        ? region.error
        : region.status === "idle"
          ? "지역은 두 글자 이상 입력해 주세요."
          : region.data.length === 0
            ? "일치하는 지역이 없습니다."
            : null;

  return (
    <div className="flex flex-col gap-6" aria-live="polite">
      {named.length > 0 && <SpotList title="스팟" spots={named} onSpot={onSpot} />}

      <section aria-labelledby="region-results">
        <h2 id="region-results" className="group-header">
          지역
        </h2>
        {regionNote ? (
          <p role={region.status === "error" ? "alert" : undefined} className={`group-inset bg-bg-grouped px-4 py-3.5 text-subhead ${region.status === "error" ? "text-danger" : "text-label-2"}`}>
            {regionNote}
          </p>
        ) : (
          <ul className="group-inset bg-bg-grouped">
            {region.data.slice(0, 5).map((r, i) => (
              <li key={i}>
                <button className="row press w-full py-3 text-left" onClick={() => onPlace(r)}>
                  <PlaceIcon name="map" />
                  <Lines title={r.title} sub={r.address} />
                  <Icon name="chevronRight" className="h-4 w-4 text-separator" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {nearby.length > 0 && <SpotList title={`${top.title} 근처 스팟`} spots={nearby} from={top} onSpot={onSpot} />}

      {named.length === 0 && nearby.length === 0 && region.status === "ok" && (
        <p className="px-4 text-subhead text-label-2">이름이 맞는 스팟이 없습니다.</p>
      )}
    </div>
  );
}

function SpotList({ title, spots, from, onSpot }: { title: string; spots: SpotPin[]; from?: Place; onSpot: (s: SpotPin) => void }) {
  return (
    <section aria-label={title}>
      <h2 className="group-header">{title}</h2>
      <ul className="group-inset bg-bg-grouped">
        {spots.map((s) => (
          <li key={s.id}>
            <button className="row press w-full py-3 text-left" onClick={() => onSpot(s)}>
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg text-[22px] leading-none"
                style={{ boxShadow: `inset 0 0 0 2px ${spotColor(s.types)}` }}
                aria-hidden
              >
                {spotEmoji(s.types)}
              </span>
              <Lines
                title={s.name}
                sub={`${s.types.map(typeLabel).join(" · ")}${from ? ` · ${formatDistance(distanceM(from, s))}` : ""}`}
              />
              <Icon name="chevronRight" className="h-4 w-4 text-separator" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlaceIcon({ name }: { name: "clock" | "map" }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill text-label-2" aria-hidden>
      <Icon name={name} className="h-5 w-5" />
    </span>
  );
}

function Lines({ title, sub }: { title: string; sub?: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-headline font-semibold">{title}</span>
      {sub && <span className="block truncate text-subhead text-label-2">{sub}</span>}
    </span>
  );
}
