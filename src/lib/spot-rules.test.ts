// Run: npm test
import assert from "node:assert/strict";
import { coordError, validateSpot, len, spotEmoji, mixColor, estimateMinutes, formatMinutes, routeLinks, roadMeters } from "./spot-rules.ts";

const base = {
  name: "  Seoul Forest Ledge ",
  description: "Smooth granite ledge by the fountain.",
  types: ["street_spot"],
  location: { lat: 37.54, lng: 127.04 },
};

// valid + trimmed
let r = validateSpot(base);
assert.equal(r.ok, true);
assert.equal(r.value.name, "Seoul Forest Ledge");

// NFD Hangul counts the same as NFC after normalization (A09)
const nfd = "서울숲".normalize("NFD");
assert.equal(len(nfd) > 3, true);
r = validateSpot({ ...base, name: nfd });
assert.equal(r.value.name, "서울숲");
assert.equal(len(r.value.name), 3);

// whitespace-only / too short
assert.ok(validateSpot({ ...base, name: "   " }).errors.name);
assert.ok(validateSpot({ ...base, description: "  short  " }).errors.description);

// types: empty, unknown, duplicate
assert.ok(validateSpot({ ...base, types: [] }).errors.types);
assert.ok(validateSpot({ ...base, types: ["kicker"] }).errors.types);
assert.ok(validateSpot({ ...base, types: ["street_spot", "street_spot"] }).errors.types);

// difficulty was removed from the product: extra fields are ignored, not required
assert.equal(validateSpot({ ...base, difficulty: 9 } as never).ok, true);

// coordinates (A06): 0 is a number (not missing) but outside Korea; NaN/Infinity/out of range rejected
assert.equal(coordError({ lat: 0, lng: 0 }), "현재 대한민국 내 스팟만 등록할 수 있습니다.");
assert.equal(coordError({ lat: NaN, lng: 127 }), "좌표가 올바르지 않습니다.");
assert.equal(coordError({ lat: 37, lng: Infinity }), "좌표가 올바르지 않습니다.");
assert.equal(coordError({ lat: 91, lng: 127 }), "좌표가 범위를 벗어났습니다.");
assert.equal(coordError(null), "위치를 확정해 주세요.");
assert.equal(coordError({ lat: 33.24, lng: 126.56 }), null); // Seogwipo
assert.equal(coordError({ lat: 37.24, lng: 131.86 }), null); // Dokdo

console.log("spot-rules ok");

// Exactly one category; obstacle tags and malformed mixed arrays are rejected.
assert.equal(validateSpot({ ...base, types: ["plaza"] }).ok, true);
for (const types of [["plaza", "street_spot"], ["ledge"], ["plaza", 42], [null]])
  assert.ok(validateSpot({ ...base, types }).errors.types);
assert.equal(spotEmoji(["plaza"]), "⛲");
assert.equal(spotEmoji(["street_spot"]), "📷");

assert.equal(validateSpot({ ...base, types: ["xgame_park"] }).ok, true);
assert.equal(spotEmoji(["xgame_park"]), "🛹");

// cluster colors: one kind keeps its color; mixed kinds average once per kind, not per spot
const x = { types: ["xgame_park"] }, st = { types: ["street_spot"] };
assert.equal(mixColor([x, x]), "#C2410C");
assert.equal(mixColor([x, st, st]), "#983573");

// directions: skate rides walking routes but at board speed
assert.equal(estimateMinutes("walk", 4500), 60);
assert.equal(estimateMinutes("skate", 4000), 20);
assert.equal(estimateMinutes("bus", 4000), null);
assert.equal(formatMinutes(75), "1시간 15분");
assert.equal(Math.round(roadMeters({ lat: 37.5, lng: 127 }, { lat: 37.5, lng: 127 }, 1234)), 1234);
const links = routeLinks("skate", { name: "수지, 스팟", lat: 37.3, lng: 127.1 }, { lat: 37.5, lng: 127 });
assert.match(links.kakaoApp, /^kakaomap:\/\/route\?sp=37.5,127&ep=37.3,127.1&by=FOOT$/);
assert.match(links.naverApp, /^nmap:\/\/route\/walk\?slat=37.5/);
assert.match(links.kakaoWeb, /\/link\/by\/walk\/.+,37.5,127\/.+,37.3,127.1$/);
assert.match(routeLinks("bus", { name: "x", lat: 37.3, lng: 127.1 }).kakaoWeb, /\/link\/to\/x,37.3,127.1$/);
