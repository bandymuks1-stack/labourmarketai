# VISIBLE PRODUCT SURFACE MATRIX — CURRENT TRUTH (beta foundation audit)

Base: main `995fa704` (unchanged at audit start). Worktree: `labourmarketai-beta-audit`.
Local stack: shared Supabase (127.0.0.1:54321), migrations synced to 194/194 on 2026-08-08.
Method: code re-derivation (3 read-only sweeps) + live local browser journeys + prod read-only checks.

Status vocabulary: VERIFIED_WORKING | PARTIAL | BROKEN | IMPLEMENTED_BUT_UNREACHABLE |
WORKING_BUT_HARD_TO_DISCOVER | CONFIGURATION_GATED | OWNER_GATED | NOT_IMPLEMENTED |
NOT_ENOUGH_EVIDENCE | HIDE_FROM_BETA_CANDIDATE

## 1. Navigation model (re-derived from code)

Three chromes chosen by pathname (`components/app/dashboard-chrome.tsx:34-52`):
- `conversation` (= `/dashboard` exactly): bare chat, no tabs/bottom nav.
- `panel` (journal, planning, profile, communication): ConversationHeader only — **no tabs, no bottom nav**.
- `full` (everything else): DashboardTabs (desktop) + BottomNav (mobile).

**~~N1 (P1)~~ — WITHDRAWN 2026-08-09. NOT A DEFECT: this is an OWNER RULING.**
The observation was accurate — `/dashboard`, `/dashboard/journal`, `/dashboard/planning`,
`/dashboard/communication`, `/dashboard/profile` render no tabs and no bottom nav — but the
conclusion was wrong. The ruling is recorded in `conversation-header.tsx` and pinned by
`lib/guards/auth-form-post-fallback-and-finder-starters.test.ts:51-58`: the journal, calendar,
messages and the card are **projections opened from the conversation**, and the command finder
is one of their channels. The sanctioned mitigation for the "first session sees zero links"
hole is `STARTER_COMMAND_IDS` (work_journal, planning, messages, market_map, profile), which
exists and works.

LESSON FOR THIS AUDIT: three of my first-pass "discoverability defects" (N1, the bookings-nav
half of B1, and N8) were re-derivations of deliberate IA. An absent nav entry is not evidence
of a defect in a product whose IA is deliberately conversation-first — the guards encode the
rulings, and they must be read BEFORE a nav finding is written down.

Nav containers:
- Desktop tabs + mobile bottom nav: overview, journal, planning, communication, market-map,
  network (+admin desktop-only, gated isAdmin). No role/workspace gating on any item.
- Account menu (all chromes): profile, player card (journal#mano-cv-identity), admin (gated),
  theme, /cv, account, feedback modal, logout.
- Role switcher (full chrome only): admin badge, base identities, org list (>1), add-identity → /dashboard/start/company.
- Notification panel footer → /dashboard/activity (only persistent link to it).

**N2 (P1): dead link `/dashboard/agency`** from `dashboard/start/page.tsx:255` — route does not exist.
**N3 (P2, role leakage): account menu shows worker artifacts (Player Card, Mano CV) to every
identity with no role check** (`account-menu.tsx:73-83,153-162`) — contradicts command registry audience gating.
**N4 (P2, role leakage): CommandFinder audiences computed from HELD roles, not active workspace**
(`command-finder.tsx:242-254`) — worker in personal workspace sees employer commands if they hold a company role.
**N5 (P2): `/dashboard/inbox` (manager review inbox) has no role/workspace gate** — degrades to empty for workers (RPC-scoped), but the employer shell renders.
**N6 (P3): dead "control room grid" registry** — `dashboard-module-registry.ts` roles/primaryRoles consumed by no renderer.
**N7 (P3): stale FAB CSS hook** `dashboard-chrome.tsx:77-84` sets data-surface for a feedback FAB that no longer exists.

Unlinked routes (deep-link only; details in nav sweep):
- Tier A (zero inbound links): /dashboard/learning, /dashboard/talent (superadmin sample preview),
  /dashboard/admin/import-sandbox, /dashboard/admin/intelligence-observations.
- Tier B (command-search only): absences, assist, commercial, listings, reports.
- Tier C (buried in-page links only): assets, bookings, buyer, candidates, company*, documents,
  finance, gallery (profile page only), inbox*, instructions, intelligence, journal/voice,
  market/recognize, opportunities, people/[id], privacy, projects, reports/evidence,
  service-requests, services, start*, tasks.

**N8 — DOWNGRADED to WORKING_BUT_HARD_TO_DISCOVER (was P1).** `/dashboard/absences` is reachable
via command search, which under the ruling above IS a sanctioned channel — and its registry entry
carries full synonyms in all five active locales ("leave", "holiday", "time off", "atostogos",
"отпуск", "verlof", "urlaub"), so a person who searches their own words finds it
(`lib/navigation/command-registry.ts:112-130`). It is NOT, however, in `STARTER_COMMAND_IDS`, so a
first-time worker who does not think to search never meets it. Given production holds 0 absence
rows, whether leave joins the five starters is a product-IA decision for the owner — recorded here,
deliberately NOT taken unilaterally by this audit.

## 2. Public surface (re-derived + live)

Active locales: lt (default), en, ru, nl, de. Tier-1 human-verified: en, lt. RU/NL/DE AI-seeded, marked preview.

Header (≥1024px): for-workers, for-companies, for-agencies, #how-it-works, pricing, about, sign-in, signup, theme, locale.
**P1 finding M1: NO mobile marketing nav** — `site-nav.tsx:73` hidden below lg, no hamburger.
Mobile header = logo + Sign in + Start now + theme + locale only.

Footer: product links, 7 legal pages, about, locale switcher, Rexora credit. No contact link
(`footer.contact` key exists, never rendered).

Landing sections: hero "Ask. See. Hire." + scripted demo (honest DEMONSTRATION badge) →
product chain → player-card showcase (sample persona) → trust band → final 4-door CTA band.
- **M2 (P1): live-verified — the sample worker card on the PUBLIC landing deep-links anonymous
  visitors into `/dashboard/journal?skill=…`, `/dashboard/profile#capabilities`,
  `/dashboard/communication`** → login wall from a demo card.
- M3 (P2): no audience section (stale comment `page.tsx:79-83`; `audience-value-sections.tsx` dead code).
- M4 (P2): hero demo "Review these needs" CTA looks like navigation, only flips local state.
- M5 (P3): ~60% of `landing.*` i18n namespace dead.

Pricing `/pricing`: **M6 (P1): production shows `Placeholder` dashed boxes with "pricing TBD"**
(`pricing-table.tsx:29` + `lib/env.ts:213-216` forces markers ON in prod).
**M7 (P1, HIDE_FROM_BETA_CANDIDATE): ServiceOffers block sells unrelated AI-automation agency
services (€900–€1,900) on the labour-market pricing page.**
M8 (P2): three overlapping price registries on one page; waitlist modal copy says "For companies & agencies" for all audiences.

Other public routes: for-workers/companies/agencies OK; professions/skills/work-opportunities/
work-abroad/labour-market/questions/calculators orphaned from nav (SEO-only).
- M9 (P2): `/labour-market` — 10 of 16 country cards "Coming soon" while subcopy calls them open.
- M10 (P2): partner CTA → /about which has no partner content/contact.
- M11 (P1): **no public contact or feedback channel** while legal pages say "get in touch with us";
  contact email exists only as plain text on /legal/legal-notice.
- M12 (P2): duplicate `id="main-content"` on company-need, worker-intake, labour-market,
  calculators, questions (also nested <main>).
- M13 (P2): reset-password enforces only min-length; signup requires upper+number+special.
- M14 (P3): `/match-preview` in sitemap, zero inbound links, no metadata.
- M15 (P3): signup page renders the legal/controller notice twice (live-verified).
- M16 (P3): landing claims "platform speaks eleven languages"; 5 selectable.

Cookie banner: none — defensible (only essential cookies; no third-party trackers; /legal/cookies accurate).

## 3. Gating model (re-derived)

- AI: `AI_PROVIDER_MODE` default disabled; all AI paths degrade honestly to `{status:"off"}`.
  /dashboard/assist never calls a model by design (honest state card).
- Voice journal: CTA on /dashboard/journal is UNCONDITIONAL; page shows honest "not configured"
  panel without VOICE_TRANSCRIBE_URL/TOKEN. CONFIGURATION_GATED (prod state to verify).
- Payments: double-gated off (env + `false as const`); pricing shows waitlist only. OWNER_GATED.
- LMC commerce: hardcoded off. OWNER_GATED.
- Invite email: INVITE_EMAIL_* unvalidated by env schema (typo → silent copy-link degradation) — P2.
- Maps/geocoding: deliberately provider-free; `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in .env.example is
  dead + guard-forbidden — P3 stale doc.
- Applied ledger: name-based matching; `company_memberships_v1` name ambiguity (draft vs applied pair).
- ~167 modules feature-detect missing schema → honest `needs-migration` states.

## 4. Live journey log (local, disposable users)

### Auth + onboarding (worker) — VERIFIED_WORKING so far
- Signup email+password: validation copy correct, redirected to /en/onboarding. ✔
- Onboarding step 1 Person/Company: works; ✓ glyph transparent-but-present when unselected (P3 a11y);
  clicking Finish with empty required fields showed NO visible error (P2 candidate — recheck properly).
- Step 2 (name+country) → redirect to /dashboard/profile with 5-step checklist. ✔
- First-session orientation: profile hub gives clear next steps; but NO primary nav in panel chrome (N1).

### Worker journey (disposable local worker `audit.worker.aug8@local.test`)
- Onboarding → lands on /dashboard/profile with a 5-step checklist. VERIFIED_WORKING.
  - P2 (E1): submitting the onboarding step with empty required fields shows no visible error.
  - P2 (E2): the "A bit about you" step shows worker copy (CV/skills/availability) even when
    the user chose ONLY Company — §19 role-context leakage at first contact.
- Chat "I'm looking for work" → honest missing-profile notice + inline criteria form with
  REVIEW BEFORE SAVING confirm → `workers.availability_status` persisted (DB-verified). PARTIAL:
  - P1 (W-J1): chat promises "Fill this in below and I'll search right away" — after Save the
    conversation ends at "Saved. / Add another". No search ever runs. The core worker ask dead-ends.
- Journal via chat "Log work" (journal page has NO composer by design, PR #1081):
  structured card (date/site/evidence/1 photo) → Save → "Entry saved… Skill added: Electrical
  installation… CV now includes…". DB: journal_entries + metrics (work_date=2026-08-07 past date
  honored, site_name, skill_claim). Calendar day view shows the entry on Aug 7 (work_date), NOT
  created date — journalStartDay rule holds. VERIFIED_WORKING.
  - P3: player-card "Latest records" shows created_at (documented "when the proof last grew"
    semantics) while calendar uses work_date — label wording could confuse.
  - NOTE: first executor invocation in dev showed "Loading…" ~10s (compile latency); recheck cold
    latency in prod before blaming the product.
- Absences (/dashboard/absences, §14): request created (annual leave, 3 days) → REQUESTED →
  survives reload → Cancel offered. VERIFIED_WORKING worker-side. Defects:
  - P2 (A2): after submit the list still says "No requests yet" until manual reload.
  - P1 (N8): the page is reachable ONLY via command search — no nav entry anywhere.
  - P1 (A1): **employer approval surface is blind to booking-created engagements** —
    `caller_manages_worker()` checks only company_workers/agency_workers rosters, NOT
    `company_worker_engagements`. Locally proven: active engagement exists, employer's
    "Requests to review" shows nothing. The §14 approval chain breaks for the canonical
    engagement path. Fix requires a SECDEF function migration (owner-gated apply).
- Documents (/dashboard/documents, §15): renders honest per-country status + print/save exports;
  upload flow present ("Save document"). PARTIAL (UI upload not exercised to completion).
- Privacy (/dashboard/privacy): employer-visibility consent with informed-consent expansion,
  consent history, data export, human-reviewed deletion. VERIFIED_WORKING.
  - **P0-class (W-P0-1): the discoverability consent — the supply switch for the entire
    employer marketplace — is offered ONLY here, and this page is reachable only via
    Account → Privacy or command search. Nothing in onboarding, the profile checklist, or
    any worker flow asks for it. Until a worker finds it, scouting sees zero workers.**
    (Prod confirms: only 5 grants among 35 workers.) FIXED in this PR at the surface level:
    profile hub now carries an "Employer visibility" quick-link (F1).

### Employer journey (disposable local employer `audit.employer.aug8@local.test`)
- Onboarding Company → org auto-created ("audit.employer.aug8 UAB" — P3: auto-name from email
  prefix looks unprofessional; renaming not obvious).
- Employer chat is workspace-aware: chips "I need workers / Candidates / Projects". VERIFIED.
- Demand via chat: form → REVIEW BEFORE SAVING → Saved. Persisted to customer_requests
  (kind=company_request, organization_id attributed). VERIFIED_WORKING.
  - P2: post-save dead-end — no "view need"/"see matches" follow-up offered.
- Scouting (/dashboard/company/scouting): deterministic match, anonymized candidates, privacy
  copy, filter facets. After worker consent: Candidate 7E9431 = 100% fit (1/1 skills, journal
  evidence). No name/contact leaked. VERIFIED_WORKING.
  - P2 (S1): the employer's OWN empty person-identity worker row appears in their candidate
    pool ("Candidate 86CA7C", 0% fit) — self-shell pollutes results.
- Booking: Propose booking → worker's /dashboard/bookings shows proposal → Accept →
  "Confirmed…" + calendar link. `company_worker_engagements` row created with
  source_booking_id + correct company (#1047 org-first regression GREEN). VERIFIED_WORKING.
  - P1 (B1): the worker home/chat never surfaces the pending proposal, and /dashboard/bookings
    has no nav entry — a worker who doesn't know the URL never learns a company proposed work.
    (In-app notification bell content unverified; no email/push exists.)

## 5. Production read-only reality (2026-08-08 ~19:30Z, project gorgitwvdzxbnaxhrsrw)

- Deployment: main 995fa704 assumed deployed (Vercel green per baseline; not re-verified here).
- Retention (§29): cron job `ai-runs-retention-daily` schedule `17 3 * * *` active=true;
  **zero job_run_details rows and 0 sweep rows — the first scheduled tick has NOT yet occurred**
  (deployed 2026-08-08 after 03:17 UTC; first tick expected 2026-08-09 03:17 UTC). Healthy-armed;
  re-check after that tick.
- Invariant (§20/§94): exactly ONE accepted booking without engagement = `88a43ead…`
  (created 2026-08-06) — the owner-classified LEGACY_EXCEPTION. **No new violations.**
  This PR teaches the invariant module the exception (visible as `legacy_exception`,
  excluded from violationCount; any other booking in the same state still goes RED —
  negative control in tests).
- Zero-row surfaces (§30): worker_absences=0, worker_documents=0, company_worker_engagements=0 →
  classified NOT USED YET (locally proven working end-to-end this audit; supply/adoption limited,
  amplified by W-P0-1). NOT broken.
- Volume: profiles=35, workers=35, journal_entries=36, customer_requests=19,
  discoverability grants=5.

## 6. Fixes landed in this PR (§36)

- F1 (W-P0-1 surface fix): profile hub quick-link "Employer visibility" → /dashboard/privacy
  (reuses existing `privacyConsent.sections.visibility` label — zero new translation keys).
  Browser-verified: link renders, lands on the consent section.
- F2 (N2): removed the dead "Go to agency dashboard →" link to the non-existent
  /dashboard/agency (typed-routes cast had hidden the 404). Agency workspace is still
  `preparing`; no honest destination exists.
- F3 (§95): engagement-invariant LEGACY_EXCEPTION classification for 88a43ead with
  owner-decision provenance; 3 new behavioural tests incl. negative control.

## 6b. Slices 2–3 (PR #1096) and parallel session results

**Slice 2 — two defects of one shape: the product KNEW and never SAID.**
- W-J1 (P1, FIXED): the find-work search was wired (`openForm("worker.save-work-card",
  doFindWork)`) but its only trigger was a button labelled "Add another", so the chat's own
  promise ("fill this in and I'll search right away") ended at a dead card. `InlineActionForm`
  now accepts `continueLabel`; the criteria form passes the existing
  `conversation.chat.userFindWork` key (present in all 11 catalogues → no new keys, no
  i18n-debt ceiling change). BROWSER-PROVEN: card reads "Saved. | Find work"; pressing it runs
  the real search and answers honestly.
- B1 (P1, FIXED — announcement half only): pending offers were ALREADY loaded by
  `dashboard/page.tsx:73` and ALREADY rendered behind the `offers` chip; only the announcement
  was missing. `opening-brief.ts` now leads with them (rank 0 — a blocked human outranks passive
  news), reusing `bookings.pendingLink`/`pendingNote`. BROWSER-PROVEN end-to-end.
  The "bookings has no nav entry" half of the original B1 finding is **WITHDRAWN**: no nav entry
  is an owner IA ruling pinned by `lib/guards/booking-visibility-honest.test.ts:43-55`.

**Slice 3 — M11 (P1, FIXED):** public legal copy told readers to "get in touch" while the site
offered no channel: `footer.contact` was translated in all five locales and rendered nowhere, and
`/legal/legal-notice` printed both published addresses as unclickable text. Now wired to the
canonical `PRIVACY_CONTACT_EMAIL` with 44px `mailto:` rows. Nothing new published; no new keys.
Negative controls proven RED by injecting the pre-fix state, then restored.

**Parallel owner-started sessions (not this session's work):**
- #1094 MERGED — M6+M7: pricing placeholders and the unrelated AI-agency ServiceOffers block.
- #1095 Draft (owner-gated, ships UNAPPLIED) — A1 absence-review blindness. Scoping it exposed a
  SECOND regression live in production: W11's `20260804120000` re-issued `assign_worker_to_project`
  from a pre-engagement ancestor and silently dropped the
  `caller_has_booking_engagement_for_project` OR-branch, leaving that helper with zero callers.
  DB proof 48/48. This is a genuine find that this audit's read-only sweep did NOT catch.
- Mobile marketing nav (M1) — in progress.

## 7. Open defects (ledger, not fixed here)

P1 REMAINING: M1 no mobile marketing nav (<1024px loses all six header links; in progress).
P1 CLOSED SINCE: A1 (#1095 Draft, owner-gated apply) · M6+M7 (#1094 merged) ·
    B1 + W-J1 (#1096) · M11 (#1096).
P1 WITHDRAWN AS OWNER RULING: N1 · the bookings-nav half of B1 · N8 downgraded.
P2: E1 silent onboarding validation; E2 company-onboarding worker copy; A2 absence list refresh;
    S1 self-shell in scouting pool; N3/N4/N5 role leakage (account menu, command finder, inbox);
    M3 landing has no audience section; M9 "Coming soon" vs "open markets" contradiction;
    M12 duplicate id="main-content" ×5; M13 reset-password weaker than signup policy;
    demand post-save dead-end.
P3: M15 signup double legal notice; M16 "eleven languages" claim; player-card date wording;
    auto-org naming; N6 dead module registry; N7 stale FAB hook; M14 match-preview orphan;
    stale NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.example; INVITE_EMAIL_* outside env schema.
