"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";

// Our own email-code form (PRD §3) instead of Clerk's prebuilt <SignIn/>, to keep the app's
// design and the 14+/terms consent. Handles both sign-in and first-time sign-up.
function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("redirect_url") ?? params.get("next");
  // only allow local redirects
  const target = next?.startsWith("/") && !next.startsWith("//") ? next : "/account";
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center p-4">
      <LoginForm onDone={() => router.replace(target)} onCancel={() => router.back()} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
