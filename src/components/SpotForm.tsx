"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import LocationPicker, { type LocSource } from "@/components/LocationPicker";
import { LoginModal } from "@/components/LoginForm";
import { api, ApiError } from "@/lib/client";
import { PHOTO_HINT, processPhoto, type ProcessedPhoto } from "@/lib/photo";
import { len, SPOT_TYPES, validateSpot, type Coord, type SpotErrors } from "@/lib/spot-rules";

export type SpotInitial = {
  id: string;
  name: string;
  description: string;
  types: string[];
  lat: number;
  lng: number;
};

type Errors = SpotErrors & { photo?: string; agree?: string };

const PUBLIC_NOTICE =
  "선택한 위치와 사진·설명은 공개됩니다. 공개적으로 접근 가능한 스케이트 장소만 공유하세요. 주거지의 사적 주소, 출입 제한 구역, 타인의 개인정보를 노출하는 사진을 등록하지 마세요. 직접 촬영했거나 공유 권한이 있는 사진을 사용하세요.";

/** Create (PRD §6) and author edit (PRD §7) share one form. */
export default function SpotForm({ initial }: { initial?: SpotInitial }) {
  const router = useRouter();
  const editing = !!initial;
  const submissionKey = useRef<string>(crypto.randomUUID());

  const [photo, setPhoto] = useState<ProcessedPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [exif, setExif] = useState<Coord | null>(null);
  const [location, setLocation] = useState<Coord | null>(initial ? { lat: initial.lat, lng: initial.lng } : null);
  const [source, setSource] = useState<LocSource | null>(initial ? "manual" : null);
  const [confirmed, setConfirmed] = useState(editing);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [types, setTypes] = useState<string[]>(initial?.types ?? []);
  const [agree, setAgree] = useState(editing);
  const [attempted, setAttempted] = useState(false); // live re-validation after first submit
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // warn before leaving with unsaved input (PRD §3)
  useEffect(() => {
    if (!dirty || doneId) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, doneId]);

  const touch = () => {
    setDirty(true);
    setServerErrors({});
  };

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    touch();
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const p = await processPhoto(file);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      setPhoto(p);
      setExif(p.exif);
      // EXIF only fills an empty location; never replaces one the user chose (PRD §6.1)
      if (p.exif && !location) {
        setLocation(p.exif);
        setSource("exif");
        setConfirmed(false);
      }
    } catch (e) {
      setPhotoError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }

  const onLocChange = useCallback((c: Coord, s: LocSource) => {
    setLocation(c);
    setSource(s);
    setConfirmed(false);
    setDirty(true);
  }, []);

  function validate(): Errors {
    const v = validateSpot({ name, description, types, location });
    const e: Errors = { ...v.errors };
    if (!editing && !photo) e.photo = "사진을 선택해 주세요.";
    if (!e.location && !confirmed) e.location = "‘이 위치로 확정’을 눌러 주세요.";
    if (!agree) e.agree = "공개 안내를 확인해 주세요.";
    return e;
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setBanner(null);
    setAttempted(true);
    setServerErrors({});
    const errs = validate();
    const first = (["photo", "location", "name", "types", "description", "agree"] as const).find((k) => errs[k]);
    if (first) {
      document.getElementById(`field-${first}`)?.focus();
      return;
    }
    const v = validateSpot({ name, description, types, location }).value;
    const fd = new FormData();
    fd.set("data", JSON.stringify({ ...v, submission_key: submissionKey.current }));
    if (photo) fd.set("photo", photo.blob, "photo.jpg");

    setSubmitting(true);
    try {
      const r = await api<{ id: string }>(editing ? `/api/spots/${initial!.id}` : "/api/spots", {
        method: editing ? "PATCH" : "POST",
        body: fd,
      });
      setDirty(false);
      if (editing) router.push(`/spot/${r.id}`);
      else setDoneId(r.id);
    } catch (err) {
      const a = err as ApiError;
      if (a.status === 401) setNeedLogin(true);
      else {
        if (a.fields) setServerErrors(a.fields as Errors);
        setBanner(
          a.status === 0 ? "응답을 받지 못했습니다. 입력은 그대로 있으니 다시 시도해 주세요. 중복 등록되지 않습니다." : a.message,
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  const errors: Errors = {
    ...(attempted ? validate() : {}),
    ...serverErrors,
    ...(photoError ? { photo: photoError } : {}),
  };

  if (doneId)
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-white" aria-hidden>
          <Icon name="check" className="h-9 w-9" />
        </span>
        <h2 className="text-title2 font-bold">스팟이 공개되었습니다</h2>
        <p className="text-subhead text-label-2">운영자가 사후 검토할 수 있습니다.</p>
        <div className="mt-4 flex w-full flex-col gap-2">
          <Link href={`/spot/${doneId}`} className="btn-primary">
            상세 보기
          </Link>
          <Link href="/" className="btn min-h-[50px]">
            지도로 돌아가기
          </Link>
        </div>
      </div>
    );

  const err = (k: keyof Errors) =>
    errors[k] ? (
      <p id={`err-${k}`} className="field-error">
        {errors[k]}
      </p>
    ) : null;
  const a11y = (k: keyof Errors) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `err-${k}` : undefined });

  return (
    <>
      <form onSubmit={submit} noValidate className="flex flex-col gap-10 pt-2" onChange={touch}>
        {banner && (
          <p role="alert" className="card text-subhead text-danger">
            {banner}
          </p>
        )}

        <fieldset>
          <legend className="group-header">사진{editing && " · 교체할 때만 선택"}</legend>
          <div className="group-inset">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo.previewUrl} alt="선택한 사진 미리보기" className="aspect-[4/3] w-full bg-fill object-cover" />
            ) : editing ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/photos/${initial!.id}`} alt="현재 사진" className="aspect-[4/3] w-full bg-fill object-cover" />
            ) : null}
            <label htmlFor="field-photo" className="row press cursor-pointer text-link" aria-busy={photoBusy}>
              <Icon name="camera" className="h-5 w-5" />
              <span className="font-semibold">{photoBusy ? "사진 처리 중…" : photo ? "사진 다시 선택" : "사진 선택 또는 촬영"}</span>
            </label>
          </div>
          <input
            id="field-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              onPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
            {...a11y("photo")}
          />
          {err("photo")}
          <p className="group-footer">
            {photo && !photo.exif && !editing
              ? "사진에 위치 정보가 없습니다. 현재 위치를 사용하거나 지도에서 선택해 주세요."
              : photo?.exif && location && source !== "exif"
                ? "새 사진에 위치 정보가 있습니다. 필요하면 ‘사진 위치’를 눌러 적용하세요."
                : PHOTO_HINT}
          </p>
        </fieldset>

        <fieldset>
          <legend className="group-header">위치</legend>
          <div id="field-location" tabIndex={-1}>
            <LocationPicker
              value={location}
              source={source}
              confirmed={confirmed}
              exif={exif}
              error={errors.location}
              onChange={onLocChange}
              onConfirm={() => setConfirmed(true)}
            />
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-8">
          <legend className="group-header">정보</legend>
          <div>
            <div className="group-inset">
              <label htmlFor="field-name" className="sr-only">
                이름
              </label>
              <input
                id="field-name"
                className="w-full bg-transparent px-4 py-3 text-body outline-none placeholder:text-label-2 aria-[invalid=true]:placeholder:text-danger"
                placeholder="스팟 이름"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                {...a11y("name")}
              />
            </div>
            {err("name") ?? <p className="group-footer">{len(name.trim())}/80</p>}
          </div>

          <div>
            <p className="group-header" id="types-label">
              유형 · 1개 선택
            </p>
            <div id="field-types" tabIndex={-1} role="radiogroup" aria-labelledby="types-label" className="flex flex-wrap gap-x-2 gap-y-2.5" {...a11y("types")}>
              {SPOT_TYPES.map((t) => {
                const on = types.includes(t.value);
                return (
                  <label
                    key={t.value}
                    className={`press inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full px-3.5 text-subhead font-medium has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-location ${on ? "bg-label text-white" : "bg-bg text-label"}`}
                  >
                    <input
                      type="radio"
                      name="spot-type"
                      value={t.value}
                      className="sr-only"
                      checked={on}
                      onChange={() => setTypes([t.value])}
                    />
                    {on && <Icon name="check" className="h-4 w-4" />}
                    <span aria-hidden="true">{t.emoji}</span> {t.label}
                  </label>
                );
              })}
            </div>
            <p className="group-footer">PLAZA: 구역형 · X-GAME PARK: 전용 파크 · STREET SPOTS: 개별 장애물형</p>
            {err("types")}
          </div>

          <div>
            <p className="group-header">설명</p>
            <div className="group-inset">
              <label htmlFor="field-description" className="sr-only">
                설명
              </label>
              <textarea
                id="field-description"
                className="block min-h-32 w-full resize-y bg-transparent px-4 py-3.5 text-body leading-relaxed outline-none placeholder:text-label-2"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="장애물, 바닥 상태, 접근 방법, 주의할 점"
                {...a11y("description")}
              />
            </div>
            {err("description") ?? <p className="group-footer">{len(description.trim())}/1000</p>}
          </div>
        </fieldset>

        {!editing && (
          <fieldset>
            <legend className="group-header">공개 안내</legend>
            <div className="group-inset">
              <p className="px-4 pb-1 pt-4 text-footnote leading-relaxed text-label-2">{PUBLIC_NOTICE}</p>
              <label className="row cursor-pointer py-3.5">
                <input
                  id="field-agree"
                  type="checkbox"
                  className="h-6 w-6 shrink-0 accent-[var(--color-tint)]"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  {...a11y("agree")}
                />
                <span className="text-subhead leading-snug">확인했으며, 공개 등록이 토지 소유자의 이용 허가를 뜻하지 않음을 이해합니다.</span>
              </label>
            </div>
            {err("agree")}
          </fieldset>
        )}

        <div className="glass sticky bottom-0 z-20 -mx-5 px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[inset_0_0.5px_0_var(--color-separator)]">
          <button className="btn-primary w-full" disabled={submitting || photoBusy}>
            {submitting ? "저장 중…" : editing ? "수정 저장" : "등록하기"}
          </button>
        </div>
      </form>

      {needLogin && (
        <LoginModal
          onDone={() => {
            setNeedLogin(false);
            submit();
          }}
          onCancel={() => setNeedLogin(false)}
        />
      )}
    </>
  );
}
