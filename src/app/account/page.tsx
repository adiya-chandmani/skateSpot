"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FavoriteButton, useFavorites } from "@/components/Favorites";
import { LEVEL, spotEmoji, typeLabel } from "@/lib/spot-rules";
import LoginForm from "@/components/LoginForm";
import Icon from "@/components/Icon";
import Screen, { Footer } from "@/components/Screen";
import { useClerk } from "@clerk/nextjs";
import { api, useSession } from "@/lib/client";

type Mine = { id: string; name: string; visibility: "published" | "hidden"; updated_at: string };

export default function AccountPage() {
  const session = useSession();
  const favorites = useFavorites();
  const { signOut } = useClerk();
  const router = useRouter();
  const [spots, setSpots] = useState<Mine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    api<{ spots: Mine[] }>("/api/me/spots")
      .then((r) => setSpots(r.spots))
      .catch((e) => setError(e.message));
  }, [session]);

  async function deleteAccount() {
    setBusy(true);
    try {
      await api("/api/me", { method: "DELETE" });
      await signOut(); // user is gone server-side; clear the local session
      router.replace("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (session === undefined)
    return (
      <Screen title="계정">
        <p className="text-subhead text-label-2">불러오는 중…</p>
      </Screen>
    );
  if (session === null)
    return (
      <Screen title="계정">
        <LoginForm onDone={() => {}} />
        <Footer />
      </Screen>
    );

  return (
    <Screen title="계정">
      <div className="flex flex-col gap-7">
        <div className="group-inset">
          <div className="row">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fill text-title3 font-semibold uppercase" aria-hidden>
              {session.user.email?.[0]}
            </span>
            <span className="min-w-0 flex-1 truncate text-body">{session.user.email}</span>
          </div>
        </div>

        <section aria-labelledby="favorites">
          <h2 id="favorites" className="group-header">즐겨찾기 · {favorites.spots.length}</h2>
          {favorites.loading && <p className="row text-label-2">불러오는 중…</p>}
          {favorites.error && <div role="alert" className="card text-danger">
            <p>{favorites.error}</p><button className="btn-plain" onClick={favorites.reload}>다시 시도</button>
          </div>}
          {!favorites.loading && !favorites.error && favorites.spots.length === 0 &&
            <p className="card text-subhead text-label-2">지도나 스팟 상세에서 별을 눌러 저장해 보세요.</p>}
          <ul className="group-inset">
            {favorites.spots.map((s) => <li key={s.id} className="border-b border-separator p-3 last:border-0">
              <Link href={`/spot/${s.id}`} className="row press px-0">
                <span aria-hidden className="text-2xl">{spotEmoji(s.types)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{s.name}</span>
                  <span className="text-footnote text-label-2">{s.types.map(typeLabel).join(" · ")}</span></span>
                <Icon name="chevronRight" />
              </Link>
              <div className="grid grid-cols-2 gap-2">
                <Link className="btn" href={`/?lat=${s.lat}&lng=${s.lng}&level=${LEVEL.spot}&selected=${s.id}`}><Icon name="map" />지도에서 보기</Link>
                <FavoriteButton spotId={s.id} />
              </div>
            </li>)}
          </ul>
        </section>

        <section aria-labelledby="mine">
          <h2 id="mine" className="group-header">
            내가 등록한 스팟
          </h2>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className="group-inset">
            {spots === null && !error && <p className="row text-label-2">불러오는 중…</p>}
            {spots?.length === 0 && (
              <Link href="/add" className="row press text-link">
                <Icon name="plus" className="h-5 w-5" />첫 스팟 등록
              </Link>
            )}
            {!!spots?.length && (
              <ul>
                {spots.map((s) => (
                  <li key={s.id}>
                    <Link href={`/spot/${s.id}`} className="row press">
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className={`text-subhead ${s.visibility === "hidden" ? "font-semibold text-danger" : "text-label-2"}`}>
                        {s.visibility === "hidden" ? "숨김·운영 검토" : "공개"}
                      </span>
                      <Icon name="chevronRight" className="h-4 w-4 text-separator" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="group-footer">내 목록은 공개 프로필이 아닙니다.</p>
        </section>

        <section className="flex flex-col gap-7">
          <div className="group-inset">
            <button
              className="row press w-full text-link"
              onClick={async () => {
                await signOut();
                router.replace("/");
              }}
            >
              로그아웃
            </button>
          </div>
          <div>
            <div className="group-inset">
              <button className="row press w-full text-danger" onClick={() => setConfirmDelete((v) => !v)} aria-expanded={confirmDelete}>
                회원 탈퇴
              </button>
            </div>
            {confirmDelete && (
              <div className="mt-3 flex flex-col gap-3" role="alertdialog" aria-labelledby="leave-title">
                <p id="leave-title" className="px-4 text-subhead text-label-2">
                  계정과 등록한 모든 스팟·사진이 삭제됩니다. 제출한 신고는 계정 연결과 설명을 지운 기록으로만 남습니다. 되돌릴 수 없습니다.
                </p>
                <button className="btn-danger" onClick={deleteAccount} disabled={busy}>
                  {busy ? "처리 중…" : "탈퇴하기"}
                </button>
                <button className="btn-plain justify-center" onClick={() => setConfirmDelete(false)}>
                  취소
                </button>
              </div>
            )}
          </div>
        </section>
        <Footer />
      </div>
    </Screen>
  );
}
