# Commercial Readiness & Human Usability Map (2026-07-05, CR train WAGON 1)

**Baseline:** `main` @ `f466bb3` (full product tree train archived, #618; 7 wagon
migrations applied to production; drift cap 7 → 4).
**Spec:** `LABOURMARKETAI_COMMERCIAL_READINESS_HUMAN_USABILITY_TRAIN.md` §WAGON 1 —
audit-only, no product code changed.
**Method:** each of the 20 requested areas classified FROM SOURCE at `f466bb3`.
Where a 2026-07-02..05 audit already proves an area, that audit is cited, not
re-done (corpus: `runtime/audits/full-product-tree-reality-map-2026-07-05.md`,
`full-product-tree-final-closure-2026-07-05.md`, and the per-wagon audits from
PRs #607–#618). Areas without prior coverage were mapped by targeted source
inspection (routes, components, lib, migrations, guards, i18n).

**Statuses:** GREEN (real, visible, tested, source-proven) / YELLOW
(partial/gated — exact gap named) / RED (missing as a layer; honest fragments
listed) / BLOCKED (owner/legal/payment/external gate).

**Totals (corrected 2026-07-05, see “Count reconciliation” below): 4 GREEN ·
10 YELLOW · 5 RED (+ area 20 RED by design, counted separately) · payments
BLOCKED (standing gate; aspect-level owner/legal gates additionally marked
inside YELLOW areas).**

| # | Area | Status |
|---|---|---|
| 1 | Project explanation docs | YELLOW |
| 2 | GDPR / privacy / data protection | YELLOW (final wording BLOCKED-owner/legal) |
| 3 | Terms / cookies / marketplace rules | YELLOW (final wording BLOCKED-owner/legal) |
| 4 | Security / RLS / data access explanation | RED |
| 5 | User navigation and findability | GREEN |
| 6 | Universal command/search finder | RED |
| 7 | Free vs paid plan clarity | GREEN |
| 8 | Language preference and UI language behavior | GREEN |
| 9 | Multilingual team communication | YELLOW |
| 10 | Sports model: leagues/divisions/teams/cards | YELLOW |
| 11 | Object/project/job assignment model | GREEN |
| 12 | Permission matrix | RED |
| 13 | Skill recognition honesty and limits | YELLOW |
| 14 | Work journal modes | YELLOW |
| 15 | Work gallery | RED |
| 16 | Photo work reports | YELLOW |
| 17 | Jurisdiction/document requirement guidance | YELLOW |
| 18 | Recruiter/accounting/legal/document-help demand CTAs | RED* |
| 19 | Admin/operator visibility of these help requests | YELLOW |
| 20 | Final acceptance checklist | RED (created by WAGON 11 by design) |

*Area 18 has honest fragments (generic marketplace loop, follow-up queue) but no
help-request CTA layer; classified RED because the layer the train asks for does
not exist.

---

## Area 1 — Project explanation docs

```text
Status: YELLOW
Canonical surfaces:
  apps/web/app/[locale]/(marketing)/page.tsx + for-workers, for-companies,
    for-agencies, labour-market, work-abroad, work-opportunities, professions,
    skills (marketing tree — explains the product commercially);
  apps/web/app/[locale]/(marketing)/vision/page.tsx — full product/vision
    explainer, but gated: lib/config/vision-publication.ts VISION_PUBLIC=false
    (noindex, dropped from nav, "internal preview" banner);
  docs/PROJECT_VISION.md, docs/PLATFORM_DOCTRINE (internal only).
Guards: public-no-fake-claims.test.ts, cta-honesty-clarity.test.ts,
  placeholder-marker-prod.test.ts.
What is real: honest marketing explanation per audience; every href resolves
  (public-market-entry-sales-launch-audit-2026-07-05.md).
Exact gap: no user-facing "what Labour Market AI is, what data it uses, who
  sees what" explanation page reachable from the product (the train's WAGON 2
  deliverable). Vision page exists but is owner-gated non-public.
Smallest next slice (WAGON 2): a project-explanation page + footer/account
  links, reusing vision-page content where the owner allows.
```

## Area 2 — GDPR / privacy / data protection

```text
Status: YELLOW (final wording BLOCKED — owner/lawyer gate, train stop-rule 5)
Canonical surfaces:
  apps/web/app/[locale]/(marketing)/legal/privacy/page.tsx — honest minimal
    "being prepared" notice (i18n legal.preparing.body), no fake finality;
  consents table (supabase/migrations/0001: consent_type, given_at, revoked_at
    — never hard-deleted, GDPR audit trail); profiles consent flags;
  lib/documents/consent-actions.ts (DocsConsentToggle — per-feature consent).
Guards: privacy-base.test.ts, legal-pages-public-clean, no-legal-guarantee-copy,
  input-caps-and-log-privacy, no-secret-leakage.
What is real: consent capture with audit trail; structurally honest stub page;
  the anti-fake guard net (reality map branch 27, GREEN scoped).
Exact gap: no user-understandable GDPR/data-protection EXPLANATION (rights,
  retention, deletion, export, who sees what). Final legal wording is
  owner/lawyer input — that PART is BLOCKED, but the plain-language
  explanation marked "final wording pending" is buildable now.
Smallest next slice (WAGON 2): privacy/GDPR explanation copy in lt/en/ru with
  an explicit "final legal wording pending owner/lawyer review" banner.
```

## Area 3 — Terms / cookies / marketplace rules

```text
Status: YELLOW (final wording BLOCKED — owner/lawyer gate)
Canonical surfaces:
  apps/web/app/[locale]/(marketing)/legal/terms/page.tsx — "preparing" stub;
  .../legal/cookies/page.tsx — "preparing" stub;
  .../legal/marketplace-rules/page.tsx — REAL content page (no "preparing"
    marker; i18n legal.marketplaceRules.*).
Guards: legal-pages-public-clean.test.ts, constitution-compliance.test.ts,
  marketplace-no-fake-no-payment.test.ts.
What is real: all four legal routes resolve in all active locales; marketplace
  rules already substantive; stubs honestly say documents are being prepared
  before any paid/contractual launch (consistent with payments being blocked).
Exact gap: terms + cookies content; consistency pass across the four pages.
Smallest next slice (WAGON 2): cookies page real content (factual — what is
  actually set; the app is first-party only) + terms skeleton marked
  owner/lawyer-pending.
```

## Area 4 — Security / RLS / data access explanation

```text
Status: RED (explanation layer missing; the SECURITY itself is GREEN)
Honest fragments:
  RLS is real and audited everywhere (docs/audits/CHAT_VISIBILITY_AUDIT.md,
  chat-visibility-rls.test.ts, preferred-locations boundary pin "employers can
  NEVER read a worker's locations", scout-safe-view anonymization,
  admin-RLS-client separation, requester_identities_for_provider minimal
  identity RPC). Code comments explain access models thoroughly.
What is missing: ANY user-facing explanation of who can see what (worker data
  visibility, company data visibility, admin access) in plain words. Nothing
  under messages/*/… or (marketing)/ explains data access to users.
Smallest next slice (WAGON 2): one "your data and who can see it" page written
  from the existing RLS reality (do NOT invent claims broader than policies);
  pairs with the WAGON 7 permission matrix (same source material).
```

## Area 5 — User navigation and findability

```text
Status: GREEN (scoped)
Canonical surfaces:
  lib/config/navigation.ts — single source of truth; tabs DERIVED from
    lib/config/feature-availability.ts (availability:"active" AND
    safeToShowInPrimaryNav) — preparing/hidden features cannot reach nav;
  components/app/dashboard-tabs.tsx + bottom-nav.tsx (mobile) — primary tabs:
    overview, market-map, journal, communication (+ permission-gated admin);
  components/app/page-quick-nav.tsx — sticky in-page jump bar on long surfaces
    (Mano CV, Profile); components/app/account-menu.tsx — settings/utility.
Guards: compact-nav-marketplace-ia.test.ts, route-truth-map.test.ts (every
  route classified; drift ceiling 4, CI-enforced), product-readiness.test.ts.
What is real: action-first IA, honest tab set, route truth map with zero
  unclassified routes, marketplace hub IA guard.
Exact gap: none structural. Findability BY TYPING A TERM is area 6 (RED).
Smallest next slice: none needed in its own wagon; WAGON 3 builds on this
  registry (feature-availability is the natural command-finder source).
```

## Area 6 — Universal command/search finder

```text
Status: RED
Honest fragments: none for a finder — grep for cmdk / command palette /
  global search across apps/web returns nothing. /dashboard/search exists but
  is a pinned DUPLICATE_DRIFT company-scouting router page, not a finder.
Reuse base (already in source):
  lib/config/feature-availability.ts (feature key → route → label catalogue),
  lib/config/navigation.ts, route-truth-map.test.ts (route registry to assert
  every result resolves), i18n messages for labels in lt/en/ru.
Smallest next slice (WAGON 3): curated term → route/action registry (static,
  no external provider, no fake AI search) + a small finder UI + guard that
  every result route exists in the truth map and hidden/internal routes only
  surface for admins. The train doc's term list maps ~1:1 onto existing
  routes (CV → /cv, journal → /dashboard/journal, team → company workspace,
  pricing → /pricing, privacy → /legal/privacy, …).
```

## Area 7 — Free vs paid plan clarity

```text
Status: GREEN (scoped; prices stay draft until owner flips)
Canonical surfaces:
  apps/web/lib/billing/plans.ts (PAYMENTS_ENABLED=false kill-switch;
    PRE_PAYMENT_PLANS with audience/feature keys; paid tiers =
    'payment_not_enabled'); lib/billing/readiness.ts (#617:
    PRICING_READINESS_STATE='draft_pricing' owner-editable;
    FEATURE_ENFORCEMENT maps EVERY plan feature to its real enforcement seam;
    BILLING_READINESS_ITEMS claim ledger with CI-checked proof artifacts);
  lib/billing/entitlements*.ts + hasFeature() (real gate: booking_requests);
  app/[locale]/(marketing)/pricing (PricingTable + PrePaymentPlanBoundary —
    honest not-purchasable state); /dashboard/admin/billing (owner view).
Guards: billing-readiness.test.ts (24 assertions, capture-impossible),
  no-live-payments.test.ts, pricing-no-live-claim.test.ts,
  payment-readiness-honesty.test.ts.
What is real: free/paid boundary model, honest paid-tier "not purchasable"
  state, entitlement seams, owner billing view (final closure: branch 29
  GREEN scoped).
Exact gap (non-blocking): plan prices are "TBD" placeholders until the owner
  flips draft_pricing → owner_confirmed; WAGON 4 = user-facing copy polish
  (free plan explanation page/section), not new billing machinery.
Payment provider: BLOCKED by owner gate — untouched, stays untouched.
```

## Area 8 — Language preference and UI language behavior

```text
Status: GREEN (scoped)
Canonical surfaces:
  lib/i18n/config.ts — 11-locale canonical set (file-presence required);
    activeLocales = lt/en/ru (owner P0 override), defaultLocale = lt;
    tier1 = en/lt (human-verified), RU active but tagged preview until human
    review; promotion of any dormant locale = one-row change;
  lib/i18n/routing.ts (URL↔locale resolver rejects non-active codes);
  components/marketing/locale-switcher.tsx + account page language section
    (app/[locale]/dashboard/account/page.tsx); site-nav/site-footer.
Guards: i18n-lt-en-parity.test.ts (lt↔en↔ru, base + 6 namespace files ×
  locale, no empty values), check:i18n-debt in CI,
  COVERED_RECOGNITION_LANGUAGES set-equality pins.
What is real: honest 3-active-locale UI, full parity enforced, 12-language
  recognition taxonomy separate from UI locale scope
  (localization-launch-scope-audit-2026-07-05.md).
Exact gap: none for launch scope. FI/other locale promotion = explicit owner
  decision (board-pinned, non-blocking). Per-user PREFERRED COMMUNICATION
  language (as opposed to UI language) is area 9 / WAGON 5 material.
```

## Area 9 — Multilingual team communication

```text
Status: YELLOW
Canonical surfaces:
  app/[locale]/dashboard/instructions/page.tsx — work-instructions-v1: the
    multilingual instruction channel; original text ALWAYS preserved, honest
    translation state, clarification reply loop; reuses secure 0021 tables;
  conversations.original_language (20260610190000 draft column) +
    conversations-language guard; /dashboard/communication (append-only
    messaging, counterpart honesty, no contact leak — branch 20 closed by
    #608/#609: permission states + abuse caps + demand context).
Guards: work-instructions-scope-honesty.test.ts, conversations-language,
  message-counterpart-restricted, chat-visibility-rls.test.ts.
What is real: users CAN write in their own language; instructions channel is
  explicit about original vs translation; no fake translation anywhere.
Exact gap (WAGON 5): no visible original-language indicator in the general
  communication thread UI; no per-profile/company/team preferred communication
  language field; no helper copy telling users "write in your language".
  No translation engine exists — and nothing claims one (correct).
Smallest next slice: surface original_language chip in conversation UI +
  preferred-communication-language field (additive) + helper copy; keep the
  honest no-translation state.
```

## Area 10 — Sports model: leagues / divisions / teams / cards

```text
Status: YELLOW
Canonical surfaces (all real, model explanation missing):
  Player card: /dashboard/profile canonical + worker-player-card* components
    (player-card-worker-profile-launch-audit-2026-07-05.md — GREEN, one card
    system pinned by player-card-identity-consistency.test.ts);
  Teams/brigades: #612 — lib/company/team-brigades.ts + team-brigade-actions
    on the org spine (organizations/engagement_contexts, migration
    20260705220000 APPLIED), team-brigades-panel.tsx on /dashboard/company;
    guard team-brigades-layer.test.ts;
  League: /dashboard/admin/league (lib/admin/league.ts, TASK 07.4) — country ×
    profession market intelligence from REAL rows; owner-locked thermometer;
    insufficient_data honesty; "No ranking of people" (constitution §10);
  Objects: /dashboard/projects/[id]/operations + handover passport (#613).
Guards: t07-league.test.ts, fit-not-rating (global human scores banned).
What is real: every layer of the metaphor exists as a REAL surface.
Exact gap (WAGON 6): the metaphor is not explained anywhere user-facing
  (player card = capability card, team = work unit, object = field of play,
  league = market grouping NOT ranking); league view is admin-only; no
  roster/staffing-by-object view for company owners; "divisions" exist only
  as league grouping semantics.
Smallest next slice: model explanation page + owner/operator roster view per
  object reusing project assignments; NO fake rankings (league guard already
  bans them).
```

## Area 11 — Object / project / job assignment model

```text
Status: GREEN
Canonical surfaces:
  /dashboard/projects + /projects/[id] + /projects/[id]/operations;
  project_worker_assignments (+ gate migration 20260609120000, project/object
  client context 20260601091000); f4-assignment-migration.test.ts +
  f4-assignment-ui.test.ts; handover passport (#613, migration 20260705230000
  APPLIED) reads the SAME active-assignment rows for responsible parties;
  bookings loop (/dashboard/bookings, booking_requests + events, overlap
  conflict blocks double-booking — booking-honesty.test.ts).
What is real: assignment spine, operations board, passport shell, booking
  lifecycle — final closure has branch 19 closed.
Exact gap: none as a data/assignment model. The USER-FACING clarity of "who
  is assigned where" for owners is the WAGON 6 roster view (area 10).
Smallest next slice: none needed; consumed by wagons 6 and 7.
```

## Area 12 — Permission matrix

```text
Status: RED (explanation layer; underlying permissions are real + guarded)
Honest fragments (= the generation source for WAGON 7):
  RLS policies across all migrations (ownership-scoped, participant-scoped,
  admin-only e.g. follow_up_tasks is_admin()); requireSuperadmin /
  requireRoleOrRedirect route gates; communication-eligibility.ts permission
  states (#608); scout-safe-view anonymization; preferred-locations employer
  boundary; route-truth-map INTERNAL_ADMIN classification (15 admin routes);
  docs/audits/CHAT_VISIBILITY_AUDIT.md.
What is missing: any user/company/operator-facing matrix ("role X can see/do
  Y") — no doc page, no help page, nothing in messages/*.
Smallest next slice (WAGON 7): source-backed matrix page generated/written
  from the guards + RLS above, with a guard asserting no claim is broader
  than an actual policy/gate. Depends on nothing else; can follow WAGON 2.
```

## Area 13 — Skill recognition honesty and limits

```text
Status: YELLOW
Canonical surfaces:
  lib/structuring/* — offline, rules-based recognition, 12 languages, no
    runtime internet (offline-multilingual-skill-recognition-audit-2026-07-04);
  journal-entry-composer.tsx — 3-level owner model: candidate mode when NOT
    confident (candidate is never auto-installed), edit-mode banner,
    skill_candidate_clarifications loop (20260609160000);
  worker_skills.source/verified — three honest evidence tiers; "verified"
    label only from verified || manager_confirmed;
  Evidence Report v1 (/dashboard/reports/evidence) — prints the ladder
    self-declared → work-supported → confirmed, "no scores, no fake
    verification".
Guards: journal-realworld-recognition.test.ts, skill-installation-truth
  (audit 2026-07-04), evidence-library-framing.test.ts, ai-content-safety,
  no-direct-llm-client-call (no hidden AI).
What is real: recognition honesty is STRUCTURAL — tiers, candidate gating,
  guard-pinned phrases in 12 languages.
Exact gap: no plain-language user-facing explainer of recognition LIMITS
  ("text recognition is keyword-based, may miss things, never verifies by
  itself — confirmation comes from managers"): messages/en.json journal
  namespace has no recognition-limits copy keys.
Smallest next slice (WAGON 2 or 5): short "how skill recognition works and
  its limits" help copy on the journal + profile surfaces, lt/en/ru.
```

## Area 14 — Work journal modes

```text
Status: YELLOW
Canonical surfaces:
  /dashboard/journal (primary nav tab) + journal-entry-composer.tsx — ONE
  composer flow: free-text entry → offline recognition → structure
  suggestions → candidate/confirm tiers; edit mode (v4/v5 supersede model);
  photo evidence (1 photo free tier — see area 16); manager confirmations
  (journal_entry_confirmations).
Guards: journal-realworld-recognition, journal-evidence-loop,
  work-journal-recognition-root-cause-v1.md.
What is real: the journal loop is GREEN as a single well-built mode.
Exact gap (WAGON 8): no selectable MODES — no explicit quick-entry vs
  structured work report vs photo report choice; structured report and photo
  report exist only as facets of the one composer; /dashboard/market/recognize
  remains a pinned drift route (consolidation backlog).
Smallest next slice: mode presets over the EXISTING composer (no new journal
  system) — quick / structured / photo-first entry points that all write the
  same journal spine.
```

## Area 15 — Work gallery

```text
Status: RED
Honest fragments: journal photo evidence exists per entry (area 16);
  handover-passport-panel.tsx explicitly says photos are out of scope for the
  passport slice "and the copy says so honestly"; no gallery component, no
  gallery route, no gallery i18n keys anywhere (grep: zero matches for
  gallery/galerija in app code; only design-sandbox pages).
Reuse base: journal_entry_photos (20260612091000) private storage +
  image-compress.ts pipeline + projects/[id] surface.
Smallest next slice (WAGON 8): project/object gallery view reading EXISTING
  journal photo rows scoped by project access — private by default, no new
  storage system, permission-checked (user cannot see photos of projects
  they cannot access).
```

## Area 16 — Photo work reports

```text
Status: YELLOW
Canonical surfaces:
  supabase/migrations/20260612091000_journal_entry_photos.sql (applied set);
  lib/journal/photo-upload.ts + journal-entry-composer.tsx — 1 photo per
    entry free tier (more marked future VIP/Pro honestly); upload happens
    only AFTER the entry saves (photo failure can never lose an entry);
  lib/browser/image-compress.ts + image-compress-before-upload.test.ts;
  private avatar-bucket pattern for signed URLs (branch 4).
Guards: image-compress-before-upload.test.ts, avatar-upload-real.test.ts
  (storage honesty pattern).
What is real: photo EVIDENCE on journal entries, safe pipeline, honest tier
  boundary.
Exact gap (WAGON 8): no photo REPORT as a deliverable (multi-photo report on
  a project/handover); passport photos deliberately out of scope in #613;
  photos not visible on the project operations surface.
Smallest next slice: photo-report entry preset + passport/gallery read of
  existing photo rows (pairs with area 15; one additive migration at most).
```

## Area 17 — Jurisdiction / document requirement guidance

```text
Status: YELLOW (content sourcing partially BLOCKED — needs legal source)
Canonical surfaces:
  /dashboard/documents ("Mano dokumentai") — LIVE: DOCUMENTS_READINESS_ENABLED
    = true (lib/config/documents.ts; prod migration ledger 20260610172333);
    worker document inventory + country readiness for 9 launch markets
    (DOCUMENT_COUNTRIES LT/LV/EE/NL/DE/DK/NO/SE/PL);
  lib/documents/readiness.ts — statuses from the worker's OWN input + date
    arithmetic; legal disclaimer always visible; uncurated country says so
    honestly instead of pretending readiness;
  country_document_requirements table — ships EMPTY by design
    (needs_legal_source: no invented legal facts);
  lib/readiness/worker-readiness.ts (not_enough_information → ready ladder);
  DocsConsentToggle consent gate.
What is real: the guidance ENGINE, the honest-unknown state, the disclaimer.
Exact gap (WAGON 9): the requirements REGISTRY is empty — no
  jurisdiction-dimension inputs beyond worker country (no company country ×
  work country × role/service type dimensions), no "who usually provides"
  output, no CTA to legal/document help (area 18). Registry content needs a
  conservative "may be needed" source pass + owner/legal review flag.
Smallest next slice: seed the registry for the main markets with
  conservative may-be-needed rows marked needs_legal_review + add the input
  dimensions; keep honest unknown for everything else.
```

## Area 18 — Recruiter / accounting / legal / document-help demand CTAs

```text
Status: RED (layer missing; honest fragments exist)
Honest fragments:
  Marketplace loop — service_offerings + service_offering_requests
    (/dashboard/services, /dashboard/service-requests; category_slug is
    free-form, no recruiter/accounting/legal categories, and it is
    peer-to-peer, not "request help from Labour Market AI");
  customer_requests.needs_followup status (manual operator action);
  follow_up_tasks (#614) — the natural internal record for such requests;
  /dashboard/admin/support — operator surface.
What is missing: any CTA from demand/company context to request recruiter /
  accounting / legal / document-jurisdiction / staffing help. Grep across
  app/ for accounting/recruiter-help/legal-help copy: zero user-facing hits.
Smallest next slice (WAGON 10): typed help-request CTAs on the demand and
  company surfaces writing an INTERNAL record (reuse follow_up_tasks or a
  typed request kind on customer_requests) — no external sending, no fake
  engagement, honest "a person will review this" copy.
```

## Area 19 — Admin/operator visibility of help requests

```text
Status: YELLOW (surfaces ready; the help-request TYPE doesn't exist yet)
Canonical surfaces:
  /dashboard/admin control room (requireSuperadmin on layout AND page;
    owner-control-room.test.ts proof-required board);
  Follow-up queue (#614): lib/followup/follow-up-tasks.ts — admin-only RLS
    (is_admin()), honest 42P01 degradation, ids-only privacy, no outbound;
  Sales intake panel (#615): components/app/sales-intake-panel.tsx +
    lib/sales/lead-intake.ts (read-only leads/waitlist/demand intake;
    admin-visibility.test.ts + sales-intake.test.ts);
  /dashboard/admin/{support,need-structuring,project-truth} review queues.
What is real: the operator control room can already show queues honestly.
Exact gap: since area 18's request type doesn't exist, there is nothing to
  display; WAGON 10 must land the record type AND its admin queue view in
  the SAME wagon (extend the existing panels — no new CRM).
Smallest next slice: a typed filter/section in the existing follow-up or
  intake panel for help requests.
```

## Area 20 — Final acceptance checklist

```text
Status: RED by design (WAGON 11 deliverable — do not pre-fake it)
Existing precedent to reuse:
  lib/admin/launch-board.ts — proof-required board (green_scoped REQUIRES an
  existing proof artifact; fake readiness structurally impossible);
  runtime/audits/full-launch-readiness-final-audit-2026-07-05.md and
  full-product-tree-final-closure-2026-07-05.md — the closure format;
  billing readiness claim ledger (lib/billing/readiness.ts) — claim + proof
  artifact pattern.
Smallest next slice (WAGON 11, last): create
  runtime/audits/commercial-readiness-human-usability-final-closure-2026-07-05.md
  answering the 14 owner questions explicitly; only use the train's final
  wording if true; name every remaining YELLOW.
```

---

## Payment provider status

BLOCKED / OWNER GATE — unchanged and untouched by this audit. Live capture is
structurally impossible and guard-proven (billing-readiness.test.ts, 24
assertions; no-live-payments.test.ts; PAYMENTS_ENABLED=false;
STRIPE_MODE=live hard-blocked; webhook rejects live events). Nothing in this
train connects a provider (train §4.1).

## Duplication watchlist for this train (§4.2 compliance)

- WAGON 3 finder must be built ON lib/config/feature-availability.ts +
  route-truth-map — not a second navigation registry.
- WAGON 6 must reuse worker player card, team-brigades org spine (#612),
  project_worker_assignments — no game layer.
- WAGON 8 modes must be presets over the ONE journal composer; gallery reads
  journal_entry_photos — no second photo system.
- WAGON 10 requests must reuse follow_up_tasks / customer_requests + the
  existing admin panels — no new CRM.
- Legacy pairs to keep NOT extending: threads/messages (0001) vs
  conversations (0021); lib/staffing/fit.ts (preview) vs lib/market
  (canonical); agencies tables (archived after #616 + retype apply).

## Prioritized wagon order (2–11)

The train doc's order binds. Source shows ONE dependency worth honouring
inside that order and one soft swap justification — no reordering is actually
required, but the dependencies are named:

| Order | Wagon | Note (dependency, from source) |
|---|---|---|
| 1 | WAGON 2 — compliance/GDPR/explanation pack | Unblocks areas 1,2,3,4 (+13's limits copy can ride along). Final legal wording stays owner-gated and must be marked pending — do not wait for it. |
| 2 | WAGON 3 — command finder | Depends only on feature-availability + route-truth-map (both GREEN). WAGON 2 first is correct so finder results for "privacy/GDPR" resolve to real explanation pages, not stubs. |
| 3 | WAGON 4 — free vs paid clarity | Mostly copy over the GREEN billing readiness layer (#617). Small. |
| 4 | WAGON 5 — language/communication clarity | original_language column + instructions channel exist; additive pref field. |
| 5 | WAGON 6 — sports operating model | Needs teams (#612, done) + assignments (GREEN); explanation page benefits from WAGON 2 tone/pattern. |
| 6 | WAGON 7 — permission matrix | Source-backed from RLS/guards; naturally follows WAGON 6 (roster/visibility surfaces exist to describe). |
| 7 | WAGON 8 — journal modes/gallery/photo reports | Reuses journal_entry_photos; passport photo gap closed here. Possible additive migration (gallery read scope) → owner-gated apply runbook. |
| 8 | WAGON 9 — jurisdiction/document guidance | Engine live; registry seeding needs the conservative-wording pass; its CTA output points at WAGON 10 surfaces, but seeding can land first with a plain link. |
| 9 | WAGON 10 — demand support services | Lands the request type AND its admin queue view together (areas 18+19). After WAGON 9 so the document-help CTA has a guidance page to link back to. |
| 10 | WAGON 11 — final acceptance closure | Last, only-if-true wording. |

Deviation notes: none from the train doc's order. WAGONs 9 and 10 reference
each other (guidance CTA → help request; help request → guidance page); the
doc's order (9 before 10) is the right direction — WAGON 9 ships with a plain
link placeholder that WAGON 10 upgrades to the real CTA.

## Owner/legal gates carried through this train (exact list)

1. Final legal wording (privacy/terms/cookies) — owner/lawyer text (stop-rule 5).
2. Pricing flip draft_pricing → owner_confirmed — owner decision, never enables payments.
3. Payment provider connection — the terminal gate; NOT part of this train.
4. country_document_requirements content — legal-source review flag on every seeded row.
5. Any additive DB apply (WAGON 8 gallery scope, WAGON 9 registry, WAGON 10 request type if schema-shaped) — existing owner-gated apply runbook.
6. FI/dormant locale promotion — pinned owner decision, non-blocking.

## Validation (this PR — audit-only, suite untouched)

| Check | Result |
|---|---|
| `pnpm typecheck` (apps/web) | PASS |
| `pnpm lint` (apps/web) | PASS |
| `pnpm test` (apps/web) | PASS — 488 files, 7413/7413 |

No product code touched; the suite is the untouched #618 baseline.

## Count reconciliation (owner lock, 2026-07-05)

The originally merged summary header claimed **6 GREEN / 9 YELLOW / 4 RED /
1 BLOCKED**. That header was a **summary arithmetic error**: it does not match
this file's own 20 per-area `Status:` lines, which were and remain correct and
unchanged. Tallying the per-area bodies gives the corrected counts:

| Status | Areas | Count |
|---|---|---|
| GREEN | 5, 7, 8, 11 | **4** |
| YELLOW | 1, 2, 3, 9, 10, 13, 14, 16, 17, 19 | **10** |
| RED | 4, 6, 12, 15, 18 | **5** |
| RED by design (WAGON 11 deliverable, counted separately) | 20 | 1 |
| BLOCKED (standing payment-provider gate, not an area status) | payments | — |

The header line above has been corrected to this tally. No per-area body was
modified. WAGON 2 (compliance/GDPR/data-protection/explanation pack) targets
areas 1–4 against this CORRECTED baseline: areas 1–3 YELLOW, area 4 RED.
