"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

/**
 * Pushed iOS screen: sticky glass nav bar with back chevron; large title that
 * collapses into the bar when scrolled (DESIGN.md › Layout patterns).
 */
export default function Screen({
  title,
  back = "/",
  backLabel = "지도",
  trailing,
  children,
  bottom,
}: {
  title: string;
  back?: string;
  backLabel?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  bottom?: React.ReactNode;
}) {
  const router = useRouter();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting), { rootMargin: "-52px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-bg-grouped">
      <header
        className={`sticky top-0 z-30 pt-[env(safe-area-inset-top)] transition-[background,box-shadow] duration-200 ${collapsed ? "glass shadow-[inset_0_-0.5px_0_var(--color-separator)]" : "bg-bg-grouped"}`}
      >
        <div className="mx-auto grid h-11 max-w-2xl grid-cols-[1fr_auto_1fr] items-center px-2">
          <Link
            href={back}
            onClick={(e) => {
              // prefer real back to keep map state; fall back to href on direct entry
              if (window.history.length > 1) {
                e.preventDefault();
                router.back();
              }
            }}
            className="btn-plain justify-self-start pr-2"
          >
            <Icon name="chevronLeft" className="h-6 w-6" />
            {backLabel}
          </Link>
          <p
            className={`truncate text-headline font-semibold transition-opacity duration-200 ${collapsed ? "opacity-100" : "opacity-0"}`}
            aria-hidden
          >
            {title}
          </p>
          <div className="justify-self-end">{trailing}</div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-10">
        <h1 ref={titleRef} className="pb-5 pt-1 text-large-title font-bold tracking-tight">
          {title}
        </h1>
        {children}
      </main>
      {bottom && (
        <div className="glass sticky bottom-0 z-30 shadow-[inset_0_0.5px_0_var(--color-separator)]">
          <div className="mx-auto max-w-2xl px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">{bottom}</div>
        </div>
      )}
    </div>
  );
}

export function Footer() {
  return (
    <p className="py-6 text-center text-footnote text-label-2">
      <Link href="/terms" className="underline">
        이용약관
      </Link>
      {" · "}
      <Link href="/privacy" className="underline">
        개인정보처리방침·문의
      </Link>
    </p>
  );
}
