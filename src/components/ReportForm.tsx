"use client";
import { useState } from "react";
import Icon from "@/components/Icon";
import { api } from "@/lib/client";
import { len, REPORT_REASONS } from "@/lib/spot-rules";

export default function ReportForm({ spotId, onClose }: { spotId: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason) return setError("신고 사유를 선택해 주세요.");
    if (reason === "other" && len(description.trim()) < 10) return setError("기타 사유는 10자 이상 설명해 주세요.");
    setBusy(true);
    try {
      const r = await api<{ duplicate?: boolean }>("/api/reports", {
        method: "POST",
        body: JSON.stringify({ spot_id: spotId, reason, description }),
      });
      setResult(r.duplicate ? "이미 접수된 신고가 처리 중입니다." : "신고가 접수되었습니다. 신고자 정보는 공개되지 않습니다.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (result)
    return (
      <div className="card flex flex-col gap-3" role="status">
        <p>{result}</p>
        <button className="btn" onClick={onClose}>
          닫기
        </button>
      </div>
    );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <fieldset>
        <legend className="group-header">신고 사유</legend>
        <div className="group-inset">
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className="row cursor-pointer">
              <input type="radio" name="reason" className="peer sr-only" checked={reason === r.value} onChange={() => setReason(r.value)} />
              <span className="flex-1">{r.label}</span>
              <Icon name="check" className="h-5 w-5 text-tint opacity-0 peer-checked:opacity-100" />
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="report-desc" className="group-header block">
          설명 {reason === "other" ? "· 10자 이상 필수" : "· 선택"}
        </label>
        <div className="group-inset">
          <textarea
            id="report-desc"
            className="block min-h-24 w-full bg-transparent px-4 py-3 text-body outline-none"
            maxLength={1200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <p className="group-footer">{len(description.trim())}/1000 · 신고자 정보는 공개되지 않습니다.</p>
      </div>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <button className="btn-primary" disabled={busy}>
        {busy ? "접수 중…" : "신고하기"}
      </button>
      <button type="button" className="btn-plain justify-center" onClick={onClose}>
        취소
      </button>
    </form>
  );
}
