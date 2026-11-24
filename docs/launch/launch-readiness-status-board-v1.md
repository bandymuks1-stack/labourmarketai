# Launch readiness status board v1

> Generated 2026-07-06. Baseline: `origin/main` @ **db7b1b3** (quality-train
> PRs #646–#657 merged). **Docs only — no code, no migrations, no
> landing/marketing files touched.**
>
> Purpose: one current board of what is DONE, what is OWNER-GATED, and what
> can still be improved safely, so future agents do not guess or re-audit
> from scratch. Sources: the mobile root-cause audit
> (`docs/launch/full-project-mobile-root-cause-audit-v1.md`), the
> quality-train PR bodies (#646–#657), and the per-area docs referenced in
> each section. If this board and a newer PR disagree, the newer PR wins —
> update this board.

---

## 1. Done and merged (real, on main)

The audit PR train (PR2–PR9 of the audit sequence, merged before #646) plus
the quality train (#646–#657) closed most of the audit's RED/ORANGE items:

| Area | What is real on main | Evidence |
|---|---|---|
| Notification spine | One signal catalogue + one count read feeds the bell, Messages nav badge and dashboard (5 count-gated signals incl. invitations); zero counts ⇒ empty bell, no fake activity | #647; `apps/web/lib/notifications/spine-signals.ts`, `spine.ts` |
| Booking lifecycle | No reachable booking status is a dead end: withdraw-proposal UI, message CTAs on accepted, "find another worker" on declined; `expired` documented as unreachable (no fake promise) | #648; `docs/launch/booking-lifecycle-v1.md` |
| Marketplace ↔ opportunities | Decided model: two entry points into ONE supply/demand system, converging on conversation → booking → journal; hub bridge shipped | #649; `docs/launch/marketplace-opportunities-bridge-v1.md` |
| Conversation context honesty | Scope copy no longer overclaims ("related work's title", LT/EN/RU); all five sanctioned conversation callers verified hard (server-side permission, honest failure, no client-side profile ids, real unread, abuse caps) | #650; `docs/launch/conversation-source-relation-proposal-v1.md` |
| Account security section | Real security/access section on `/dashboard/account` (sign-in method etc., all real data); NO enrollment UI that pretends to work | #651; `docs/security/authentication-and-mfa-v1.md` |
| Privacy self-service | Data export is LIVE and immediate (`/dashboard/privacy` streams the caller's own RLS-scoped JSON, exclusions stated inside the bundle, no service role); deletion-request FORM ships but degrades honestly until its RPC migration is applied (see §3) | #652; `docs/compliance/privacy-requests-v1.md` |
| Profile/skill/journal loop | Audited connected and honest end-to-end — verdict "no repairs required"; journal skill links are evidence support, never verification | #654; `docs/launch/profile-skill-journal-loop-v1.md` |
| Real exports | Verified CV print, Evidence Report print, and NEW work-journal CSV download — all from RLS-scoped data; honest "Excel/Word: preparing" line | #655 |
| PWA / store groundwork | Honest manifest (+ `categories`), real brand SVG icon (maskable-safe), Apple metadata, installable Android + iOS; intentionally NO service worker (guard-pinned until an offline-policy PR); no `screenshots` field until real screenshots exist (guard-pinned) | #644, #656; `docs/mobile/mobile-store-readiness-v2.md` |
| Landing replacement model | Fake-claim inventory + honest replacement copy model DOCUMENTED (proposal only — nothing on the landing changed; see §5) | #657; `docs/marketing/landing-replacement-model-v1.md` |
| Earlier audit train | Phantom "order" vocabulary purged (#642); shared visual pattern system ActionCard/StatusChip/EmptyState + 44px targets + honest bottom nav (#643); security/MFA model docs (#645); notification bell made real (#640/#641) | merged PR history |
| Honesty spine (pre-existing, keep) | Zero fake data on authenticated surfaces; no dead routes; count-gated cards; "never a dead button"; RLS/session-derived scoping verified clean; 7,813+ unit tests, guards green | audit §2, §16 |

## 2. Production DB — applied

| Migration | Status | Evidence |
|---|---|---|
| `20260706120000_booking_requests_seen.sql` (merged in #640) | **APPLIED to production** (`gorgitwvdzxbnaxhrsrw`) 2026-07-06 via Supabase MCP on explicit owner instruction; post-apply verified (RLS on, SELECT-only policy, SECURITY DEFINER `mark_booking_requests_seen()`, writes RPC-only) | #646; `docs/APPLIED_LEDGER.md` (MCP version stamp `20260706092909`) |

This unlocked the dashboard "new booking responses" badge and top-slot
promotion end-to-end. Do NOT re-apply and do NOT treat it as pending.

## 3. Production DB — still owner-gated (NOT applied)

| Item | State | What the owner must do |
|---|---|---|
| `submit_privacy_request_v1` RPC (`20260706150000_privacy_request_intake.sql`) | **DRAFT PR #653, needs-human-gate, NOT merged, NOT applied.** SECURITY DEFINER + GRANT = RED-class per the migration-safety gate; deliberately not self-certified. The deletion-request form on `/dashboard/privacy` shows a truthful "not accepted yet" until applied. | Review the SQL (twin of the approved help-request RPC `20260705260000`), add `-- @human-gate-approved`, mark ready, merge, apply via Supabase MCP (never `db push`) |
| Conversation source relation (`source_type` + `source_id` on `public.conversations` + participant-scoped reader RPC) | **PROPOSAL ONLY — no migration file, no PR.** Needed for honest "this thread is about booking X" labels + link-backs; heuristic labelling was considered and rejected as fake UI. | Yes/no on the proposal; if yes, a dedicated migration PR follows |

Reference: `docs/launch/conversation-source-relation-proposal-v1.md`,
`docs/compliance/privacy-requests-v1.md`.

Agents: never apply RED-class SQL (SECURITY DEFINER, GRANT, destructive DDL)
without the owner's explicit human gate. PR #653's worktree
(`../labourmarketai-wt-migration`) belongs to that draft — do not touch it.

## 4. In-app launch blockers (authenticated product)

Mostly closed by the trains. What remains:

1. **Deletion-request intake disabled** until PR #653 is applied (§3) —
   honest degradation, but a privacy-rights gap for launch (see §8).
2. **Conversation threads lack source context** until the §3 proposal is
   approved — threads show a neutral subject label; honest but weaker UX.
3. **MFA not offered** — planned PR sequence exists, gated on owner copy
   approval + Supabase dashboard MFA config (see §7).
4. **No offline capability** — intentional; requires the service-worker
   cache-policy PR (never cache authed HTML). Needed for Play quality bar,
   not for web launch.
5. Residual audit items that were explicitly deferred, not fixed: dormant
   locale catalogs (lt/en/ru active with full parity; 8 dormant catalogs
   carry `[EN]` debt under a ratchet), the buyer `demand_requests` vs
   `customer_requests` pipeline question (owner decision, audit §17.3).

No known fake states, dead buttons or dead routes on authenticated
surfaces as of the audit + trains.

## 5. Public/landing blockers (ALL owner-gated — do not edit these pages)

The public marketing site still carries everything from audit R4. PR #657
documented the replacement model but changed NOTHING on the pages:

| Blocker | Where |
|---|---|
| Animated fake counters (318K→323K workers / 1,180→1,262 demands / 84→129 matches / 71%) with 10px "illustrative" caption | landing hero, `content/placeholders.ts` |
| ~90 fake per-country map hover tooltips | landing Europe map |
| Fake demand card "47 ranked matches · HOT" | `/for-companies` |
| Fake agency pool "86 workers · 31 active" | `/for-agencies` |
| "Dar nepradėjome veiklos…" ("we haven't started operating") — the single most launch-undermining sentence | `/pricing` FAQ |
| Internal jargon leaks: "(M5)", "PR2 pending", "ChiefOperator", vision smoke banner, DB-layer jargon | legal/billing/vision/start copy |

Implementation is HELD until the owner approves the model in
`docs/marketing/landing-replacement-model-v1.md` (capability claims +
labelled worked examples now; real counts only when >0 from a named
public-safe aggregate). After approval: one implementation PR per surface,
keeping `placeholders:check` and the honesty-copy guards green with
LT/EN/RU parity.

Per repo rules, landing/public marketing pages are owner-gated — agents
must not edit them autonomously even to remove fake numbers.

## 6. Mobile store blockers

Web install (PWA add-to-home-screen) works today on Android and iOS.
Store submission is blocked on, in order
(`docs/mobile/mobile-store-readiness-v2.md`):

1. Owner supplies ≥1024px icon source art (or approves generating from
   `public/app-icon.svg`) → mechanical PNG icon PR (192/512/maskable +
   Apple touch 180).
2. Owner approves/edits the Play Store metadata drafts (LT/EN) and decides
   the support contact (email vs a new public support page — itself a
   public marketing surface, owner-gated).
3. Service-worker PR (required by Play quality bar; policy already decided:
   cache static assets + honest offline fallback, never authed HTML).
4. Owner-only: Play developer account + signing key, then
   `assetlinks.json` (needs the signing fingerprint), then Bubblewrap TWA
   build → internal testing → owner approves listing.
5. Screenshots must show REAL product states — no staged numbers (honesty
   rule inherited from the spine; guard pins no `screenshots` manifest
   field until real ones exist).

iOS App Store: DEFERRED by decision (thin-wrapper rejection risk, no
commercial case). Add-to-home-screen is the iOS story for now.

## 7. Security/MFA blockers

From `docs/security/authentication-and-mfa-v1.md` + PR #651:

- Auth today: email+password, Google OAuth (PKCE), email reset, SSR
  cookie sessions — solid, shipped.
- MFA: **not offered.** Code-side ready (`@supabase/supabase-js@2.106.0`
  exposes the full `auth.mfa` API). Blocked on TWO owner actions:
  1. Approve the benefit-based copy model (§2 of that doc: "protection you
     gain", never "required/blocked" framing) — no MFA UI ships before
     this.
  2. Enable project-level MFA configuration in the Supabase dashboard.
- Then the prescribed PR sequence: enrollment (TOTP + QR + recovery codes
  + unenroll) → AAL2 challenge for enrolled users only → session/device
  visibility → security events (needs the notification spine — which now
  exists, so this dependency is satisfied).
- Honest-limits rule survives into any copy: MFA reduces account-takeover
  risk; it does not protect a compromised device, and copy must not claim
  so.

## 8. Legal/privacy blockers

From `docs/compliance/gdpr-readiness-v1.md` (engineering inventory, NOT
legal advice) + `docs/compliance/privacy-requests-v1.md`:

- **Access/portability: DONE** (self-service JSON export, live).
- **Erasure: intake only, owner-gated twice** — the request form needs the
  PR #653 migration (§3), and the deletion itself is a manual owner action
  after identity verification; automation is a separate lawyer-aware PR
  (retention tension: journal entries confirmed by others).
- **Stale public legal copy**: the legal pages / gdpr-readiness §2 still
  say "no export bundle" — now untrue, but fixing it touches public
  legal/marketing pages ⇒ owner-gated.
- **Lawyer items (⚖️, all open)**: lawful-basis confirmation per data
  class, processor list/DPA sufficiency (Supabase eu-west-1, Vercel,
  Google OAuth), breach-notification thresholds, guidance for users
  writing third-party names into journal entries, the append-only
  correction model explained in privacy copy.
- **Consent dashboard**: flags already stored (documents/avatar); a small
  settings section listing given consents is safe engineering work.
- Privacy-policy wording is owner voice, not an agent draft, per repo
  rules.

## 9. Owner decisions (consolidated, smallest form)

| # | Decision | Unblocks | Source |
|---|---|---|---|
| 1 | Approve + apply PR #653 (privacy-request RPC) — yes/no | Deletion-request intake (§3, §8) | PR #653 |
| 2 | Approve landing replacement model + pricing pilot paragraph wording | The whole §5 marketing-honesty implementation train | `landing-replacement-model-v1.md` |
| 3 | Conversation `source_type`/`source_id` + reader RPC — yes/no | Honest thread context labels + link-backs (§3) | `conversation-source-relation-proposal-v1.md` |
| 4 | Approve MFA benefit-copy model + enable Supabase MFA config | MFA enrollment PR sequence (§7) | `authentication-and-mfa-v1.md` §2 |
| 5 | Icon source art + Play metadata wording + support contact | Store asset PRs (§6 steps 1–2) | `mobile-store-readiness-v2.md` |
| 6 | Play developer account + signing key (owner-only secrets) | TWA path (§6 step 4) | same |
| 7 | Buyer `demand_requests` → worker opportunities: merge or keep ops-only | Demand-pipeline unification | audit §17.3 |
| 8 | Dormant locales: freeze or fund translation | i18n scope clarity | audit §17.6 |
| 9 | Marketplace/opportunities NAMING merge (model already decided in #649) | Naming pass | `marketplace-opportunities-bridge-v1.md` |
| 10 | Public legal-copy refresh (export bundle now exists) — owner wording | §8 stale-copy fix | `privacy-requests-v1.md` follow-up 2 |

## 10. Safe autonomous next work (no owner input required)

Safe = no product-code risk beyond normal PR review, no landing/marketing
pages, no RED-class SQL, no new secrets, honest states preserved:

1. **Consent list in settings** — read-only section rendering the consent
   flags already stored (gdpr-readiness §6.3). Ordinary RLS reads.
2. **Service-worker offline PR** — policy already decided (static assets +
   honest offline fallback, never authed HTML); unblocks Play later and
   improves PWA now. Update the pwa-baseline guard pins in the same PR.
3. **Guard extensions** the audit called for (§15): route-smoke beyond 22
   routes, anchor-target existence, undefined-class scan,
   interactive-style-requires-handler lint. Pure regression protection.
4. **Stale open draft cleanup (recommend-only)**: #516, #511, #510, #507,
   #486 are historical docs/audit drafts from earlier trains, and #379 is
   an old RED-migration feature draft — largely superseded by the merged
   audit + quality trains. An agent may write a close/keep recommendation
   per PR; closing them is the owner's call.
5. **i18n-debt ratchet extension** to all dormant locales
   (`TRACKED_LOCALES` currently da/de only) — debt visibility, no copy
   changes.
6. **Keep this board current** — future agents should update this file in
   the same PR that changes any status above, instead of re-auditing.

Anti-goals for autonomous work (repeat of the gates): no landing/public
marketing edits, no RED-class SQL self-approval, no MFA UI before copy
approval, no store submissions, no fake completion claims — "the app must
not be described as 'almost 100% complete'" (audit §1) still stands: core
loops are real and now mostly connected; the public site still overstates
live activity until §5 is approved and implemented.
