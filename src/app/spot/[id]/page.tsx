"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import { LoginModal } from "@/components/LoginForm";
import KakaoMap from "@/components/KakaoMap";
import ReportForm from "@/components/ReportForm";
import SpotMeta from "@/components/SpotMeta";
import { FavoriteButton } from "@/components/Favorites";
import { api, ApiError, useSession } from "@/lib/client";
import { LEVEL } from "@/lib/spot-rules";

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
          content: `<div style="width:30px;height:30px;border-radius:50%;background:#111;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25)" aria-hidden="true"></div>`,
        });
    },
    [spot],
  );

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
    { icon: "map", label: "지도", href: `/?lat=${spot.lat}&lng=${spot.lng}&level=${LEVEL.spot}` },
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

        <section aria-labelledby="where">
          <h2 id="where" className="group-header">
            위치
          </h2>
          <div className="group-inset">
            <KakaoMap
              center={spot}
              level={LEVEL.spot}
              onReady={onMap}
              className="relative h-44 w-full"
              label={`${spot.name} 위치 지도`}
              fallbackHint="좌표는 아래에 표시됩니다."
            />
            {address && (
              <div className="row">
                <span className="text-body">{address} 부근</span>
              </div>
            )}
            <div className="row">
              <span className="text-subhead text-label-2">좌표</span>
              <span className="ml-auto text-subhead tabular-nums">
                {spot.lat.toFixed(6)}, {spot.lng.toFixed(6)}
              </span>
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
