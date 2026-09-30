"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import LoginForm from "@/components/LoginForm";
import Screen from "@/components/Screen";
import { api, useSession } from "@/lib/client";
import { PRIORITY_REASONS, REPORT_REASONS } from "@/lib/spot-rules";

type Report = {
  id: string;
  spot_id: string | null;
  reason: string;
  description: string | null;
  status: string;
  resolution: string | null;
  note: string | null;
  created_at: string;
  spots: { name: string; visibility: string } | null;
};

const reasonLabel = (r: string) => REPORT_REASONS.find((x) => x.value === r)?.label ?? r;

// Minimal operator tool (PRD §8). Access enforced server-side; not linked from public menus.
export default function AdminPage() {
  const session = useSession();
  const [tab, setTab] = useState<"open" | "done">("open");
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ reports: Report[] }>(`/api/admin/reports?status=${tab}`)
      .then((r) => {
        setError(null);
        setReports(
          // priority first, then oldest
          [...r.reports].sort((a, b) => +PRIORITY_REASONS.includes(b.reason) - +PRIORITY_REASONS.includes(a.reason)),
        );
      })
      .catch((e) => setError(e.message));
  }, [tab]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  if (session === undefined) return null;
  if (session === null)
    return (
      <Screen title="운영">
        <LoginForm onDone={() => {}} />
      </Screen>
    );

  return (
    <Screen title="운영 · 신고">
    <div className="flex flex-col gap-4">
      <div className="flex gap-2" role="tablist">
        {(["open", "done"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`btn ${tab === t ? "bg-label text-white" : ""}`} onClick={() => setTab(t)}>
            {t === "open" ? "미처리" : "처리 완료"}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {reports?.length === 0 && <p className="text-footnote text-label-2">신고가 없습니다.</p>}
      <ul className="flex flex-col gap-3">
        {reports?.map((r) => (
          <li key={r.id}>
            <ReportCard report={r} onDone={load} />
          </li>
        ))}
      </ul>
      <DirectAction />
    </div>
    </Screen>
  );
}

function ReportCard({ report: r, onDone }: { report: Report; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const act = async (body: Record<string, string>) => {
    setError(null);
    try {
      await api(`/api/admin/reports/${r.id}`, { method: "POST", body: JSON.stringify({ ...body, note }) });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const priority = PRIORITY_REASONS.includes(r.reason);
  return (
    <div className={`card flex flex-col gap-2 ${priority ? "ring-2 ring-danger" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        {priority && <span className="chip bg-danger text-white">우선</span>}
        <span className="chip">{reasonLabel(r.reason)}</span>
        <span className="chip">{r.status}</span>
        {r.resolution && <span className="chip">{r.resolution}</span>}
        <span className="text-footnote text-label-2">{new Date(r.created_at).toLocaleString("ko-KR")}</span>
      </div>
      {r.spot_id ? (
        <Link href={`/spot/${r.spot_id}`} className="font-semibold underline">
          {r.spots?.name ?? r.spot_id} ({r.spots?.visibility})
        </Link>
      ) : (
        <p className="text-footnote text-label-2">삭제된 스팟</p>
      )}
      {r.description && <p className="whitespace-pre-wrap text-subhead">{r.description}</p>}
      {r.note && <p className="text-subhead text-label-2">메모: {r.note}</p>}
      {error && <p role="alert" className="field-error">{error}</p>}
      {(r.status === "open" || r.status === "reviewing") && (
        <>
          <label className="label" htmlFor={`note-${r.id}`}>
            처리 메모
          </label>
          <input id={`note-${r.id}`} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {r.status === "open" && (
              <button className="btn" onClick={() => act({ status: "reviewing" })}>
                검토 시작
              </button>
            )}
            <button className="btn" onClick={() => act({ status: "dismissed" })}>
              기각
            </button>
            <button className="btn" onClick={() => act({ status: "resolved", resolution: "no_action" })}>
              조치 없음
            </button>
            <button className="btn" onClick={() => act({ status: "resolved", resolution: "corrected" })}>
              정보 정정됨
            </button>
            <button className="btn" onClick={() => act({ status: "resolved", resolution: "hidden" })}>
              숨김
            </button>
            <button className="btn-danger" onClick={() => act({ status: "resolved", resolution: "deleted" })}>
              삭제
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DirectAction() {
  const [id, setId] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (action: string) => {
    try {
      await api(`/api/admin/spots/${id.trim()}`, { method: "POST", body: JSON.stringify({ action, note }) });
      setMsg("처리했습니다.");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <section className="card flex flex-col gap-2" aria-labelledby="direct">
      <h2 id="direct" className="font-bold">
        신고 없는 직접 조치
      </h2>
      <label className="label" htmlFor="direct-id">
        스팟 ID
      </label>
      <input id="direct-id" className="input" value={id} onChange={(e) => setId(e.target.value)} />
      <label className="label" htmlFor="direct-note">
        사유 메모
      </label>
      <input id="direct-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn" onClick={() => act("hide")}>
          숨김
        </button>
        <button className="btn" onClick={() => act("restore")}>
          복구
        </button>
        <button className="btn-danger" onClick={() => act("delete")}>
          삭제
        </button>
      </div>
      {msg && <p role="status" className="text-subhead">{msg}</p>}
    </section>
  );
}
