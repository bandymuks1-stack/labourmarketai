# Player Card — Minimum Contract v1

Status: **binding foundation** (not a finished feature). This document fixes the
*minimum* person-identity a user may be shown so that (a) no one looks like an
empty account, (b) the same identity is reused across every surface, and (c) the
next implementation slices cannot drift into a disconnected subsystem or fake
profile signals.

It is paired with two code artifacts:

- `apps/web/lib/identity/player-card-minimum.ts` — the pure field contract
  (`buildPlayerCardMinimum`, `PLAYER_CARD_MIN_FIELDS`).
- `apps/web/lib/identity/player-identity.ts` — the existing **visual** identity
  foundation (monogram, fallback tile, avatar scale, variant taxonomy). The
  field contract depends on the visual one, so the two stay **one identity**.

This PR adds the contract only. It does **not** build CV parsing/import, an AI
extraction pipeline, matching/ranking, or any new RPC. Those are later slices.

---

## 1. Audited identity surfaces (today, in source)

| Surface | File | Identity shown today |
| --- | --- | --- |
| Worker player card (dashboard self-view) | `components/app/worker-player-card.tsx` | avatar/monogram, name, profession, readiness, skills, availability — real counts only |
| Shared avatar | `components/app/avatar-display.tsx` | photo (signed URL) or honest initials monogram |
| Profile avatar upload | `components/app/profile-avatar.tsx` | owner avatar upload + monogram fallback |
| Profile / CV area | `components/app/profile-hub-overview.tsx`, `cv-preview.tsx`, `capability-profile-section.tsx` | name, profession, skills, profile text, work record |
| Marketplace requester tile | `components/app/marketplace-loop-section.tsx` | requester **display name only**, via provider-scoped RPC (#531) + initials |
| Market map signal | `components/app/market-map-signal-layer.tsx` (+ model) | aggregated/own signals; exact identity gated by existing permissions |
| Visual foundation | `lib/identity/player-identity.ts` | canonical monogram, fallback tile, avatar scale, 7 variants |

**Reusable fields already available (no new data needed):** avatar
(`profiles.avatar_url`, signed), display name (`profiles.full_name` → email
local-part fallback), headline (primary profession label / `active_role`),
location signal (`profiles.country`), skills (`worker_skills` declared +
manager-confirmed subset), about (`profiles.profile_text`).

**Missing / not yet wired:** a single shared *minimum* view-model reused by all
surfaces (each surface assembles identity ad hoc today); a profile-completion
surface that lists missing essentials honestly.

---

## 2. Minimum Player Card fields

Canonical, ordered (`PLAYER_CARD_MIN_FIELDS`):

| Field | Source (existing) | Fallback | Present when |
| --- | --- | --- | --- |
| `avatar` | `profiles.avatar_url` (signed URL) | honest initials monogram (never a synthesised face) | a real avatar URL exists |
| `name` | `profiles.full_name` | email local-part → surface i18n neutral label ("Member") | a real `full_name` is saved |
| `headline` | primary profession label / `active_role` | none (hidden when absent) | a real headline value exists |
| `location` | `profiles.country` (or area signal already visible to viewer) | none (hidden when absent) | a real location signal exists |
| `skills` | `worker_skills` declared (+ verified subset) | plain `0` (never hidden, never inflated) | declared count `> 0` |
| `about` | `profiles.profile_text` | none (hidden when absent) | a real about text exists |

`displayName` may fall back to the email local-part **for rendering only**;
`name` still counts as *missing* for completion until a real `full_name` is
saved. `initials` is always safe (`"•"` when there is no name).

## 3. Fallbacks (honest, never fake)

- Avatar absent → initials monogram on the shared fallback tile.
- Name absent → email local-part for display; surface applies its own i18n
  neutral label when even that is absent.
- Headline / location / about absent → the field is simply **not rendered**.
- Skills absent → a plain `0`, shown with a gentle next step, never inflated.

## 4. Forbidden fake signals

No fake avatar/face, no fake skill, no fake role/headline, no fake location, no
fake score, no fake badge, **no completion percentage** (only the concrete list
of missing essentials), no demo/preview/coming-soon language, and no external /
competitor product names. The contract builder enforces this by construction:
missing input → `null` / `0` / `[]`, reported in `missing`.

## 5. Allowed surfaces for reuse

`dashboard` · `profile / CV area` · `marketplace identity tiles` (only the
fields already legally/readably available there — today: display name) · `map`
minimal identity surface (only where existing permissions already allow it).
A surface adopts the contract; it never forks a parallel identity model.

## 6. Non-scope for this PR

No DB / migration / RLS / RPC change. No new provider-display RPC. No CV
parser/import, no AI extraction, no matching/ranking/top-3. No payment / admin /
onboarding work. No marketplace behaviour change. This PR is the contract +
guard + doc foundation only.

## 7. Recommended next implementation slices

1. **Profile completion surface** — render `missing` from the contract as honest
   next steps (no percentage).
2. **Minimum Player Card component reuse** — one component consuming
   `buildPlayerCardMinimum`, adopted on dashboard + profile/CV first.
3. **CV upload / import entry** — entry point only (still no parser engine).
4. **Map / marketplace identity reuse** — adopt the contract where current
   permissions already allow it (RED for any *new* cross-user identity read).
