# Player Card / CV identity surface — v1 (Sprint Train v2, Wagon 2)

Goal: make the **Player Card the single, consistent person-identity surface** —
"one person = one clear player identity" — using existing data only. Layer-0
(no DB/schema/RLS/RPC/Supabase/env/auth/billing change, no fake data).

## 1. Audit — duplicated / conflicting identity surfaces found

The person-identity logic was **mostly** already centralised, but the **initials /
avatar fallback** was implemented three different ways, and the **map own-marker**
visibly diverged from the Player Card:

| Surface | Component | Initials source | Avatar fallback style |
|---|---|---|---|
| Player Card (Mano CV / journal header) | `worker-player-card.tsx` | private `initialsOf` (2 letters, "•" fallback) | dark `bg-ink-700` tile + light initials |
| Profile avatar | `avatar-display.tsx` → `avatarMonogram` | canonical helper (2 letters) | dark `bg-ink-800` tile + initials |
| **Map own-marker** | `market-map/page.tsx` → `market-map-live.tsx` | **`ownName.slice(0,1)` — ONE letter** | **bright solid-cyan `#22D3EE` tile + dark initials** |

So "Jonas Petraitis" showed as **"JP"** on the card but **"J"** on the map, and the
map avatar was a bright cyan blob instead of the card's dark tile — the compact map
card read as a *separate popup*, not the same Player Card. (The dashboard `WorkCard`,
account email-only page, and profile lead remain intentionally distinct surfaces —
state-aware work card vs. premium identity card — not duplicates of the same concept.)

## 2. Changed surfaces (this PR)

- **New single source of person initials:** `lib/visual/avatar-monogram.ts` →
  `personMonogram(name)` — null-safe, neutral "•" fallback, built on the existing
  `avatarMonogram` (max 2 uppercase initials, deterministic). One function now feeds
  every person-identity surface.
- **Player Card** (`worker-player-card.tsx`): deleted its private `initialsOf`; uses
  `personMonogram(card.displayName)`. Behaviour identical, logic now shared.
- **Map own-marker initials** (`market-map/page.tsx`): `ownName.slice(0,1)` →
  `personMonogram(ownName)` — the marker now shows the **same two-letter monogram** as
  the card.
- **Map own-marker avatar fallback** (`market-map-live.tsx`): the solid-cyan tile →
  the Player Card's **dark ink-700 tile + light initials** (`#10131F` / `#E8EEF2`). The
  neutral cyan **ring** accent is preserved (silent-trust marker style unchanged).

Result: the map compact card reads as the **same Player Card** — same initials, same
avatar treatment — on desktop and mobile.

## 3. What the Player Card now represents

A compact person identity card answering, from existing data only:

- **Who** — avatar/photo (consented signed URL) or initials monogram; display name.
- **What they do** — profession label (real `professionSlug`) when set.
- **Where** — location / preferred-location signal (map surface) when set.
- **Current signals** — honest readiness met/total ring, declared/journal-supported
  skill counts, evidence entries, availability — each rendered only when really saved.
- **What's missing next** — readiness pillars not yet met.
- **On the map** — the same identity (avatar + name + availability) as the own-marker.

## 4. Data used (all existing, real)

- `getWorkerPlayerCard()` real worker dimensions (counts, profession, availability) —
  zero fabrication on error (returns 0/false/null).
- Consented avatar via short-lived signed URL (`getOwnAvatar`); initials otherwise.
- Map marker fed from the same profile name + avatar + real availability_status.

## 5. Intentionally NOT shown (would be fake)

- No synthesised face / placeholder avatar — initials only when no photo.
- No fabricated skills, location, CV, work record, availability, rating, or badge.
- No `confirmed / verified / proof / trust badge / employer verified / patvirtinta`
  wording on the self-view card or map marker (silent-trust rule; existing guards
  `today-screen-honesty`, `silent-trust-wording`, `verified-cv-honesty`,
  `player-card-unification` stay green).
- No raw skill slugs, raw i18n keys, raw IDs, or internal route names surfaced.

## 6. Map-card behaviour

Own-marker only (privacy: no other users' points, no fake markers). Avatar (52px) or
the **same monogram** as the card on a dark tile inside a neutral cyan ring; name;
real availability pill when set. No verified/confirmed badge.

## 7. Mobile behaviour

Identical identity logic — `personMonogram` is layout-independent; the Player Card
header and the larger 52px map marker both render the same initials/avatar treatment
on small screens (the marker was already sized up for mobile legibility).

## 8. Tests

- `lib/visual/avatar-monogram.test.ts` — `personMonogram` parity ("Jonas Petraitis" →
  "JP" = `avatarMonogram`), null/empty → "•".
- `lib/guards/player-card-identity-consistency.test.ts` — Player Card + map page use
  `personMonogram` (no private copy, no one-letter slice); identical initials; map
  fallback uses the dark Player-Card tile, not solid cyan; cyan ring preserved.

## 9. RED owner-gated items NOT started

- DB/schema/RLS/RPC/Supabase migrations; avatar storage/RLS changes; auth/profile
  ownership rules; public-search exposure; paid visibility; ratings/reviews;
  verification/approval authority model; map service/demand layers needing schema.

## 10. Follow-up (Layer-0, not in this PR — noted to avoid scope creep)

- Optional: pass a real localized **profession label** to the map marker (the marker
  already supports `professionLabel`; the page currently omits it) so the compact map
  card matches the card's subtitle too. Needs the localized profession label server-side
  on the map page; deferred to keep this PR focused on the initials/avatar unification.
- Four non-identity admin/list views (`projects/[id]`, `agency/pool`, `admin/matching`,
  `project-assignment-manager`) still carry their own `initialsOf`; they are management
  lists, not the person's own identity surface — safe to migrate to `personMonogram`
  later, out of Wagon-2 scope.
