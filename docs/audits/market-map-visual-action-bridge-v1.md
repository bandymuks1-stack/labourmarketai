# Market Map — visual-action bridge audit (v1)

**Purpose:** for every map object/action the owner wants in the "living atlas on the
map" model, state whether a **real data bridge** exists today. Per the owner's hard
rule: *if the bridge/execution is missing, it must not be shown as live* — omit it or
show an honest unavailable state. **No fake markers, no invented points, no fake
contact quota.**

**Base:** main `7325a49` (after #491 merged — real OSM/Leaflet map first, compact
surface, `Išsamiau` collapse, city-level precision). This audit drives PR B; it does
**not** add cross-user markers.

Status: `active` · `partial` · `missing bridge` · `missing execution` · `deferred`
Decision: `show` · `show with honest unavailable state` · `omit for now` · `collapse` · `defer`

## Objects (markers)

| Object | Surface (wanted) | Bridge (real today) | Execution | Status | Decision |
|---|---|---|---|---|---|
| **Own location** | A marker for the signed-in user's resolved location | `listOwnPreferredLocations()` + #491 `resolveCity`/`COUNTRY_CENTROID` → coord + honest precision (device/city/country/unset) | `market-map-base`/`market-map-live` (OSM, #491); RLS owner-scoped | **active** | **show** — real, with honest precision label |
| **Preferred work area** | Marker/area for the user's preferred work location(s) | `listOwnPreferredLocations()` (own rows, RLS) | same map; #491 | **active** | **show** (own rows only) |
| **Own demand / work-need** | Marker for the user's own posted need | `listOwnDemandLocations()` / `getOwnDemandSignalBoard()` — **country/region signal only, NO confirmed coordinates** | signal board (panel), not a plotted point | **partial** (signal-only, no coords) | **show with honest state** — as a signal, not a precise pin; no fake coordinate |
| **Person / worker marker (other users)** | Other workers as markers/avatars | **none** — `getOwnMarketSignals` is OWNER-scoped by RLS ("reads ONLY the caller's own rows… cross-user aggregate needs a future owner-gated source") | — | **missing bridge** | **omit for now** — no cross-user geo source; never fake |
| **Company marker (other users)** | Other companies as markers | **none** (same — no cross-user geo) | — | **missing bridge** | **omit for now** |
| **Demand marker (other users)** | Other companies' needs as markers | **none** (cross-user) | — | **missing bridge** | **omit for now** |
| **Project / work-location marker** | Projects plotted on the map | **none** — projects carry no confirmed coordinates surfaced to the map | — | **missing bridge** | **omit for now** |

## Filters / status chips

| Filter | Bridge (real) | Status | Decision |
|---|---|---|---|
| Country / sector scope | Real `SUPPORTED_COUNTRIES` + `SECTORS`; own signals are country/sector-tagged | **partial** (filters own/aggregate dimensions, not cross-user pins) | **show** if wired to own/real data; otherwise omit |
| Žmonės / Įmonės / Darbo poreikiai / Ieško darbo / Ieško darbuotojų | Would filter **cross-user** markers — which don't exist | **missing bridge** | **omit for now** — a filter over an empty/non-existent cross-user layer is misleading |
| Prieinami dabar / vėliau | `getOwnAvailability()` exists for the **owner's own** availability; no cross-user availability layer | **partial** (own only) | **show** only as own-availability context; **omit** as a cross-user filter |

## Actions (marker action sheet)

| Action | Bridge (real) | Status | Decision |
|---|---|---|---|
| Peržiūrėti profilį (own) | `/dashboard/profile` exists | active (own) | **show** for own marker; for other-user markers → **omit** (no marker, no public-profile-from-map route) |
| Kreiptis / Contact | `communication-eligibility.ts` (request vs direct) exists; see contact audit | **partial** | **show with honest unavailable state** when eligibility denies; never enabled without the eligibility bridge |
| Rašyti / Message | `lib/communication/*` (direct-conversation, request-worker-conversation) | **partial** | **show with honest unavailable state**; hidden where not eligible |
| Išsaugoti / Shortlist | `lib/scouting/scout-safe-view.ts` exists for company scouting; no general map-save | **partial** | **defer** to the surface where a real save target exists |
| Free-contact quota state | **none** — no quota/allowance logic anywhere in the repo | **missing bridge** | **omit** — never show "free contacts left" (see contact audit) |
| Permission / blocked-reason | `communication-eligibility` returns eligibility; no full per-relationship permission model | **partial** | **show honest reason** when eligibility denies; otherwise omit |
| Unavailable / not-active state | n/a (honest copy) | active | **show** — the honest fallback for every missing bridge above |

## Conclusion — what PR B shows on the map by default

- **Real OSM map first** (kept from #491) + the **own-location / preferred-area** marker
  with honest precision — the only markers with a real bridge today.
- **Honest empty state** ("Kol kas nėra realių signalų šiame filtre") when the user has
  no real own signal — no fake points.
- **Own demand** stays a country/region **signal** (no fake coordinate pin).
- **Everything cross-user (people / companies / demands / projects as markers) is OMITTED** —
  no data bridge exists; showing them would require fake data. Documented here as
  **missing bridge**, to be built only behind an owner-approved, privacy-safe,
  RLS-gated cross-user geo source (a separate future PR).
- **Marker action sheet** for other users is **deferred** — there are no other-user
  markers to attach it to yet. Contact/message actions are gated by the real
  eligibility bridge (see `contact-permission-quota-bridge-v1.md`); quota is never faked.

**No new map implementation is added** — #491's compact OSM map is the surface. PR B
adds this audit (and the journal review state), not a second map.
