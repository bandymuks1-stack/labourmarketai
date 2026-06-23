# Full Project Reality Audit — Labour Market AI (v1)

Audit-only. No product code, deploy, DB, or env changes were made. Branch:
`docs/cc/full-project-reality-audit-v1` off `main` @ `bccaf53`. Method: read the
code + the ~250 binding guard tests, run typecheck/lint/test/build, and run a
read-only production route smoke. Authenticated UI was not opened (no local auth
env / Docker); dashboard reality is established from code + guards + 307 smoke.

## Executive summary

**Overall readiness: READY_WITH_LIMITATIONS.**

The product is honest and largely real: every visible active surface audited is
backed by a real server action / RPC / RLS-scoped table, and a large guard suite
(4852 tests green) actively blocks fake AI, fake verification, fake scores, dead
CTAs, env/API leak copy, and old-name leaks. The blockers are *missing* pieces
and a few *deliberately dormant* surfaces — not fake/broken ones.

### Top 5 things that really work
1. Public marketing + nav/footer: 15/19 pages fully real, no dead links, no
   forbidden copy (guard-enforced).
2. Auth + onboarding: Google OAuth + email/password, role pick (worker/company),
   `complete_onboarding` RPC creates the worker/org and routes to the right
   dashboard.
3. Worker profile + player card + readiness: real DB-backed counts, honest
   evidence ladder (self-declared → journal-supported → manager-confirmed), no
   fake score; each missing readiness item links to its completion step.
4. Work Journal (PR #485): real entry create/supersede, cross-sector extraction
   (existing vs new skills, performed activities, evidence source `work_journal`,
   `unverified`), real photo compression + storage with honest degradation.
5. Market Map (PR #484): provider-free — browser geolocation + manual
   country/city/region/radius + localStorage; no Google/tiles/key; honest panel.

### Top 5 blockers / missing pieces
1. **P1 — Profile photo / avatar upload does not exist.** PR #484 added photo
   compression to the journal + buyer attachments only; there is no profile
   avatar field/upload. Identity/trust surface is incomplete.
2. **P1/P2 — Matching engine is dormant.** Scouting/shortlist UI is real and
   signal-driven, but no active matching runs (per a convergence decision). A
   company gets fit-context per demand, not a populated candidate stream.
3. **P2 — Legal pages are placeholders.** `/legal/{terms,privacy,cookies,
   marketplace-rules}` render a visible "Draft note" placeholder — fine for now,
   a launch/compliance blocker for selling.
4. **P2 — Booking persistence is migration-gated** (state machine is real/pure;
   the row store is not applied), so booking is not yet an end-to-end flow.
5. **P2 — RU is Tier-2 (AI-seeded, pending human review)**; LT/EN are Tier-1.

### Top 5 visible junk / confusion risks
1. Legal placeholder pages are publicly reachable (`/lt/legal/terms` → draft
   notice). Honest, but reads as unfinished.
2. "Coming soon / Netrukus" on non-Baltic country pages (honest, but no ETA).
3. `/vision` is intentionally gated (noindex + "internal preview" banner) yet
   directly reachable by URL.
4. Onboarding "next steps" are labelled preview/concept — verify the
   `auth.onboarding.nextSteps.*` keys are present in LT/EN/RU (no MISSING_MESSAGE).
5. Matching being dormant can read as "empty" to a company without a clear
   "matching not active yet" explanation on every relevant surface.

No fake-AI claims, no fake "verified", no dead buttons, no broken links, no raw
env/API/Google text, and no old "LABMA" leak were found in user-facing copy.

## What really works

| Area | Evidence | Status | Notes |
| --- | --- | --- | --- |
| Marketing pages (15/19) | `(marketing)/*` real heros/cards; smoke 200 | WORKS | for-workers/companies/agencies, pricing, professions, skills, work-*, vision(gated), labour-market |
| Nav + footer | `layouts/site-nav.tsx`, `site-footer.tsx` | WORKS | all links routable, no dead links |
| Forbidden-copy guards | `product-copy-forbidden-terms`, `no-fake-outcome-claims`, `public-no-fake-claims`, `whole-labour-market-copy` | WORKS | demo/guarantee/fake-count/verified-overclaim banned in CI |
| Auth (Google + email) | `auth/login`, `signup`, `auth/callback/route.ts` PKCE | WORKS | onboarded check + safe `?next` redirect |
| Onboarding | `onboarding-wizard.tsx`, `lib/auth/actions.ts` `complete_onboarding` | WORKS | role → worker/org row → role dashboard |
| Profile skills/availability | `dashboard/profile/page.tsx`, `worker_skills` | WORKS | source + verified columns, evidence tiers |
| Player card + readiness | `lib/player-card/*`, `worker-readiness-panel.tsx` | WORKS | `safeCount`, signal ring (not a score), actionable steps |
| Honesty guards (profile) | `profile-skill-claims`, `worker-player-card-honesty`, `evidence-status-honesty`, `confirmation-honesty` | WORKS | self-declared never "verified"; confirmer = manager/owner/external |
| Work Journal create/edit | `dashboard/journal/page.tsx`, `journal-entry-composer.tsx` | WORKS | create + supersede RPC; unconfirmed-only edit |
| Cross-sector extraction (PR #485) | `universal-recognition.ts` DOMAIN_SECTOR, `work-entry-skill-review.tsx` | WORKS | existing/new/activities/evidence/unverified, 14 domains, no construction-only |
| Photo compression + upload (PR #484) | `lib/browser/image-compress.ts`, `lib/journal/photo-upload.ts` | WORKS | resize ≤1920/0.82, EXIF, never inflate; storage RPC + 1-photo limit; honest not-ready |
| Market Map provider-free (PR #484) | `market-map-base.tsx`, `lib/location/*` | WORKS | geolocation + manual country/region/radius + localStorage; no Google/tiles/key |
| World map / owner signals | `labour-market-world-map.tsx`, `market-map-shell.tsx` | WORKS | RLS owner signals, honest empty states, no fake markers/coords |
| Company demand intake | `lib/demand/demand-drafts.ts`, `demand-request.ts` (customer_requests) | WORKS | save/submit RPCs, taxonomy-validated, no AI claims |
| Communication v1 | `dashboard/communication/page.tsx`, conversations + RLS | WORKS | read-only thread list, honest empty state, no "contact unlocked" |
| Invitations → membership | `lib/worker/invitations.ts`, `accept_*_worker_invitation` RPC (0036) | WORKS | acceptance creates visible `company_workers` row, idempotent |
| Engagement-context bridge | `company-workers.ts`, RPCs 0032/0033 | WORKS | gates review; visible per-row; no ghost membership |
| Admin gating | every `dashboard/admin/**` `requireSuperadmin`; `admin-visibility` guard | WORKS | no admin links leak to normal users; graceful degradation |
| Code health | typecheck ✅ lint ✅ tests ✅ 4852 build ✅ | WORKS | see Validation log |

## What works partially

| Area | What works | What is missing | Risk |
| --- | --- | --- | --- |
| Matching / scouting | Real signal-driven fit per demand; anonymized preview; no fake score | No active matching engine populating candidate streams (dormant by decision) | Company sees little until they act; can read as "empty" |
| Booking | Pure state machine; only-worker-accepts; no PII | Persistence migration-gated (not applied) → not end-to-end | Booking not yet a real round-trip |
| Legal pages | Routes exist, honest draft notice | Actual Terms/Privacy/Cookies/Rules content | Compliance blocker for sales/launch |
| RU locale | Full key parity, no empty values | Human review (Tier-2 AI-seeded) | Copy quality risk in RU |
| Onboarding next-steps | Step list renders, marked preview/concept | Confirm `auth.onboarding.nextSteps.*` keys exist in LT/EN/RU | Potential MISSING_MESSAGE if a key is absent |

## What does not work / is not connected

| Area | Visible surface | Missing backend/logic | User impact | Priority |
| --- | --- | --- | --- | --- |
| Profile photo | (none — no avatar control exists) | `profiles.avatar_url` + storage + upload UI | No profile photo; weaker identity/trust | P1 |
| Active matching | Scouting page renders fit context | No engine populating matches | Company shortlist feels sparse until they scout manually | P1/P2 (product decision) |
| Booking round-trip | Propose-booking button (gated) | `booking_requests` migration not applied | Booking can't complete | P2 |

No "active UI surface whose backend is missing while pretending to work" was
found — dormant/early surfaces degrade honestly (empty states, draft notices,
"not-ready").

## Visible junk / fake / placeholder / technical text

| Route/component | Problem text/state | Why bad | Fix recommendation |
| --- | --- | --- | --- |
| `/lt/legal/{terms,privacy,cookies,marketplace-rules}` | `<Placeholder>` "Draft note" | Reads unfinished; not compliant | Write real legal content; promote placeholders |
| `/lt/labour-market` non-Baltic rows | "Netrukus / Coming soon" | Honest but no ETA/roadmap | Add roadmap or keep (acceptable) |
| `/vision` | Reachable by URL, "internal preview" banner | Gated page still hits by direct link | Keep noindex; optionally 404 when gated |
| Onboarding next-steps | Marked "preview/concept" | Fine if keys exist | Verify LT/EN/RU `nextSteps.*` keys |
| `market-counters` / `live-ticker` (landing) | Governed placeholders, marked `sample` | Acceptable (doctrine §18) | None — keep the visible `sample` affordance |

No env/API/Google text, no `NEXT_PUBLIC_*`, no "API key missing", no "demo",
no fake "verified/guaranteed", no "LABMA" found in user-facing copy.

## End-to-end workflow reality

1. **Worker: profile → skills → journal → photo → evidence/readiness.**
   Works today. Sign in (Google) → onboarding (role + name + country) → profile
   (skills/availability) → journal entry (cross-sector suggestions, accept →
   self-declared) → optional photo (compressed, 1 free) → readiness ring updates
   with actionable links. *Gap:* no profile avatar. *No fake step.*
2. **Company: need → structured → matching/scouting list.**
   Partial. Need intake is real (customer_requests via RPC). Scouting shows real
   per-demand fit, but there is no active matching feeding a stream — the company
   must drive it. *Stuck point:* sparse results without a clear "matching not
   active yet" note on every surface. *No fake AI.*
3. **Location / market map.** Works (provider-free): automatic geolocation or
   manual country/region/radius, saved on-device, usable for search with no key.
4. **Communication / request.** Works at v1 (real conversations, RLS). Booking
   persistence is migration-gated → not a full round-trip yet.
5. **Organization / team / invitation.** Works: acceptance creates a visible
   membership row + (optional) engagement context for review; no ghost state.

## Priority fix plan

- **P0 (trust/product blockers):** none found. (No fake claims, no dead CTAs, no
  leaked env/API text, no admin leak, no ghost membership.)
- **P1 (core usability blockers):**
  - Profile **avatar upload** (add `profiles.avatar_url` + storage + UI; reuse
    the existing client image-compress).
  - Decide + signpost **matching**: either activate a basic matcher or add a
    clear "matching not active yet" note wherever a company expects candidates.
  - Verify onboarding `nextSteps.*` i18n keys exist in LT/EN/RU.
- **P2 (polish/clarity):**
  - Real **legal** content (Terms/Privacy/Cookies/Marketplace Rules).
  - **RU** human review pass (Tier-1).
  - **Booking** persistence migration (owner-gated) to close the round-trip.
  - `/vision` direct-URL behaviour (keep noindex; optionally 404 when gated).
  - "Coming soon" country roadmap clarity.
- **P3 (later):** richer location visual (open-source MapLibre/OpenFreeMap later,
  documented only); matching explanation depth.

## Validation log

- Branch/SHA: `docs/cc/full-project-reality-audit-v1` @ base `bccaf53` (== `main`).
- Working tree: clean before this doc; only this audit file added (docs-only).
- `pnpm -F web typecheck` → **pass**.
- `pnpm -F web lint` → **pass** (0 warnings).
- `pnpm -F web test` → **pass, 4852 / 4852**.
- `pnpm -F web build` → **pass**.
- `migration-safety` → N/A here (docs-only branch has no migration diff vs main;
  it passed on PR #484 and PR #485 at merge).
- Production smoke (read-only, no private data): `/lt` `/en` `/ru` → 200;
  `/lt/auth/login` → 200; `/lt/for-workers|for-companies|for-agencies|pricing|
  vision|labour-market|legal/terms` → 200; `/lt/dashboard/{journal,market-map,
  profile}` → 307 → login (correct auth-gating). No 404/500.
- Limitations: authenticated dashboard UI not opened (no local auth env / Docker
  down); dashboard reality is inferred from code + guard tests + 307 smoke, not
  from live authenticated screenshots. No fake screenshots were produced.

## Final recommendation

- **Invite real users now?** Yes, for the **worker** journey (profile → journal →
  evidence/readiness → provider-free location) as a guided pilot — it is real and
  honest. Set expectations that matching is not yet active and there is no profile
  photo yet.
- **Sell/demo safely now?** Partially. Demo the worker journey and the honest
  evidence/cross-sector story. Do **not** sell on "matching/candidate stream" or
  "booking" as live, and finish legal content before any paid sale.
- **Fix before wider launch:** profile avatar (P1), matching activation or clear
  signposting (P1), legal content (P2), booking persistence (P2), RU review (P2).
- **Must not be shown as "live" yet:** active matching/candidate stream, booking
  confirmation, and legal pages as final — until each is connected/written.