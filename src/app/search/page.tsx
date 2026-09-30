"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { api } from "@/lib/client";
import { clearPlaces, forgetPlace, rememberPlace, useRecentPlaces, type Place } from "@/lib/search-history";
import { LEVEL } from "@/lib/spot-rules";

type Local = Place;
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

export default function SearchPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const region = useSearch<Local[]>(q, (t) => `/api/search/local?q=${encodeURIComponent(t)}`, [], 2);
  const recent = useRecentPlaces();
  // region-only search: picking a place remembers it and moves the map there (nearby spots load)
  const go = (p: Place) => {
    rememberPlace(p);
    router.push(`/?lat=${p.lat}&lng=${p.lng}&level=${LEVEL.area}`);
  };

  return (
    <div className="min-h-dvh bg-bg-grouped">
      <header className="glass sticky top-0 z-20 pt-[env(safe-area-inset-top)] shadow-[inset_0_-0.5px_0_var(--color-separator)]">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-5 py-2.5">
          <label htmlFor="q" className="sr-only">
            지역 검색
          </label>
          <div className="flex h-11 flex-1 items-center gap-2 rounded-[10px] bg-fill px-3 text-label-2">
            <Icon name="search" className="h-[18px] w-[18px] shrink-0" />
            <input
              id="q"
              type="search"
              enterKeyHint="search"
              className="h-full w-full bg-transparent text-body text-label outline-none placeholder:text-label-2"
              placeholder="역, 동네, 장소"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </div>
          <button type="button" className="btn-plain" onClick={() => router.back()}>
            취소
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-5 py-6">
        {!q.trim() && (
          <section aria-labelledby="recent">
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
              <p className="group-inset px-4 py-3.5 text-subhead text-label-2">최근 검색 기록이 없습니다.</p>
            ) : (
              <ul className="group-inset">
                {recent.map((r) => (
                  <li key={`${r.title}-${r.lat}-${r.lng}`}>
                    <div className="row py-3">
                      <button className="press flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => go(r)}>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill text-label-2" aria-hidden>
                          <Icon name="clock" className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-headline font-semibold">{r.title}</span>
                          {r.address && <span className="block truncate text-subhead text-label-2">{r.address}</span>}
                        </span>
                      </button>
                      <button className="icon-btn -mr-2 text-label-2" onClick={() => forgetPlace(r)} aria-label={`${r.title} 기록 삭제`}>
                        <Icon name="xmark" className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="group-footer">역, 동네, 장소를 검색하면 그 근처 스팟을 지도에 보여 줍니다. 기록은 이 기기에만 저장됩니다.</p>
          </section>
        )}

        {q.trim() && (
          <section aria-labelledby="region-results" aria-live="polite">
            <h2 id="region-results" className="group-header">
              지역
            </h2>
            <Status state={region} emptyText="일치하는 지역이 없습니다. 다른 이름으로 검색해 보세요." />
            {region.data.length > 0 && (
              <ul className="group-inset">
                {region.data.map((r, i) => (
                  <li key={i}>
                    <button className="row press w-full py-3 text-left" onClick={() => go(r)}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill text-label-2" aria-hidden>
                        <Icon name="map" className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-headline font-semibold">{r.title}</span>
                        <span className="block truncate text-subhead text-label-2">{r.address}</span>
                      </span>
                      <Icon name="chevronRight" className="h-4 w-4 text-separator" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function Status({ state, emptyText }: { state: State<unknown[]>; emptyText: string }) {
  const text =
    state.status === "loading"
      ? "검색 중…"
      : state.status === "error"
        ? state.error
        : state.status === "ok" && state.data.length === 0
          ? emptyText
          : state.status === "idle"
            ? "두 글자 이상 입력해 주세요."
            : null;
  if (!text) return null;
  return (
    <p role={state.status === "error" ? "alert" : undefined} className={`group-inset px-4 py-3.5 text-subhead ${state.status === "error" ? "text-danger" : "text-label-2"}`}>
      {text}
    </p>
  );
}
