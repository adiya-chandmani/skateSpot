"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, useSession } from "@/lib/client";
import type { SpotPin } from "@/components/SpotMeta";
import { LoginModal } from "@/components/LoginForm";
import Icon from "@/components/Icon";

type Favorites = {
  spots: SpotPin[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  setFavorite: (id: string, saved: boolean) => Promise<void>;
};
const EMPTY_SPOTS: SpotPin[] = [];
const Context = createContext<Favorites | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const userId = session?.user.id;
  const [state, setState] = useState<{ userId?: string; spots: SpotPin[]; error: string | null }>({ spots: [], error: null });
  const [revision, setRevision] = useState(0);
  const pending = useRef(new Set<string>());
  const reload = useCallback(() => setRevision((n) => n + 1), []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    api<{ spots: SpotPin[] }>("/api/me/favorites")
      .then(({ spots }) => { if (active) setState({ userId, spots, error: null }); })
      .catch((e: Error) => { if (active) setState({ userId, spots: [], error: e.message }); });
    return () => { active = false; };
  }, [userId, revision]);

  async function setFavorite(id: string, saved: boolean) {
    if (!userId) throw new Error("로그인이 필요합니다.");
    const key = `${userId}:${id}`;
    if (pending.current.has(key)) return;
    pending.current.add(key);
    try {
      const result = await api<{ spot?: SpotPin }>(`/api/me/favorites/${id}`, { method: saved ? "PUT" : "DELETE" });
      setState((previous) => ({
        userId,
        error: null,
        spots: [
          ...(saved && result.spot ? [result.spot] : []),
          ...(previous.userId === userId ? previous.spots.filter((s) => s.id !== id) : []),
        ],
      }));
    } finally {
      pending.current.delete(key);
    }
  }

  return <Context.Provider value={{
    spots: userId && state.userId === userId ? state.spots : EMPTY_SPOTS,
    loading: session === undefined || (!!userId && state.userId !== userId),
    error: userId && state.userId === userId ? state.error : null,
    reload, setFavorite,
  }}>{children}</Context.Provider>;
}

export function useFavorites() {
  const context = useContext(Context);
  if (!context) throw new Error("FavoritesProvider is missing");
  return context;
}

export function FavoriteButton({ spotId }: { spotId: string }) {
  const session = useSession();
  const favorites = useFavorites();
  const saved = favorites.spots.some((s) => s.id === spotId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState(false);

  return <div className="flex flex-col gap-1">
    <button type="button" className={`btn w-full ${saved ? "text-link" : "text-label-2"}`}
      aria-pressed={saved} disabled={busy || favorites.loading}
      onClick={async () => {
        if (!session) { setLogin(true); return; }
        if (favorites.error) { favorites.reload(); return; }
        setBusy(true); setError(null);
        try { await favorites.setFavorite(spotId, !saved); }
        catch (e) { setError((e as Error).message); }
        finally { setBusy(false); }
      }}>
      <Icon name={saved ? "starFilled" : "star"} />
      {busy ? "저장 중…" : favorites.error ? "즐겨찾기 다시 불러오기" : saved ? "즐겨찾기 해제" : "즐겨찾기"}
    </button>
    {(error || favorites.error) && <p role="alert" className="text-footnote text-danger">{error || favorites.error}</p>}
    {login && <LoginModal onDone={() => setLogin(false)} onCancel={() => setLogin(false)} />}
  </div>;
}
