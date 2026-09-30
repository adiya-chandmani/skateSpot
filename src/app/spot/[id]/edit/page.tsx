"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import LoginForm from "@/components/LoginForm";
import Screen from "@/components/Screen";
import SpotForm, { type SpotInitial } from "@/components/SpotForm";
import { api, useSession } from "@/lib/client";

export default function EditPage() {
  const { id } = useParams<{ id: string }>();
  const session = useSession();
  const [spot, setSpot] = useState<(SpotInitial & { isOwner: boolean; visibility?: string }) | null | "gone">(null);

  useEffect(() => {
    if (!session) return;
    api<SpotInitial & { isOwner: boolean; visibility?: string }>(`/api/spots/${id}`)
      .then(setSpot)
      .catch(() => setSpot("gone"));
  }, [id, session]);

  return (
    <Screen title="스팟 수정" backLabel="뒤로" back={`/spot/${id}`}>
      {session === undefined || (session && spot === null) ? (
        <p className="text-subhead text-label-2">불러오는 중…</p>
      ) : session === null ? (
        <LoginForm onDone={() => {}} />
      ) : spot === "gone" || !spot || !spot.isOwner || spot.visibility !== "published" ? (
        <div className="flex flex-col gap-3">
          <p className="text-body">수정할 수 없는 스팟입니다.</p>
          <Link href="/account" className="btn">
            내 스팟으로
          </Link>
        </div>
      ) : (
        <SpotForm initial={spot} />
      )}
    </Screen>
  );
}
