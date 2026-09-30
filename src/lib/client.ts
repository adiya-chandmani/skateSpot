"use client";
import { useAuth, useUser } from "@clerk/nextjs";
import { useMemo } from "react";

/** undefined = loading, null = signed out. Thin wrapper over Clerk so pages stay auth-agnostic. */
export function useSession(): { user: { id: string; email: string | undefined } } | null | undefined {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const id = user?.id;
  const email = user?.primaryEmailAddress?.emailAddress;
  return useMemo(() => {
    if (!isLoaded || (isSignedIn && !id)) return undefined;
    if (!isSignedIn) return null;
    return { user: { id: id!, email } };
  }, [isLoaded, isSignedIn, id, email]);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

/** fetch JSON from our API. Same-origin: the Clerk session cookie authenticates the request. */
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && typeof init.body === "string") headers.set("content-type", "application/json");
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "네트워크 연결을 확인해 주세요.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? "요청에 실패했습니다.", json.fields);
  return json as T;
}

export type GeoResult = { lat: number; lng: number; accuracy: number };

/** One-shot browser location, 10s timeout (PRD §4). Rejects with a Korean message. */
export function getLocation(): Promise<GeoResult> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("이 브라우저는 위치 기능을 지원하지 않습니다."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? "위치 권한이 거부되었습니다. 브라우저 설정에서 허용하거나 지역 검색을 이용해 주세요."
              : e.code === e.TIMEOUT
                ? "위치 확인 시간이 초과되었습니다."
                : "현재 위치를 확인할 수 없습니다.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}
