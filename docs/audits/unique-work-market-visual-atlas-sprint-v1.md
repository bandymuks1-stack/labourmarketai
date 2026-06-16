# Unique Work Market + Visual Atlas — Sprint Audit v1

Original Labourmarket.ai system. No external brand / product / job-board names
appear anywhere in this repo (enforced by the `no-external-names` guard, denylist
supplied out-of-band). External patterns were used only as context while
planning and are referred to generically (external marketplace reference,
external job-board pattern, external map marketplace pattern).

Branch: `feat/work-market-atlas-v1` · Base: `main` (independent of #426; additive).

## 1. What we found (current state)

| Area | Where it lives today | State |
|---|---|---|
| Work categories | `lib/taxonomy/work-categories.ts` (`buildWorkCategoryOptions`) | sector-grouped options for the demand form only; not a full market atlas |
| Skills taxonomy | `messages/{locale}/skill-names.json` (~94 slugs), `lib/structuring/keywords.ts`, `lib/skills/skill-groups.ts` (#426) | construction-deep, flat outside the new functional group axis |
| Worker profile skills | `worker_skills`, `profile_skill_claims`, `lib/profile/skill-evidence*.ts` | evidence axis exists; no work-market block linkage |
| Employer/company need fields | `components/app/demand-request-button.tsx`, `lib/demand/*` | structured fields (profession/country/accommodation) exist |
| Marketplace / opportunities / scouting | `dashboard/opportunities`, `dashboard/company/scouting`, `lib/visibility/*` | worker board + scouting previews; no offer/market object |
| Map / location signal | `lib/market-map/demand-locations.ts`, `lib/projects/location.ts` (#426) | signal-only doctrine established; no marketplace/atlas layers |
| Role wording | `lib/config/roles.ts`, `components/app/role-switcher.tsx` (#426) | person/company base identities; buy/sell/hire/agency are actions |
| Icons / cards / empty states | lucide glyphs + `card-border` system | consistent chrome; no per-domain visual system |

## 2. What duplicates / what misleads / what is missing

- **Duplication:** several parallel taxonomies (work-categories options, skill-names,
  new-skill-suggestions sectors). The atlas becomes the **one spine** they map onto —
  it does not delete them; it gives the market map + marketplace a single backbone.
- **Misleading terms:** none re-introduced — the #426 rules hold (no agency/buyer as
  identity; no internal terms in user copy; signal-only map).
- **Missing activities:** the product had no model for offers, accommodation, tools,
  transport, local services, brigade capacity, rate signals, action radar or
  opportunity gaps. The 28-block atlas adds all of these as first-class blocks.
- **Missing visuals:** no premium, unified per-domain visual concept system.
- **Missing map behaviour:** no zoom hierarchy (aggregate → location → object),
  no visibility scaling, no document/legal eligibility tie-in.

## 3. What this sprint changes NOW (this PR — pure model layer, no DB)

New `lib/work-market/`:
- `categories.ts` — the **28 high-level blocks**, each with slug, LT/EN labels,
  human-clear description, 5–15 subcategories, related skills, action mapping
  (dirbu/samdau/perku/parduodu/nuomoju/ieškau pagalbos), identity mapping
  (asmuo/įmonė/abu), `mapEligible`, `needsDocuments`, `brigadeCapable`,
  `rateSignalCapable`, icon concept.
- `actions.ts` — the 6 actions + identity rules (hire is company-only; person never
  gets a hire CTA). Reinforces #426: buy/sell/hire/rent/help are **actions**.
- `map-layers.ts` — 7 map signal layers; zoom hierarchy (far/middle/close);
  aggregate vs object "player" cards; **`canDrawMarker` only for verified
  coordinates**; aggregate cards never leak a personal address.
- `eligibility.ts` — document/legal readiness badges + foreign-work route policy
  (no documents abroad → never shown "ready abroad"; legal routes only).
- `visibility.ts` — scaling policy: full preview under 1000 active users; limited
  above; paid/verified widening is **inert until billing is live** (no fake unlock).
- `atlas.ts` — public assembly + lookups (by slug / action / identity / skill /
  map-eligible / rate-capable) and the recognition→atlas bridge.
- `visual-concepts.ts` — unified premium visual spec per block (icon / illustration /
  mini-card / map marker / badge) + forbidden clichés.

Guards: `work-market-atlas` (28 complete blocks, signal-only, honest eligibility +
visibility) and `no-external-names` (fails if a denylisted external name is committed).

## 4. What stays backlog (DB / migration work — RED, owner-gated, no apply here)

- **Marketplace offer object** (offer_type, owner identity, category, country,
  optional location/price, moderation_status, visibility) — RED schema plan.
- **Brigade availability** persistence (team size, skills, available from/to,
  countries, readiness) — RED schema plan.
- **Worker route-mode / preferred-countries** signal — reuse existing profile
  fields if they fit; otherwise RED draft.
- **Verified coordinates / geocoder** for real markers — owner-gated path only.
- **Accommodation / tools / local-services** persisted layers — signal-only first.
- **Trust badges + moderation queue** persistence — RED schema plan.
- **Rate/price** real-data aggregation — only from real signals.

## 5. PR plan (small PRs, no fake functions)

1. (this) **Atlas core + visual + map/eligibility/visibility models** + guards + audit.
2. Atlas → demand-form / worker-profile UI binding (read-only, no DB).
3. Market-map player-card / zoom hierarchy UI (signal-only).
4. Document/legal readiness badges on opportunity/map cards (reads existing data).
5. Marketplace offer model **RED schema plan** (no apply).
6. "Simple offer capture" UX shell (no publish without moderation model).
7. Marketplace signal-only map layer.
8. Brigade availability + accommodation/tools/local-services layer plans.
9. Trust badges + moderation queue (read model first).
10. Action radar + opportunity gaps from real counts.
11. Rate/price map policy (real data only).
12. Real-user launch readiness final smoke.

Every PR: typecheck · lint · test · build · public-seo-indexing · migration-safety ·
secret scan · no-fake-marker · no-external-map-key · **no-external-names** · atlas
consistency. No merge / deploy / apply without owner approval.
