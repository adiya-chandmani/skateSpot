"use client";
import { useRouter } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import Screen from "@/components/Screen";
import SpotForm from "@/components/SpotForm";
import { useSession } from "@/lib/client";

export default function AddPage() {
  const session = useSession();
  const router = useRouter();
  return (
    <Screen title="새 스팟">
      {session === undefined ? (
        <p className="text-subhead text-label-2">불러오는 중…</p>
      ) : session === null ? (
        // login before any input; cancel returns to the previous map state (PRD §3)
        <LoginForm onDone={() => {}} onCancel={() => router.back()} />
      ) : (
        <SpotForm />
      )}
    </Screen>
  );
}
