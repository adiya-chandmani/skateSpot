"use client";
import { useSyncExternalStore } from "react";

// Recent places picked in search, like a maps app. Device-only (localStorage), never sent
// to the server or analytics (PRD §9: no search terms in logs).
export type Place = { title: string; address: string; lat: number; lng: number };

const KEY = "skatespot:recent-places";
const MAX = 10;
const EVENT = "skatespot:recent-places";

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function write(list: Place[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // private mode / storage full: history is a convenience, ignore
  }
  window.dispatchEvent(new Event(EVENT));
}

function parse(raw: string): Place[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((p) => p && typeof p.title === "string" && Number.isFinite(p.lat) && Number.isFinite(p.lng)) : [];
  } catch {
    return [];
  }
}

const same = (a: Place, b: Place) => a.title === b.title && a.lat === b.lat && a.lng === b.lng;

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb); // other tabs
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Most recent first. Server render and first paint see an empty list. */
export function useRecentPlaces() {
  const raw = useSyncExternalStore(subscribe, read, () => "[]");
  return parse(raw);
}

export function rememberPlace(p: Place) {
  write([p, ...parse(read()).filter((x) => !same(x, p))].slice(0, MAX));
}

export function forgetPlace(p: Place) {
  write(parse(read()).filter((x) => !same(x, p)));
}

export function clearPlaces() {
  write([]);
}
