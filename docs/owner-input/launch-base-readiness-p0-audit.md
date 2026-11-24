# Launch-base readiness P0 — audit + fixes

> One coherent P0 sprint: audit the real authenticated flows first, then ship
> only the safest UI/flow fixes in one PR. **No DB/schema/migrations/RLS/
> Supabase/env/DNS/billing/payment changes. No fake data.** Everything not safe
> to fix now is documented RED (owner-gated).

## Legend
- 🟢 GREEN — works / safe and verified.
- 🟡 YELLOW — works but incomplete or unclear; safe partial fix applied or copy added.
- 🔴 RED — missing; needs backend/schema/RLS/billing → owner-gated, NOT faked.

## 1. Routes, nav, dropdown, CTAs — 🟢 GREEN (no dead links)
Verified every navigation target resolves to a real page file / action.

- **Top nav** (compact, map-first): Mano erdvė → `/dashboard` · **Žemėlapis → `/dashboard/market-map`** · Žinutės → `/dashboard/communication` · Nustatymai → `/dashboard/account` · Admin (admin-only) → `/dashboard/admin`. All exist. 🟢
- **Account dropdown** (`account-menu.tsx`): Skills → `/dashboard/profile#candidate-skills` · Projects → `/dashboard/projects` · Instructions → `/dashboard/instructions` · Bookings → `/dashboard/bookings` · Account → `/dashboard/account` · Sign out → `POST /auth/logout`. All exist. 🟢
- **Dashboard CTAs** (IdentityActions/WorkCard/chain): profile, opportunities, market-map, documents, communication, journal, company, candidates, projects, buyer, start/company, account — all resolve. 🟢
- **Market-map / Profile / Mano CV / Communication / Account** page CTAs: all internal links + anchors resolve. 🟢
- **47 dashboard routes** enumerated; all have a `page.tsx`. No RED dead link found.

## 2. Map "why it exists" + identity marker — 🟡→🟢 (fixed)
- Before: the map showed a **plain cyan dot** for the user's location; the page didn't strongly explain why the map exists.
- **Fix (this PR):**
  - **Premium identity marker** — the plain dot is replaced by a player-card-style pin showing the user's **own real avatar (or initial) + name** at their **own** chosen location. Falls back to the dot when no name is set. **No other users, no fake markers.** (`market-map-live.tsx`, threaded from the server page via real `profiles.full_name` + `getOwnAvatar()`.)
  - The **layers legend** (added previously) states why the map exists: "visible now" (the user's real location signal) vs disabled "future layers" (companies, teams, opportunities, work needs, services, rentals, shops, availability, trust) — honest, no fake data.

## 3. Premium / visual — 🟡 partial
- The map now reads as a workspace (identity pin + legend), not a plain embedded map. 🟢 for the map.
- Broader "admin-template" feel across all pages is a larger design pass; not attempted wholesale in a safe P0 (high regression risk). Inner-page compression from prior PRs remains. 🟡 (follow-up).

## 4. Demand / request lifecycle — 🟡 (status copy added) + 🔴 (edit/close)
Canonical table `customer_requests` (status: draft→submitted→in_review→needs_followup→approved→closed).
- CREATE (draft + submit): 🟢 `saveDemandDraft` / `submitDemandRequest`.
- VIEW / read-back: 🟢 `listOwnCustomerRequests` → `DemandRequestsReadback` (shows real status).
- **DELETE DRAFT:** 🟢 exists (`deleteDemandDraft`, draft → closed) via the draft form.
- **EDIT submitted:** 🔴 MISSING — no user-facing edit action/RPC.
- **CLOSE / CANCEL submitted:** 🔴 MISSING — status promotions are admin-only; a non-admin owner cannot close/cancel.
- **Fix (this PR):** added an honest **"what you can do next"** line to the read-back: drafts can be deleted; submitted requests are in manual review and **self-serve editing/closing is not available yet**. The real fix (an owner-scoped `update`/`close` RPC + UI) is **RED, owner-gated** (RPC + RLS).

## 5. Messages — counterpart + context — 🟢 already honest + 🔴 (real identity/context needs RLS/schema)
- Conversation **list** and **thread** already render **honest** labels: support threads show the support label; direct/team threads show "counterpart unspecified" (italic) rather than a fake name. **No fake participants, no fake delivered/read states.** 🟢 (honest).
- **Counterpart real identity:** 🔴 the list/thread do NOT join `conversation_participants → profiles`; the code comment marks this a deliberate "missing bridge". Showing the real co-participant name needs an **RLS policy / SECURITY DEFINER read** (a participant cannot currently read a co-participant's profile) → owner-gated.
- **Source/object context:** 🔴 NOT IN SCHEMA — `conversations` has only `subject` (free text) + `kind`; there is no typed link to a demand / CV / company / map signal. Linking a conversation to its source object needs a schema column (e.g. `context_type` + `context_id`) → owner-gated.
- **Fix (this PR):** none risky — the surface is already honest. The two gaps above are documented RED.

## 6. Contact flows — 🟡 (some wired) + 🔴 (stranger contact)
Conversation creation path: `getOrCreateDirectConversation` (dedupes 1:1). Wired contact actions:
- Worker → their employer (own profile): 🟢 `MessageButton`.
- Company → linked roster worker: 🟢 `MessageButton`.
- Demand scouting → shortlisted worker: 🟢 `RequestCommunicationButton`.
- **From map marker:** 🔴 none.
- **From CV / player card:** 🔴 none.
- **From a general demand row / company browse:** 🔴 none.
- Reason the missing ones are RED: contacting an **arbitrary** worker/company/person needs a **contact-permission model** (RLS currently allows conversations only between already-related parties). Adding a CTA without that would be a dead/blocked button → **not added** (no fake CTA). Documented RED.

## 7. Account dropdown discoverability — 🟡 documented (no fake badge)
- The dropdown items are real and route correctly, but there is **no real per-item "new / action-needed" signal** wired to those items (unread **conversations** already drive the **Žinutės** nav badge, not a dropdown item).
- Per the no-fake rule, **no badge/pulse was added** — a badge with no real backing count would be fake. Surfacing a real action indicator (e.g. pending bookings / invitations) on a dropdown item is a small follow-up that first needs a real per-item count wired. 🟡 (documented; intentionally not faked).

## 8. Skill extraction (new + old text, non-construction) — 🟢 (with one gap fixed)
- The recognizer `extractJournalSuggestions` / `recognizeSkills` is a **pure function over text** (tiered exact > synonym > fuzzy, LT/RU/EN). The Mano CV page runs it **live per existing entry** (`extractJournalSuggestions(e.original_text)`), so **old entries' text IS recognized at render — no backfill needed** for recognition. 🟢
- Probe across the requested sectors (modern phrasing + terse "old-entry" phrasing):
  - construction 🟢 · driving 🟢 · IT/programming 🟢 · sales/cashier 🟢 · study/training 🟢 · AI/tools 🟢 · gardening/cooking/warehouse 🟢 · terse old-style entries 🟢.
  - **communication/oratory** was the one **gap** (generic "komunikacija/bendravimas" matched, but presentation / public-speaking / negotiation / oratory vocabulary did not).
- **Fix (this PR):** extended the existing **"Komunikacija"** capability lexicon with presentation / public-speaking / negotiation / oratory needles (LT/EN/RU). Safe — maps to an existing review-only label, **no new taxonomy slug, no schema**. After the fix all listed sectors recognize.
- Note: recognition is **suggestion-only** (the worker confirms each before it persists, §7) — never auto-asserted.

## 9. Mobile + desktop quick check — 🟢 (unauthenticated route smoke)
- Authenticated rendering can only be reviewed by the owner on production (preview auth is out of scope). Unauthenticated route smoke confirms all P0 routes resolve (200 / correct auth-gate 307). The map marker, demand copy, and recognizer changes are covered by typecheck + the guard suite (5081 tests green).

---

## What this PR fixes (safe)
1. **Map identity marker** — premium avatar/initial + name pin at the user's own location (real data; dot fallback). 🟢
2. **Skill recognition gap** — communication/oratory now recognized (lexicon only). 🟢
3. **Demand read-back** — honest status + "what you can do next" copy (drafts deletable; edit/close not self-serve yet). 🟡→clearer.

## What remains RED / owner-gated (not faked)
- Demand **edit / close / cancel** of a submitted request — needs an owner-scoped RPC + RLS.
- Messages **real counterpart identity** — needs a co-participant profile read (RLS / SECURITY DEFINER).
- Messages **source/object context** — needs a schema link (`context_type` + `context_id`) on `conversations`.
- **Contact from map / CV / general browse** — needs a contact-permission model (RLS) for non-related parties.
- Account-dropdown **action indicator** — needs a real per-item count wired before any badge.
- Broader **premium visual** pass beyond the map.
