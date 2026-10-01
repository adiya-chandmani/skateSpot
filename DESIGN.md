# DESIGN.md — SKATESPOT

Locked 2026-09-29 · revised: monochrome chrome, kind-colored pins (2026-09-30). Edit this file first, then code.

## Direction

- **Register:** product. Design serves finding and pinning spots.
- **Surface:** phone first, one-handed use outdoors. Desktop gets the same UI with the sheet docked on the left.
- **Reference:** Apple Maps (iOS). The map fills the screen and everything else sits on top of it: a bottom sheet with detents, floating controls, and place cards.
- **Three words:** calm, spatial, street — in griptape black and white.
- **Identity:** iOS system chrome in black and white only: griptape black against white deck and wheels. There is no brand hue. Emphasis comes from value contrast (black on white, 15:1 or more against the map), weight, and shape. Chrome stays black and white; map pins carry their spot kind's color (see Pins). A selected pin inverts (fill ↔ ring) instead of changing color. One dominant element per screen (ch06).

## Type

System stack only, the product register (ch03 medium–form fit): `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`.

Scale in px. These are iOS Dynamic Type defaults at a 1.2 step, and 17 is body.

| Token | Size / weight / leading | Use |
|---|---|---|
| large-title | 34 / 700 / 41 | Screen titles |
| title2 | 22 / 700 / 28 | Place card name |
| title3 | 20 / 600 / 25 | Section heads in sheets |
| headline | 17 / 600 / 22 | Row titles, buttons |
| body | 17 / 400 / 22 | Text, inputs (≥16 avoids iOS zoom) |
| subhead | 15 / 400 / 20 | Secondary rows |
| footnote | 13 / 400 / 18 | Group footers, meta |
| caption | 12 / 500 / 16 | Tab labels, chips |

## Color (light, monochrome; the map tiles are light)

The brand is black and white. The only other colors are functional and are always paired with an icon or text: danger (red), success (green), location/focus (blue).

**Pins:** each spot kind has one color, used for the pin fill (far), the pin ring (close), and the list-row ring: X-GAME PARK 🛹 skate orange `#C2410C`, STREET SPOTS 📷 violet `#6D28D9`, PLAZA ⛲ teal `#0F766E`. All three carry white text at ≥5:1. Far away (Kakao level > 5) pins are kind-colored dots with a white ring; close up (level ≤ 5) they are white circles with a kind-colored ring and the kind emoji. A selected pin inverts and gains a tail. Clusters are computed on a grid in absolute map pixels, so panning never regroups them; only zoom does. A cluster bubble is filled with the kind color when it holds one kind, and with the equal RGB mix of its kinds' colors when it holds several (orange + violet → `#983573`), so a mixed area reads as mixed at a glance. Kind color is never the only signal: the emoji, the list label, and the filter chip text say the same thing. The filter chips in the sheet show the same colored dot and double as the legend.

| Token | Hex | Contrast | Role |
|---|---|---|---|
| `--bg-grouped` | #F2F2F7 | – | Screen background behind grouped lists |
| `--bg` | #FFFFFF | – | Cells, sheet body |
| `--label` | #1C1C1E | 16.7:1 on white | Text |
| `--label-2` | #6C6C70 | 5.23:1 white · 4.69:1 grouped | Secondary text |
| `--separator` | #C6C6C8 | – | Hairlines, 0.5px |
| `--fill` | rgba(120,120,128,.12) | – | Search field, secondary buttons, chips |
| `--pin` | #111111 | 15.2:1 vs map · white ring | Brand mark, fallback pin color |
| kind colors | #C2410C · #6D28D9 · #0F766E | 5.2 · 7.1 · 5.5:1 with white | Pins, clusters (mixed = RGB mean), list rings, filter dots |
| `--tint` | #111111 | 18.9:1 with white text | Primary buttons, selected states |
| `--tint-pressed` | #3A3A3C | – | Pressed |
| `--link` | #111111 | 18.9:1 white | Links and plain buttons: medium weight; inline links underlined |
| `--location` | #007AFF | non-text | User location dot, focus ring (functional exception) |
| `--danger` | #D70015 | 5.9:1 white | Destructive text |
| `--success` | #248A3D | 4.6:1 white | Confirmed state |

Shadows are hue-neutral and low: `0 2px 12px rgba(0,0,0,.12)` for floating controls, and `0 -1px 20px rgba(0,0,0,.10)` for the sheet.

## Material

Glass (`rgba(255,255,255,.78)` + `backdrop-filter: blur(20px) saturate(180%)`) is allowed **only on chrome that floats over the map**: map controls, the "이 지역 검색" pill, the sheet header, and the nav bar over the hero photo. There it keeps map context visible while the controls stay legible, so it does real work and isn't decoration (ai-tells: decorative glass). Text content inside sheets sits on solid white.

## Shape and space

- 4px base: 4 · 8 · 12 · 16 · 20 · 24 · 32.
- Side gutter 16.
- Radii: controls 10, grouped cells 12, sheet 16 (top corners), floating buttons fully round or 12, pins round.
- Touch targets ≥44×44. Primary button height 50.

## Motion

- Sheet detent snap: 350ms `cubic-bezier(.32,.72,0,1)` (iOS sheet curve). Drag follows the finger 1:1 with no easing.
- Press feedback: 100ms opacity/scale 0.97.
- No bounce. `prefers-reduced-motion` turns transitions off.

## Layout patterns

- **Map screen:** full-bleed map (100dvh).
  - Glass control stack at the top right (location).
  - "이 지역 검색" pill at the top center.
  - Bottom sheet with three detents: peek 140 (search pill, Add, avatar), half 50%, full (top minus 56). Selecting a pin opens a place card inside the sheet at half.
- **Pushed screens** (search, detail, forms, account): iOS nav bar with a back chevron and a large title, grouped inset lists on `--bg-grouped`, sticky bottom action where needed.
- **Desktop (md+):** the sheet docks as a floating left panel (16px inset, 380 wide) with a brand row (icon + SKATESPOT) on top; the floating logo pill hides. Filter chips wrap instead of scrolling. Map controls stack top-right: location lock (tap: center on me and follow; filled --location blue while locked; tap again or drag the map to release), then zoom +/− (phones pinch instead). Selecting a spot centers it in the visible map to the right of the panel. Hovering or focusing a list row lifts its pin or cluster (scale 1.2, raised z). The place card shows the photo first.
- **Detail:** edge-to-edge hero photo, floating round glass back button, title2 name, meta chips, action tiles row, then grouped info sections. The first action tile is 길찾기: it opens a 길찾기 card (20px padding): an iOS segmented control (fill track, selected mode = white pill; emoji + time) for 🚌 🚗 🚶 🛹, then the selected mode's time as the one large number (large-title; '약' prefix for estimates) with its basis on a subhead line, then the primary button 24px below. Black is reserved for the button. Times — car from Kakao Mobility, walk/skate estimated from road distance; skate routes as walking) and a 길안내 시작 button that tries Kakao Map app → Naver Map app → Kakao Map web. The location map has a small (36px) top-right location-lock button (glass; filled --location blue while locked) that centers on me and follows movement until the map is dragged; it shows my position (blue dot) and the route line (car solid, walk/skate dashed); address and coordinate rows have copy buttons. At lg+ it becomes two columns: sticky photo left (7fr), details right (5fr), max 1152 wide.
- **Forms:** grouped sections with footers, a segmented control for difficulty, toggle chips for types.

The PRD's main menu (Map · Search · Add · Account) lives in the map sheet header: search pill, "+" button, avatar. Other screens return to the map with the back chevron.
