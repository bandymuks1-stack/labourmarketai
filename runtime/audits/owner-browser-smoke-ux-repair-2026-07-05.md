# Owner browser-smoke UX repair (2026-07-05)

Live-owner smoke findings against `main` (post CR-train). Each issue gets a
severity, a repair PR and an owner-retest step. Nothing here is claimed
fixed until the owner retests in a browser.

## Issue 1 — Photo report discoverability ("nesuprantu kur yra foto report")

Severity: P1. **Repaired** in PR #633 (merge `1eba1e0`): journal mode labels
(Greitas įrašas / Struktūruota ataskaita / Foto ataskaita), owner helper
wording, "Pridėti nuotrauką / paversti foto ataskaita" field label, gallery
source explanations + empty state, command-finder terms. Owner retest:
`/lt/dashboard/journal` → Foto ataskaita; `/lt/dashboard/projects/<id>` →
Darbų galerija. STATUS: awaiting owner retest.

## Issue 2 — Dead UI / non-clickable cards and unclear interactive elements

Owner quote: **"Daugiau niekas nepasispaudžia."**
Severity: **P1 overall · ONE P0** (a required operator flow whose only
visible element gives no click path).
Rule being enforced: if it looks clickable it must be clickable; if it is
not clickable it must look like plain information; if action is unavailable,
explain why and show the next step; every numeric card either navigates to
what it counts or says it is monitoring-only.

Audit method: three read-only frontend/UX reviewer passes over the actual
JSX (worker+journal+map, company, admin) at `df8dca3`. Every referenced
link target was verified to exist — nothing 404s; the problem class is
passive elements styled identically to interactive ones.

### P0 (1)

| # | Surface | Finding | Repair |
|---|---|---|---|
| A1 | Admin control room — buyer request review queue (admin/page.tsx:404-475; lib/buyer/admin-request-review.ts:83) | Action queue tells the operator to review, but rows contain NO link (select doesn't even fetch profile_id) | Fetch profile_id; link each row to /dashboard/admin/users/[id] |

### P1 — worker + journal + map

| # | Surface | Finding | Repair |
|---|---|---|---|
| W1 | work-card.tsx:200 | Non-clickable card carries glow-hover/hover-shadow | MAKE_PASSIVE (drop hover chrome) |
| W2 | worker-player-card.tsx:181 | Same hover-glow on the top card of Darbo žurnalas | MAKE_PASSIVE |
| W3 | work-card.tsx StatTiles (skills/records/readiness) | Counters, no navigation | skills→/dashboard/profile#profile-edit; records→/dashboard/journal#journal-entries; readiness stays passive (ring already explains) |
| W4 | worker-player-card.tsx Stats (skills/candidate/evidence/attention) | 4 counters, no navigation; "needs attention">0 has no path to the items | skills→profile#profile-edit; candidate→profile#candidate-skills; evidence→journal#journal-entries; attention→/dashboard/communication |
| W5 | work-card.tsx:349-362 "+ missing" chips | "+"-prefixed button-styled chips do nothing | Link chips to their fill surface (profile/journal/#work-card editor) |
| W6 | market-map-shell.tsx:124-139 | FAKE filter pills (Country/Sector) — same style as the real filter buttons | MAKE_PASSIVE (plain caption, no pills) |
| W7 | market-map-my-signals.tsx:161-169 | Place chips share active-filter styling | Retone neutral |
| W8 | map-layers-legend.tsx:72-90 | "Incomplete — add your location" rows explain but don't act | Optional href per row (person→#market-map-base; company→/dashboard/company) |
| W9 | notification-panel.tsx:208 | Raw enum `{n.type}` would render to users (latent — feed is empty today) | i18n type mapping with neutral fallback |
| W10 | journal status chips (evidence-status-strip) | Owner rule F: "waiting review" must link to who-can-review explanation | Pending-review chip links to the evidence report explanation surface |

### P1 — company

| # | Surface | Finding | Repair |
|---|---|---|---|
| C1 | company/page.tsx:503-521 ops counters | 4 stat tiles styled like the clickable cards beside them; dead | pending/accepted/members→#company-team; review→/dashboard/inbox |
| C2 | company/page.tsx:524-529 "Team" card | Ghost panel — 3 siblings have CTAs, this has none | Link to #company-team |
| C3 | company-next-actions.tsx:124-131 | Company NAME (most prominent element) not clickable | Wrap legalName in Link → /dashboard/start/company (identity readback lives there) |
| C4 | start/company/page.tsx | One route serves create AND edit with the same static heading | Heading/CTA copy split on company existence (Sukurti vs Redaguoti) |
| C5 | team-brigades-panel.tsx:109-117 | Member names as bordered pills = the clickable-chip language | MAKE_PASSIVE (plain text list) |
| C6 | demand-requests-readback.tsx:161 | Unknown status falls back to RAW enum | Neutral localized fallback label |

### P1 — admin

| # | Surface | Finding | Repair |
|---|---|---|---|
| A2 | admin/page.tsx:353-377 KPI band | 6 count tiles styled like clickable rows; all dead | reviewQueue→#request-review anchor; demand→/dashboard/admin/need-structuring; people/peopleIncomplete/companies/claims→explicit monitoring-only caption |
| A3 | admin/page.tsx:495-528 drafts tiles | 4 dead count tiles | Monitoring-only caption on the section |
| A4 | admin-launch-board.tsx:43-60 signal tiles | 7 dead count tiles, no monitoring label | Monitoring-only caption; verifiedCompanies→/dashboard/admin/company-verification |

### Documented as REMAINING (not fixed in this PR, with reasons)

- Sales-intake panel raw status enums (`submitted` etc.): DELIBERATE —
  the panel carries a visible "read-only, recorded data" declaration;
  mapping to LT labels is copy polish for a later slice.
- Follow-up buttons lack per-row loading states: polish, later slice.
- Scouting `reason(code)`/`gap(code)` bare-code fallback: same class as C6,
  larger key surface; follow-up slice.
- Project-card chat CTA links to generic /dashboard/communication (not
  project-scoped chat — that feature doesn't exist yet; honest note stays).
- LT-master guidance review state has NO admin count anywhere (nothing dead;
  visibility gap noted for a future launch-board item).
- Dead code (not dead UI): today-screen.tsx, my-work-view.tsx unmounted —
  removal candidates, separate hygiene slice.

### Verified already-correct (untouched)

Worker overview next-action cards, MyZone tiles, WorkCard editor + next-step
rows, journal day groups/entry rows/"+ Naujas įrašas", worker readiness rows
("Ką dar pagerinti" — model implementation: unmet rows link to the fix
surface), profile hub pillars, CV page, market-map real filter buttons +
future-layer disabled chips + location picker, notification bell honest empty
state, company agency-mode/connections/projects/demand cards, scouting
candidate actions + explained non-contactable state, help panel, org-members
and brigade controls, admin control-area links (all 15 resolve), sales-intake
row actions, follow-up queue actions, manager review integrity (no edit/
delete of worker text anywhere — verified).

Counts: **P0 = 1 · P1 = 20 findings across 16 files.**

## Issue 3 — Company name / multi-company clarity ("Jūsų įmonė" generic card)

Owner mobile finding: the home company card says only "Jūsų įmonė" — it does
not say WHICH company is active before actions like Pateikti poreikį /
Samdyti / Valdyti projektus. Severity: P1 (NOT escalated to P0 — see model
note). Repair PR: fix/cc/company-card-identity.

Fixes:
- home card title = the ACTIVE company's real legal name (RLS-scoped
  getOwnCompany read); generic label survives only in the honest no-company
  state; subtitle "Įmonės darbo erdvė" shown with a real name (mobile too);
- no company → the create CTA ("Sukurti įmonę" → /dashboard/start/company,
  which since #634 splits Sukurti vs Redaguoti headings) replaces the
  actions — nothing pretends a company exists;
- change-workspace: the existing Manage-spaces surface stays adjacent to
  the named card (reused, not duplicated);
- guard company-card-identity.test.ts pins all of the above + LT copy.

Model note (source-verified, why no P0): the data model holds ONE company
per profile (getOwnCompany / save_company_setup are profile-scoped) —
"multiple companies" is not representable today, and every company action
is auth-scoped to that one owned company, so an action can never hit a
"wrong" company. If a true multi-company model ever ships, the switch
action must become a real company selector and this guard must be extended.
STATUS: awaiting owner retest (route: /lt/dashboard with company role
active — the card should read e.g. "Labour market ai Sp. z o.o." with
"Įmonės darbo erdvė" beneath).
Repair PR: fix/cc/clickability-repair (see report for number/SHA).
Owner retest required before this issue may be marked closed.
