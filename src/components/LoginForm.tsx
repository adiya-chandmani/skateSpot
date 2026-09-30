"use client";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useSignIn, useSignUp } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import Icon from "@/components/Icon";

const RESEND_WAIT = 60;

/** Korean message for a Clerk error (codes: https://clerk.com/docs/errors). */
function clerkMessage(err: unknown, fallback: string) {
  const code = isClerkAPIResponseError(err) ? err.errors[0]?.code : undefined;
  if (isClerkAPIResponseError(err) && err.status === 429) return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  switch (code) {
    case "form_code_incorrect":
      return "코드가 올바르지 않습니다. 다시 확인해 주세요.";
    case "verification_expired":
    case "verification_failed":
      return "코드가 만료되었습니다. 새 코드를 요청해 주세요.";
    case "form_param_format_invalid":
    case "form_identifier_invalid":
      return "올바른 이메일 주소를 입력해 주세요. 예: name@example.com";
    case "form_identifier_exists":
      return "이미 가입된 이메일입니다. 다시 시도해 주세요.";
    default:
      return fallback;
  }
}

/**
 * Email one-time code login (PRD §3) on Clerk. Existing email → sign-in code,
 * new email → sign-up code with legal consent. Calls onDone after the session is active.
 */
export default function LoginForm({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const id = useId();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState(""); // address the code was sent to
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailBad, setEmailBad] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // Email/consent are uncontrolled and read at submit: typing before hydration is never wiped.
  async function send(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setError(null);
    const fd = e ? new FormData(e.currentTarget) : null;
    const address = fd ? String(fd.get("email") ?? "").trim() : email;
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setEmailBad(true);
      return setError("올바른 이메일 주소를 입력해 주세요. 예: name@example.com");
    }
    if (fd && !fd.get("agree")) return setError("만 14세 이상 및 약관 동의가 필요합니다.");
    setEmail(address);
    setBusy(true);
    try {
      // resend reuses the current flow; first send tries sign-in, then falls back to sign-up
      if (!fd) {
        const { error } = mode === "signIn" ? await signIn.emailCode.sendCode() : await signUp.verifications.sendEmailCode();
        if (error) throw error;
      } else {
        const r = await signIn.emailCode.sendCode({ emailAddress: address });
        if (!r.error) setMode("signIn");
        else if (isClerkAPIResponseError(r.error) && r.error.errors[0]?.code === "form_identifier_not_found") {
          const c = await signUp.create({ emailAddress: address, legalAccepted: true });
          if (c.error) throw c.error;
          const v = await signUp.verifications.sendEmailCode();
          if (v.error) throw v.error;
          setMode("signUp");
        } else throw r.error;
      }
      setCode("");
      setStep("code");
      setWait(RESEND_WAIT);
    } catch (err) {
      setError(clerkMessage(err, "코드를 보내지 못했습니다. 다시 시도해 주세요."));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const flow = mode === "signIn" ? signIn : signUp;
      const { error } =
        mode === "signIn"
          ? await signIn.emailCode.verifyCode({ code: code.trim() })
          : await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (error) throw error;
      if (flow.status !== "complete") throw new Error("incomplete");
      const f = await flow.finalize();
      if (f.error) throw f.error;
      onDone();
    } catch (err) {
      setError(clerkMessage(err, "로그인을 완료하지 못했습니다. 코드를 다시 확인해 주세요."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pin text-white" aria-hidden>
          <Icon name="skate" className="h-8 w-8" />
        </span>
        <h2 className="text-title2 font-bold">{step === "email" ? "로그인" : "코드 입력"}</h2>
        <p className="text-subhead text-label-2">
          {step === "email" ? (
            "이메일로 일회용 코드를 보내 드립니다. 처음이면 자동으로 가입됩니다."
          ) : (
            <>
              <strong className="text-label">{email}</strong>로 보낸 코드를 입력해 주세요.
            </>
          )}
        </p>
      </div>
      {step === "email" ? (
        <form onSubmit={send} className="flex flex-col gap-4" noValidate>
          <div>
            <label htmlFor={`${id}-email`} className="mb-2 block px-1 text-subhead font-semibold text-label">
              이메일 주소
            </label>
            {/* obvious field: white box, border, focus ring, example placeholder */}
            <div className="flex h-[52px] items-center gap-2.5 rounded-xl bg-bg px-4 ring-1 ring-separator transition-shadow focus-within:ring-2 focus-within:ring-label has-[input[aria-invalid=true]]:ring-2 has-[input[aria-invalid=true]]:ring-danger">
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-label-2" fill="currentColor" aria-hidden>
                <path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2.3V17h16V7.3l-8 5.2zM5.6 7 12 11.2 18.4 7z" />
              </svg>
              <input
                id={`${id}-email`}
                name="email"
                defaultValue={email}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="send"
                autoFocus
                placeholder="name@example.com"
                className="h-full w-full bg-transparent text-body outline-none placeholder:text-label-2/70"
                onChange={() => {
                  setEmailBad(false);
                  setError(null);
                }}
                aria-invalid={emailBad}
                aria-describedby={error ? `${id}-err` : undefined}
              />
            </div>
            <p className="mt-1.5 px-1 text-footnote text-label-2">이 주소로 6자리 로그인 코드를 보내 드립니다.</p>
          </div>
          <div className="group-inset">
            <label className="row cursor-pointer">
              <input
                type="checkbox"
                className="h-6 w-6 shrink-0 accent-[var(--color-tint)]"
                name="agree"
              />
              <span className="text-subhead">
                만 14세 이상이며{" "}
                <Link href="/terms" target="_blank" className="text-link">
                  이용약관
                </Link>
                과{" "}
                <Link href="/privacy" target="_blank" className="text-link">
                  개인정보처리방침
                </Link>
                에 동의합니다.
              </span>
            </label>
          </div>
          <button className="btn-primary" disabled={busy}>
            {busy ? "보내는 중…" : "코드 받기"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
          <label htmlFor={`${id}-code`} className="sr-only">
            인증 코드
          </label>
          <input
            id={`${id}-code`}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            className="input h-14 text-center text-title2 font-semibold tracking-[0.4em] tabular-nums"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
            aria-describedby={error ? `${id}-err` : undefined}
          />
          <button className="btn-primary" disabled={busy || code.length < 6}>
            {busy ? "확인 중…" : "로그인"}
          </button>
          <div className="flex justify-between px-1">
            <button type="button" className="btn-plain" disabled={wait > 0 || busy} onClick={() => send()}>
              {wait > 0 ? `${wait}초 후 재요청` : "코드 다시 받기"}
            </button>
            <button
              type="button"
              className="btn-plain"
              onClick={() => {
                setStep("email");
                setError(null);
              }}
            >
              이메일 변경
            </button>
          </div>
        </form>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="field-error text-center">
          {error}
        </p>
      )}
      {/* Clerk bot protection (CAPTCHA) mounts here during sign-up */}
      <div id="clerk-captcha" />
      {onCancel && (
        <button type="button" className="btn-plain justify-center" onClick={onCancel}>
          취소
        </button>
      )}
    </div>
  );
}

/** Modal wrapper: keeps the underlying page (and its form state) mounted. */
export function LoginModal({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="로그인">
      <div className="max-h-[92dvh] w-full max-w-md overflow-auto rounded-t-2xl bg-bg-grouped px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 shadow-sheet sm:rounded-2xl">
        <LoginForm onDone={onDone} onCancel={onCancel} />
      </div>
    </div>
  );
}
