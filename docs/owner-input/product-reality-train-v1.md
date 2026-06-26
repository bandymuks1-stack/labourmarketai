# Product Reality Train — v1

**Type:** planning / audit only. **No code, no migrations, no provider/DNS/env/billing/auth-core/RLS/Supabase changes, no merge, no deploy.**
**Baseline:** production `main` = `d57233fbece1ea7140315f830baddf7d683c5b2a` (post-#509).

## Live state after #509 (what is already real)
- Action-first IA live; primary nav = **Mano erdvė · Žemėlapis · Darbo žurnalas · Žinutės**.
- Profile / CV / player-card unified under Mano erdvė + journal logic (player-card redirects → journal).
- Stale wrong skill chips **hidden/collapsed** in UI (no DB change).
- Approval **contradiction hidden** (buttons gone on permission denial) — but real permission alignment still pending.
- Map own-marker stronger, **real data only**.
- Communication **restricted-counterpart** state live (honest "Recipient details are not shown yet").
- No DB/RLS/schema change in the recent trust slices.

This train is the ordered backlog of what remains to make every visible promise *actually real*. Each wagon below is self-contained; the sequence and gates are in the summary section.

---

## Wagon 1 — Login Branding

- **Purpose:** the external sign-in screen must show only the product name, never a backend host / project ref.
- **User-facing outcome:** "continue to **Labour Market AI**" on Google sign-in; address-bar host is a product domain, not `<project-ref>.supabase.co`.
- **Current state:** the visible name is **provider config**, not app code. App brand is already correct (`lib/seo/metadata.ts` `BRAND_NAME = "LabourMarket.ai"`; auth header `app/[locale]/auth/layout.tsx`). #509 added guard `lib/guards/public-brand-name.test.ts` (no `*.supabase.co` host as a visible name on auth surfaces). The only repo references to the project ref are `lib/env.ts:15` (build-time env default — not UI) and the **admin-gated** `dashboard/admin/project-truth` diagnostic (`requireSuperadmin`).
- **Required code changes:** none for the visible fix. *Optional, separate, low-priority:* stop hardcoding the project ref as the `env.ts` default (auth-infra — out of scope for this train; only if the owner later authorizes an auth-infra slice).
- **Required DB/RLS changes:** none.
- **Required external config (owner dashboard — private section):**
  1. **Google Cloud Console → APIs & Services → OAuth consent screen** → set *App name* = **"Labour Market AI"**; set support + developer-contact email; (optional) upload logo. This is the "continue to X" text.
  2. **Supabase → Authentication → URL/Custom domain** → configure a **custom auth domain** (e.g. `auth.labourmarket.ai`), then add the matching **DNS CNAME** at the registrar so the OAuth redirect host is the product domain instead of `<project-ref>.supabase.co`. Update the provider's allowed redirect URIs accordingly.
- **Risks:** misconfigured redirect URI can break sign-in → must be validated on a preview/staging credential first. DNS propagation delay.
- **Owner approval gate:** owner performs the two dashboard actions; agents must **not** touch provider settings, DNS, or env.
- **Test/smoke plan:** after owner change — sign in with Google, confirm consent screen says "Labour Market AI", confirm the address-bar host during redirect is the product domain, confirm callback completes to `app.labourmarket.ai/.../auth/callback`. The repo guard already prevents a host string from re-entering auth UI.
- **PR size:** none (owner action) — or a tiny docs/guard PR if any copy needs touching.
- **Must not be faked:** never relabel the backend host as the brand in code to "hide" it; the real fix is provider config.

---

## Wagon 2 — Approval Permission

- **Purpose:** a company leader/director can actually approve relevant employee/company journal entries (today the contradiction is only *hidden*).
- **User-facing outcome:** a manager sees in the inbox only entries they can truly act on, and approve/confirm/reject succeed.
- **Current state (the real mismatch):**
  - **List** check — `reviewable_journal_entry_ids()` (migration `20260530140000_membership_engagement_reroute.sql`) lists an entry when `is_admin() OR manages_organization(org)` + `journal_review_enabled` + no existing confirmation. `manages_organization()` is a boolean.
  - **Action** check — `review_journal_entry` / `confirm_entry_and_verify_skills` RPCs re-check `manages_organization()` **and then additionally** require an active reviewer engagement row (`engagement_contexts` with `relationship_slug in ('manager','owner','external_manager')`, `status='active'`) → else `no_reviewer_engagement` / `not_authorized`.
  - **Mismatch:** an entry can be **listed** (boolean passes) but the **action** fails the stricter engagement lookup → previously "Approve" next to "Neturite teisės". #509 hid the buttons on denial (`canAct = !done && !permissionBlocked` in `journal-inbox-entry.tsx`); the underlying list↔action gap remains.
- **Required code changes:** UI already reconciled. Real fix is at the data layer (below) plus optionally surfacing a distinct reason ("your manager engagement is inactive" vs "not your organization").
- **Required DB/RLS changes (RED — owner-gated):** align the **list** with the **action** — make `reviewable_journal_entry_ids()` apply the **same** active-reviewer-engagement gate the action uses (so listed ⇒ actionable). A new timestamped migration that `CREATE OR REPLACE`s the function (no table/column change, no RLS loosening). Must ship reversible (replace-back).
- **Required external config:** none.
- **Risks:** over-tightening could hide entries a legitimate reviewer should see; under-tightening re-creates the contradiction. Engagement data quality (are real directors represented as `manager/owner/external_manager` + `active`?) must be verified first via an authorized read.
- **Owner approval gate:** RED — draft PR + `needs-human-gate`; owner approves the exact SQL; prod apply via Supabase MCP `apply_migration` after approval (never `db push`).
- **Test/smoke plan:** unit/guard test that the list-RPC and action-RPC share one engagement predicate (assert via a SQL contract test / fixture); manual: a real director account sees + approves an employee entry end-to-end; a non-manager sees neither buttons nor the entry.
- **Rollback plan:** `CREATE OR REPLACE` the function back to the prior body (kept in the PR description); no data migrated, so rollback is instant and lossless.
- **PR size:** small (1 function migration + 1 contract test + reason-copy tweak).
- **Must not be faked:** no client-side "approved" state without the server confirmation row; no widening RLS to `using (true)`.

---

## Wagon 3 — Stale Skills Cleanup

- **Purpose:** purge the **persisted** wrong skill links (older recognizer) that the UI now only hides.
- **User-facing outcome:** old entries carry only skills their text supports; nothing stale lingers in the data behind the collapse.
- **Current state:** wrong links live in `journal_entry_skills`. `lib/journal/entry-skill-source.ts` classifies them `stale_needs_review` at render and #509 collapses them; **no provenance column exists** and the rows persist. The live recognizer is **deterministic, no fake AI** (`lib/structuring/skill-recognition.ts` tiered exact→synonym→fuzzy; `keywords.ts` `SKILL_HINTS_LT`); for "Dirbau su svetainės dizainu 9 h" it now returns **0 construction slugs**.
- **Stale-link criteria (proposed):** a `journal_entry_skills` row is *stale* when, for its entry's current `original_text`, the skill is **not** `recognized_from_text` (current recognizer) **and not** `confirmed_by_person` (`worker_skills.verified`) **and** the skill **is** in the recognizer vocabulary (`recognizable`) — i.e. exactly the `stale_needs_review` class, computed the same way the UI already does.
- **Required code changes:** a **dry-run report script** (read-only) that recomputes the classification across entries and outputs counts + sample rows — **no writes**. (Lives under `scripts/`, run locally against an authorized connection; not a product code path.)
- **Required DB/RLS changes (RED — owner-gated):** after the report is reviewed, an owner-approved cleanup that **deletes only** the confirmed-stale `journal_entry_skills` rows (never confirmed/verified, never recognized). Reversible via a pre-delete backup table/export. **No deletion without the report; no production mutation without explicit owner approval.**
- **Required external config:** none.
- **Risks:** deleting a row a worker *intended* as a manual link → mitigated by excluding any `recognizable=false` (honest manual) and any verified/recognized row, and by the backup. Recognizer drift could reclassify later → the criteria are conservative (only delete recognizer-known-but-unsupported).
- **Owner approval gate:** RED — report first; owner reads counts/samples; owner explicitly approves the delete set; prod runs via Supabase MCP after approval.
- **Test/smoke plan:** unit test the report's classifier == the UI's `classifyEntrySkillSource`; dry-run on an authorized non-prod/preview branch DB; spot-check the "svetainės dizainu" entry shows zero links after cleanup; confirm verified/recognized links untouched.
- **Rollback plan:** restore from the pre-delete backup table/export.
- **PR size:** small (report script + test) for the dry-run; a second tiny RED PR for the approved delete.
- **Must not be faked:** no blind `DELETE`; no deletion of verified or text-supported links; no silent mutation.

---

## Wagon 4 — Contact Permission + Counterpart Identity

- **Purpose:** if a conversation is allowed, the user must know who they talk to; if no contact permission exists, normal conversation must not exist.
- **User-facing outcome:** real counterpart name/avatar in allowed threads; honest restricted state where identity can't be revealed; no conversation surface at all where there's no permission.
- **Current state (model audit):**
  - Tables (`0021_communication.sql`): `conversations` (`created_by`, `kind` direct|support|team), `conversation_participants` (`profile_id`, `revoked_at` from `20260612170000`), `conversation_messages` (append-only). RLS is **default-closed**: select/insert gated by `is_conversation_participant()` (SECURITY DEFINER) + creator/admin; messages require sender = participant; anon has zero privileges.
  - Contact gate (`lib/communication/communication-eligibility.ts`, `request-worker-conversation.ts`): a company→worker thread is allowed only via **demand ownership + shortlist + worker contactable**; outcomes `allowed | not_owner | not_shortlisted | not_contactable`. There is **no general stranger-contact bridge** (intentionally absent).
  - Identity (`lib/communication/conversation-display.ts`): RLS scopes the conversation but **does not join the co-participant's `profiles` row**, so direct/team threads render **restricted** ("Recipient details are not shown yet"); support threads render known; blocked → `notFound()`.
  - **UI states A/B/C all already exist**: A known (support), B allowed-but-restricted (direct/team, Lock chip), C blocked (RLS 404).
- **Required code changes:** the honest restricted/known/blocked rendering is already in place; UI work is only to consume a real identity once a safe reader exists, and to add a real "request contact" affordance where a permission model allows it (state B→A transition).
- **Required DB/RLS changes (RED — owner-gated):** two additive pieces, no loosening: (a) an **RLS-safe counterpart-identity reader** (SECURITY DEFINER function returning only name/avatar of a co-participant *in a conversation the caller is a participant of*) so allowed threads can show the real person; (b) optionally typed conversation **source** (nullable `source_kind`/`source_id`) to ground a thread in its demand/booking. A genuine **contact-permission concept** (who may start a thread with whom) only if/when stranger-contact (from map/CV) is opened — until then keep default-closed.
- **Required external config:** none.
- **Risks:** an identity reader is privacy-sensitive — must be strictly scoped to co-participation and reviewed; never expose phone/email (in-app only). Adding a contact bridge prematurely would create fake openness.
- **Owner approval gate:** RED — draft PR + `needs-human-gate`; owner approves the SECURITY DEFINER function + any column additions; prod apply via MCP.
- **Test/smoke plan:** contract test that the identity reader returns a name **only** for co-participants and nothing otherwise; the three UI states render for known/allowed-restricted/blocked; no name leaks for a non-participant; append-only messages preserved.
- **Rollback plan:** drop the added function (and reverse the additive columns) — no destructive data change.
- **PR size:** medium (1 function + optional columns + UI consume + tests).
- **Must not be faked:** no invented counterpart names, no fake "contact" buttons, no fake free-contact quota, no relationship that doesn't exist.

---

## Wagon 5 — Market Map Player-Card / Layers

- **Purpose:** make the map a real market-visibility surface (player card + real layers), not just a marker.
- **User-facing outcome:** own player-card marker (already stronger after #509), real company marker, preferred-location and demand/need layers — each only when backed by real data.
- **Current state:** `market-map/page.tsx` builds a real owner identity (name, avatar, availability pill, verified-skill badge) → `MarketMapBase`/`MarketMapLive` (Leaflet/OSM, no API key); `MapLayersLegend` shows real visible-now rows (person active; company incomplete; needs off-map) + **disabled future-layer** filters. Own demand carries **no coordinates** (capture stores country/region only) → honest "off-map" row, never a fake point.
- **Required code changes:** (code-only, real-data only) — richer **own player-card** (profession/lead-capability label already supported in the type, wire when real); **company marker** when a confirmed company location exists; **preferred-location** ring/markers from real saved locations; keep demand as an honest off-map panel until coordinates exist.
- **Required DB/RLS changes:** none for the above. A real **demand-on-map** layer (coordinates for needs) or a **service/booking layer** would need data the model doesn't store yet → defer to Wagon 6 / a geo follow-up; until then these stay disabled legend filters.
- **Required external config:** none.
- **Risks:** any "other players on the map" requires a privacy-safe aggregate read (owner-scoped today) — must not show other users' precise locations; must respect existing map honesty guards (no fake markers/API/coords).
- **Owner approval gate:** code-only marker/layer polish = GREEN (auto-mergeable). Multi-player / demand-coordinate / service layers = RED follow-ups (need model + privacy design).
- **Test/smoke plan:** guards already freeze no-fake-markers/no-API/owner-scoped; add tests for company-marker-only-when-confirmed and preferred-location-from-real-data; mobile smoke of marker legibility.
- **PR size:** small–medium (own/company/preferred markers, code-only).
- **Must not be faked:** no fake coordinates, no fake demand, no fake marketplace/service layer, no fake player cards, no other-user precise location.

---

## Wagon 6 — Services / Bookings

- **Purpose:** real services people can book — not a fake booking tab.
- **User-facing outcome:** a worker can be proposed/booked for real work with date/location/role; both sides see honest status; (later) a browsable service offer.
- **Current state (reality):** a real **proposal engine** exists — `booking_requests` + `booking_request_events` (append-only) + RPCs `propose_booking_request` / `respond_booking_request` / `withdraw_booking_request` (`20260613100100_booking_requests.sql`, **`@human-gate-approved`, not yet applied** → RPCs return `needs-migration`, UI shows a calm "not available yet"). Worker availability/preferences are real (`20260613100000`). The **dashboard pending-bookings card** reads real data, shows only when `> 0`. **Missing:** service catalogue/offer table, provider/service profile, availability calendar/slots, post-accept lifecycle (completed/paid/review), contact grant on confirm, service search.
- **Required code changes:** booking list/detail UI already exists; an MVP adds an offer/catalogue surface + booking-from-offer flow once the schema lands.
- **Required DB/RLS changes (RED — owner-gated):** first **apply the existing `booking_requests` migration** (owner gate, MCP apply). Then, for a real services MVP: additive `service_offers` (type, role, location, optional price/rate, availability window) + RLS (owner can write own offers; others read public offers), and a booking-from-offer path reusing the proposal engine. Reversible, additive only.
- **Required external config:** none (payments explicitly out of scope).
- **Risks:** scope creep into marketplace/billing; showing offers before they're real. Keep MVP to *real provider sets availability → real booking proposal → honest status*; no payment, no reviews v1.
- **Owner approval gate:** RED — owner approves applying the booking migration and any new `service_offers` migration; prod apply via MCP.
- **Test/smoke plan:** booking propose/respond/withdraw end-to-end on a preview DB; overlap-conflict prevention holds; honest `needs-migration` degradation before apply; pending card stays 0 on non-ok.
- **Rollback plan:** additive tables can be dropped after asserting zero rows (per doctrine); proposal engine unchanged.
- **PR size:** medium (apply booking migration first as its own RED PR; then offers MVP).
- **Not primary nav until real enough:** bookings stays out of primary nav; only surfaces where real pending data exists. **Must not be faked:** no fake offers, no fake availability, no fake bookings, no fake contact reveal.

---

## Wagon 7 — Secondary Surfaces Cleanup

- **Purpose:** keep primary nav simple; prevent sprawl/duplication across ~40 secondary routes without deleting useful code.
- **User-facing outcome:** every secondary surface has one clear home; no duplicate doors; previews stay admin-only.
- **Current state:** primary nav is locked to 4 (guards: `action-first-ia`, `compact-nav-marketplace-ia`, `no-duplicate-top-level-entries`, `preview-surfaces-unlinked`). Secondary routes are mostly real + role-scoped; previews (`talent`, `visual-os`) are `requireSuperadmin`; `marketplace`→`market-map` and `player-card`→`journal` redirect. Identified **overlaps**: (a) messaging — `communication` (peer) vs `inbox` (manager journal review) vs `instructions` (work directives); (b) discovery — `candidates` (private drafts) vs `company/scouting` (matching) vs `talent` (preview). No true duplication, but mental model needs clarity. `inbox`, `instructions`, `search`, `bookings`, `reports/evidence` are **direct-URL-only** (no nav link).
- **Classification & recommendation (keep/merge/hide/admin-only):**
  | Surface | Class | Recommendation |
  |---|---|---|
  | profile, account, opportunities, documents, bookings, candidates, projects, company(+scouting), agency(+pool), buyer, instructions | real, role-scoped | **keep**, reached from Mano erdvė / role workspace (not primary nav) |
  | inbox (+quick/report) | real, manager review | **keep**; add a **manager-only secondary link** from communication or Mano erdvė so managers can find it (today direct-URL-only) |
  | instructions | real | **keep**; clarify model (directives ≠ peer messages); link from the relevant workspace |
  | search | real but undiscoverable | **decide**: give it an entry point or mark explicitly future |
  | reports/evidence | admin review | **admin-only** placement |
  | talent, visual-os(+agency) | preview/sample | **admin-only** (already gated) — keep |
  | marketplace, player-card | redirect | **keep redirects** |
- **Required code changes:** small, code-only — add the manager-only inbox link, clarify labels, optionally group secondary surfaces under their workspace; no route deletion.
- **Required DB/RLS changes:** none. **Required external config:** none.
- **Risks:** moving a link could orphan a surface — guards must be updated alongside, not bypassed.
- **Owner approval gate:** GREEN (code-only grouping/labels/links) — auto-mergeable; wait for owner **visual review** before larger regrouping.
- **Test/smoke plan:** existing nav guards stay green; add a test that inbox is reachable for managers via a real link; previews remain unlinked for non-admins.
- **PR size:** small. **Must not be faked:** no deletion unless provably safe; no preview surface promoted to product; no duplicate primary door.

---

## 1. What remains after #509 — summary table

| # | Wagon | Code-only? | DB/RLS? | External? | Priority | Owner gate |
|---|---|---|---|---|---|---|
| 1 | Login Branding | guard only (done) | no | **yes** (OAuth app name + custom auth domain + DNS) | **P0** | owner dashboard action |
| 2 | Approval Permission | UI done; data align pending | **yes** (RPC replace) | no | **P0** | RED human-gate |
| 3 | Stale Skills Cleanup | report (yes) / delete (no) | **yes** (data delete) | no | **P1** | RED, report-then-approve |
| 4 | Contact Permission + Identity | UI ready | **yes** (definer reader + cols) | no | **P1** | RED human-gate |
| 5 | Map Player-Card / Layers | **yes** (markers) | only for demand/service layer | no | **P1** | GREEN code; RED for geo layers |
| 6 | Services / Bookings | UI exists | **yes** (apply booking mig + offers) | no | **P2** | RED human-gate |
| 7 | Secondary Surfaces Cleanup | **yes** | no | no | **P2** | GREEN; await visual review |

## 2. Recommended train sequence
1. **Wagon 1 (P0, owner action)** — fastest real win, no code risk; owner sets OAuth app name + custom auth domain.
2. **Wagon 2 (P0, RED)** — fix real approval permission (highest trust impact; small, reversible RPC).
3. **Wagon 5 — code-only marker/layer polish (P1, GREEN)** — visible, low-risk, no gate.
4. **Wagon 3 (P1)** — stale-skills **dry-run report first** (read-only), then owner-approved delete.
5. **Wagon 4 (P1, RED)** — counterpart-identity reader so allowed threads show the real person.
6. **Wagon 7 (P2, GREEN)** — secondary-surface link/label cleanup (after owner visual review).
7. **Wagon 6 (P2, RED)** — apply booking migration, then services MVP.

## 3. Code-only wagons (no DB/RLS)
- **5** (own/company/preferred markers), **7** (links/labels/grouping). Wagon **1** needs only the repo guard (already shipped) plus owner dashboard work.

## 4. Wagons requiring DB/RLS (RED, owner-gated)
- **2** (replace `reviewable_journal_entry_ids` to match the action's engagement gate), **3** (delete confirmed-stale `journal_entry_skills`), **4** (SECURITY DEFINER counterpart-identity reader + optional source columns), **6** (apply `booking_requests` migration + additive `service_offers`).

## 5. Wagons requiring external dashboard / DNS
- **1 only** — Google OAuth consent app name; Supabase custom auth domain + DNS CNAME. No other wagon touches provider/DNS/env.

## 6. P0 / P1 / P2
- **P0:** 1 (branding), 2 (approval reality).
- **P1:** 3 (stale cleanup), 4 (contact identity), 5 (map markers).
- **P2:** 6 (services/bookings), 7 (secondary cleanup).

## 7. Wait for owner visual review
- **Wagon 7** (secondary regrouping) and the larger **Wagon 5** layer work should wait for the owner's visual pass; the code-only marker polish in 5 can go sooner.

## 8. Proposed first implementation wagon after planning
**Wagon 2 — Approval Permission (data alignment).** Rationale: it's the highest remaining *trust* gap (a real director still can't approve), it's small and fully reversible (one `CREATE OR REPLACE` function + a contract test, no table/column/RLS-loosening), and it converts a *hidden* contradiction into a *real* capability. It needs an authorized read first to confirm directors are represented as active `manager/owner/external_manager` engagements, then a RED human-gated migration PR. Wagon 1 (owner dashboard action) can proceed in parallel since it needs no code.

---

## Deliverables / confirmations
- **Doc:** `docs/owner-input/product-reality-train-v1.md` (this file) — the only changed file.
- **Summary table:** §1 above. **Sequence:** §2. **First PR:** Wagon 2 (with Wagon 1 owner action in parallel).
- **No code behavior changes, no DB/schema/migration/RLS/Supabase/env/DNS/billing/payment/auth-core change, no production DB query, no fake data.**
- External service names appear only inside Wagon 1's owner-action section, as required for exact instructions.
- **Not merged, not deployed.**
