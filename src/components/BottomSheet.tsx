"use client";
import { useEffect, useRef, useState } from "react";

export type Detent = "peek" | "half" | "full";
const ORDER: Detent[] = ["peek", "half", "full"];

/**
 * Apple Maps–style sheet (DESIGN.md › Layout patterns). Three detents on phones,
 * docked left panel on md+. Drag the header; the grabber button cycles detents for keyboard users.
 */
export default function BottomSheet({
  detent,
  onDetent,
  header,
  children,
  peek = 148,
  label,
}: {
  detent: Detent;
  onDetent: (d: Detent) => void;
  header: React.ReactNode;
  children: React.ReactNode;
  peek?: number;
  label: string;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ sheetH: 0, vh: 0, desktop: false });
  const [drag, setDrag] = useState<number | null>(null); // live translateY while dragging
  const [animate, setAnimate] = useState(false); // no slide-in on first placement
  const start = useRef<{ y: number; t: number; time: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const measure = () =>
      setSize({
        sheetH: sheet.current?.offsetHeight ?? 0,
        vh: window.innerHeight,
        desktop: window.matchMedia("(min-width: 768px)").matches,
      });
    measure();
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, []);

  const visible = (d: Detent) => (d === "peek" ? peek : d === "half" ? Math.round(size.vh * 0.5) : size.sheetH);
  const translateFor = (d: Detent) => Math.max(0, size.sheetH - visible(d));
  const translate = drag ?? translateFor(detent);

  function onPointerDown(e: React.PointerEvent) {
    if (size.desktop) return;
    start.current = { y: e.clientY, t: translate, time: e.timeStamp, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    const s = start.current;
    if (!s) return;
    const dy = e.clientY - s.y;
    if (!s.moved && Math.abs(dy) < 6) return;
    if (!s.moved) {
      s.moved = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    setDrag(Math.min(translateFor("peek"), Math.max(0, s.t + dy)));
  }
  function onPointerUp(e: React.PointerEvent) {
    const s = start.current;
    start.current = null;
    if (!s?.moved || drag == null) return;
    suppressClick.current = true;
    const velocity = (e.clientY - s.y) / Math.max(1, e.timeStamp - s.time); // px/ms, + = down
    const projected = drag + velocity * 200;
    const nearest = ORDER.reduce((a, b) => (Math.abs(translateFor(b) - projected) < Math.abs(translateFor(a) - projected) ? b : a));
    setDrag(null);
    onDetent(nearest);
  }

  const cycle = () => onDetent(detent === "full" ? "peek" : ORDER[ORDER.indexOf(detent) + 1]);

  return (
    <section
      ref={sheet}
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-20 flex h-[calc(100dvh-56px-env(safe-area-inset-top))] flex-col rounded-t-2xl bg-bg shadow-sheet md:inset-x-auto md:bottom-4 md:left-4 md:top-4 md:h-auto md:w-[400px] md:overflow-hidden md:rounded-2xl"
      style={
        size.desktop
          ? undefined
          : {
              transform: `translateY(${translate}px)`,
              transition: drag == null && animate ? "transform 350ms var(--ease-sheet)" : "none",
              visibility: size.sheetH ? "visible" : "hidden",
            }
      }
    >
      <div
        className="glass shrink-0 touch-none rounded-t-2xl md:rounded-none md:bg-bg md:shadow-[inset_0_-0.5px_0_var(--color-separator)]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          start.current = null;
          setDrag(null);
        }}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.stopPropagation();
            e.preventDefault();
            suppressClick.current = false;
          }
        }}
      >
        <button
          type="button"
          onClick={cycle}
          className="flex h-5 w-full items-center justify-center md:hidden"
          aria-label={`시트 크기 변경 (현재 ${detent === "peek" ? "최소" : detent === "half" ? "중간" : "최대"})`}
        >
          <span className="h-[5px] w-9 rounded-full bg-fill-strong" />
        </button>
        {header}
      </div>
      <div className={`min-h-0 flex-1 overscroll-contain px-4 md:px-6 pb-[max(16px,env(safe-area-inset-bottom))] ${detent === "peek" && !size.desktop ? "overflow-hidden" : "overflow-y-auto"}`}>
        {children}
      </div>
    </section>
  );
}
