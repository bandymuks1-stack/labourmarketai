# LABOURMARKET-FUNCTIONAL-AUDIT

What really works, what does not, what is unfinished, the evidence, and the blockers — feature by feature.
Part of the master set: [MASTER-MAP](LABOURMARKET-MASTER-MAP.md) · [IMPROVEMENT-OPPORTUNITIES](LABOURMARKET-IMPROVEMENT-OPPORTUNITIES.md) · [EXECUTION-ROADMAP](LABOURMARKET-EXECUTION-ROADMAP.md).

Audit of main `fb741339a`, 2026-10-18; updated the same day after the production incident (rows 1.2, 1.12, 13.15–13.17; causes and prevention in MASTER-MAP §8); updated 2026-10-19 on main `eb21423b3` after the owner-approved apply of #2477 and #2503 (rows 1.11, 4.11, 4.20, 4.22, 7.10, 9.4, 9.7; §3 item 8). Public-safe: production data, security evidence and exposure details are in the owner's private annex.

## Status vocabulary

| Status | Meaning |
|---|---|
| LIVE_PROVEN | Proven in production — a production walk with the synthetic QA cast (`prod-qa-walk.yml`), a recorded human UI proof, or real production use. The evidence is named in the row. |
| CODE_READY | Code exists and is reachable; not proven in production. |
| PARTIAL | Only part of the feature works. |
| BROKEN | Does not work. |
| DORMANT | Built but unreachable for users (switched off, unlinked or blocked by configuration). |
| PLANNED | Only in documents, drafts or unmerged PRs. |
| UNKNOWN | Not enough evidence. |

A green CI run is **never** counted as functional proof. Walks before 2026-10-17 ran on the previous host; since the move to the VPS these specs have been re-run: role-routes, brigade-formation, journal-confirm, living-cv-growth, marketplace, mcp-chain, calendar-planning, chat-continuity; and on 2026-10-18 also project-context, agency-chain and staff-review-notice.

## 1. Summary — features per area × status

| Area | LIVE_PROVEN | CODE_READY | PARTIAL | BROKEN | DORMANT | PLANNED | UNKNOWN | Total |
|---|---|---|---|---|---|---|---|---|
| 1 Registration, login, roles, orgs, invitations | 5 | 1 | 8 | 0 | 1 | 0 | 0 | 15 |
| 2 Worker profile, Living CV, Journal, history | 10 | 9 | 14 | 0 | 1 | 1 | 0 | 35 |
| 3 Employer workspace | 6 | 14 | 12 | 0 | 0 | 1 | 0 | 33 |
| 4 Demand, search, matching, scouting, consents | 8 | 9 | 7 | 0 | 4 | 1 | 0 | 29 |
| 5 Conversations, notifications, calendar, chat | 5 | 3 | 6 | 0 | 3 | 2 | 0 | 19 |
| 6 Universal marketplace & commerce | 3 | 5 | 8 | 0 | 3 | 3 | 0 | 22 |
| 7 Plans, limits, VIP, LMC, payments | 2 | 4 | 0 | 0 | 5 | 3 | 0 | 14 |
| 8 Multilingual, markets, SEO, mobile | 3 | 5 | 6 | 0 | 2 | 1 | 0 | 17 |
| 9 Admin, security, RLS, API, GDPR | 2 | 9 | 9 | 0 | 4 | 1 | 0 | 25 |
| 10 Agents OS / AI / MCP / integrations | 3 | 3 | 6 | 0 | 13 | 3 | 0 | 28 |
| 11 Education, institutions, RPL (added) | 4 | 2 | 2 | 0 | 1 | 1 | 0 | 10 |
| 12 Map & market intelligence (added) | 0 | 4 | 2 | 0 | 0 | 0 | 0 | 6 |
| 13 Platform operations & governance (added) | 5 | 3 | 6 | 3 | 0 | 0 | 0 | 17 |
| **Total** | **56** | **71** | **86** | **3** | **37** | **17** | **0** | **270** |

## 2. Per-area status

### Area 1 — Registration, login, roles, organizations, invitations

| ID | Feature | Status | Blocker / dependency | Recommended action |
|---|---|---|---|---|
| 1.1 | E-mail + password sign-up / sign-in with e-mail confirmation (PER-1) | LIVE_PROVEN (register HUMAN_UI_PROVEN 2026-09-02; role-routes walks 2026-10-12 and 2026-10-17 on the VPS) | Supabase built-in SMTP rate limit (Free plan) | Configure a custom SMTP sender before any growth |
| 1.2 | Google OAuth | PARTIAL (BROKEN 2026-10-17→18: the sign-in return redirected to the server's bind address; fixed #2482, return redirects proven on production 2026-10-18; a full human Google sign-in on the VPS not yet walked) | A human walk with a real Google account (owner) | Owner signs in once with Google; disable unused providers in Supabase or expose them |
| 1.3 | Password reset | CODE_READY | SMTP rate limit | Walk it once |
| 1.4 | Onboarding + setup hub | LIVE_PROVEN (`product-completion-2026-10-09`) | — | — |
| 1.5 | Multi-role identity (decision 0012): worker / company / agency / customer | LIVE_PROVEN (role-routes walk 5/5, 2026-10-12, and PASS on the VPS 2026-10-17) | — | — |
| 1.6 | Organization creation + identity (ORG-1) | PARTIAL | Identity is split across two tables | Converge on one identity table (owner schema gate) |
| 1.7 | Organization verification | PARTIAL | Operator capacity | Add a self-serve evidence path (registration code / website) |
| 1.8 | Multi-capability organization (ORG-2) | PARTIAL (register BLOCKED) | **Owner decision ORG-2** | Owner decides ORG-2 |
| 1.9 | Memberships, invitations, roles (ORG-3) | LIVE_PROVEN (brigade-formation 2026-10-12 and VPS 2026-10-17; agency-chain A-2, VPS 2026-10-18; learning-practice L-2/L-3) | E-mail off (1.13) | — |
| 1.10 | Workspace context + switching (ORG-4) | PARTIAL (chat-continuity walk proves isolation, 2026-10-17) | — | Unify the resolvers |
| 1.11 | Cross-org isolation (ORG-5) | PARTIAL — #2477 applied 2026-10-19 (database checks pass; production API walk `worker-identity-split` pending) | — | Run the walk (#2505) |
| 1.12 | Universal invitation / referral network (ORG-11) | PARTIAL (the partner door answers `not_configured` since the VPS move; the partner lost its copy in its own hosting move; an invitee's return link was dropped by the callback defect, fixed #2482) | Nonstop tokens (owner, both sides) | Owner re-pairs one new secret on both sides, then resends the held lead (idempotent) |
| 1.13 | Invitation / transactional e-mail delivery | DORMANT | Owner chooses a provider + DNS (SPF/DKIM) | Configure a provider (costs 0 € on a free tier) |
| 1.14 | Staff review notice at invite / sign-up (#2321) | LIVE_PROVEN (staff-review-notice walk 4/4, 2026-10-12; VPS 2026-10-18) | #2322 | Owner decides #2322 |
| 1.15 | Organization history before claim + claim of imported people (decision 0020) | PARTIAL | Owner sends the invitations | Owner runs the invitation wave |

### Area 2 — Worker profiles, Living CV, Work Journal, confirmed history

| ID | Feature | Status | Blocker / dependency | Recommended action |
|---|---|---|---|---|
| 2.1 | Professional profile + narrative (PER-2) | PARTIAL | — | Add the editor (GREEN) |
| 2.2 | Work card: availability, pay, locations (PER-3) | LIVE_PROVEN (register HUMAN_UI_PROVEN) | — | — |
| 2.3 | CV import PDF/DOCX → confirm each fact (PER-4) | LIVE_PROVEN (register HUMAN_UI_PROVEN) | — | — |
| 2.4 | Living CV / player card / EU-format export (PER-5) | LIVE_PROVEN (HUMAN_UI_PROVEN; living-cv-growth walks 2026-10-12 and VPS 2026-10-17) | — | Add `/cv` to the smoke set |
| 2.5 | Employment history (PER-6) | CODE_READY (register PRODUCTION_PERSISTENCE; no walk) | — | — |
| 2.6 | Practice / volunteering history (PER-7) | PARTIAL | — | — |
| 2.7 | Education records (PER-8) | CODE_READY | — | Fix the stale comment |
| 2.8 | Achievements / declared certificates (PER-9) | PARTIAL | Future confirmation flow | Keep deferred |
| 2.9 | Languages (PER-10) | CODE_READY | — | Add `uk` as a worker language |
| 2.10 | External profile links (PER-11) | PARTIAL | #2471 (RED, prepared for the owner's final approval 2026-10-19) | Owner approves #2471 |
| 2.11 | Requirement ledger (PER-13) | PARTIAL | — | Mount the third context |
| 2.12 | Skill catalogue + professions (SKL-1) | LIVE_PROVEN (HUMAN_UI_PROVEN) | — | — |
| 2.13 | Deterministic recognition, journal → skill (SKL-2) | LIVE_PROVEN (sectors-languages walk 5/5, 2026-10-12) | — | Merge the #2403 fix |
| 2.14 | Evidence tier ladder (SKL-3) | LIVE_PROVEN (HUMAN_UI_PROVEN) | EVID-2 owner decision | — |
| 2.15 | Free-label skill claims (SKL-4) | PARTIAL | — | Converge the stores; retire `candidate_skills` |
| 2.16 | Transversal capabilities (SKL-5) | CODE_READY | — | — |
| 2.17 | ESCO taxonomy + typeahead (SKL-6) | PARTIAL | Quota (13.4); RED #2463; the owner forbids deleting locales | Merge or align #2410 with prod; choose an ESCO storage option |
| 2.18 | Documents / credential validity (SKL-7, decision 0021) | CODE_READY | — | — |
| 2.19 | Work Journal, four transports and one core (EVID-0) | LIVE_PROVEN (journal-confirm walk VPS 2026-10-17; chat-confirm-once 2026-10-12) | — | — |
| 2.20 | Manager review / confirm loop (EVID-2) | LIVE_PROVEN (journal-confirm walk) | **Owner decision EVID-2** | Owner decides EVID-2 |
| 2.21 | Work verification state, eight states (EVID-3) | PARTIAL | — | — |
| 2.22 | Photos / task evidence (EVID-4) | CODE_READY | — | — |
| 2.23 | Hours: journal metrics, allocations, timesheets (EVID-5) | PARTIAL | — | — |
| 2.24 | Experience records + disputes + right of reply (EVID-6) | PARTIAL | Owner decision | Fix the policy (RED) |
| 2.25 | Work intelligence / Work in numbers (EVID-7) | PARTIAL | — | Owner signs in to check |
| 2.26 | One continuous professional history (decision 0025) (not in register) | PARTIAL | Owner SQL (decision 0025 addendum B) | Owner applies the period SQL and checks the UI |
| 2.27 | Organization historical evidence import (EVID-1) | PARTIAL | ARCH-5 owner | Owner decides ARCH-5 |
| 2.28 | Historical consolidation + date correction (not in register) | PARTIAL | Owner OK on #2362 | Owner decides #2362 |
| 2.29 | Living CV potential / indirect capabilities (decision 0023) (not in register) | LIVE_PROVEN (living-cv-growth walk 3/3, 2026-10-12; VPS 2026-10-17) | — | — |
| 2.30 | Voice Work Journal (COM-6) | DORMANT | Owner: host + V-D decisions | Deploy STT on the VPS at 0 €; land #2455 V-1/V-2 |
| 2.31 | Journal evidence integrity, hash chain (not in register) | PLANNED | Owner | Owner decides #2439 |
| 2.32 | Counterparty review (decision 0018) (not in register) | CODE_READY | — | Add a walk |
| 2.33 | Gallery (not in register) | CODE_READY | — | — |
| 2.34 | Journal export + hours export (not in register) | CODE_READY | — | — |
| 2.35 | Worker discoverability consent + employer-visibility ask (not in register) | LIVE_PROVEN (prod-verified 2026-10-09/10; `final-agent-team-opening-2026-10-10`) | — | — |

### Area 3 — Employer workspace: projects, sites, teams/brigades, tasks, hours, planning

| ID | Feature | Status | Blocker / dependency | Recommended action |
|---|---|---|---|---|
| 3.1 | Company home | LIVE_PROVEN (role-routes; mobile-surfaces 2026-10-12) | Availability catalogue says `company_workspace: preparing` (stale) | Fix the stale availability flag (§7) |
| 3.2 | Projects (WRK-1) | LIVE_PROVEN (mcp-agents A-6 2026-10-14; project-context walk, VPS 2026-10-18) | — | — |
| 3.3 | Objects / sites (WRK-2) | PARTIAL | — | Delete the superseded draft from docs |
| 3.4 | Stages (WRK-3) | CODE_READY | — | — |
| 3.5 | Tasks (WRK-4) | CODE_READY | — | — |
| 3.6 | Worker → project assignment (WRK-5) | CODE_READY | — | — |
| 3.7 | Teams / brigades: create, invite by link, accept, disband (not in register as such) | LIVE_PROVEN (brigade-formation walk 13–14/14, 2026-10-12; PASS on VPS 2026-10-17) | — | — |
| 3.8 | Team → project assignment (WRK-6) | PARTIAL | — | Walk it |
| 3.9 | Readiness / operational status (WRK-7) | CODE_READY | — | — |
| 3.10 | Defects / corrections (WRK-8) | PARTIAL | — | — |
| 3.11 | Handover passport (WRK-9) | PARTIAL | — | — |
| 3.12 | Project economics (WRK-10) | PARTIAL | — | — |
| 3.13 | Project operations board + report export | CODE_READY | — | — |
| 3.14 | Employer planning / calendar (CAL-2) | LIVE_PROVEN (calendar-planning walk 6/6, 2026-10-12; PASS on VPS 2026-10-17) | — | — |
| 3.15 | Absences / leave (CAL-5) | LIVE_PROVEN (calendar-planning walk) | — | — |
| 3.16 | Capacity / gap timeline (CAL-4) | PARTIAL | — | — |
| 3.17 | Capacity reservation (CAL-7) | PARTIAL | **Journey link "authorized override recorded with receipt" is BROKEN per product-truth** | Wire the override receipt end to end |
| 3.18 | Utilisation (CAL-9) | PARTIAL | No contracted-hours data | — |
| 3.19 | Planned vs actual → learned duration (CAL-10) | PARTIAL | — | — |
| 3.20 | Shifts / rotas (CAL-8) | PLANNED | — | Owner decides |
| 3.21 | Roster: employees, historical, agency (ORG-6) | PARTIAL | — | Converge on `engagement_contexts` |
| 3.22 | People import (CSV/XLSX → people) (not in register) | CODE_READY | — | — |
| 3.23 | On/offboarding runs (not in register) | CODE_READY | — | — |
| 3.24 | Approvals / workflows (not in register) | CODE_READY | — | — |
| 3.25 | Management decisions + development reviews (not in register) | CODE_READY | — | Privacy review before promotion |
| 3.26 | Instructions (not in register) | CODE_READY | — | — |
| 3.27 | Company history page + data-quality section | CODE_READY | — | — |
| 3.28 | Manager chat answers | LIVE_PROVEN (manager-chat walk 5/5, 2026-10-12/14) | — | — |
| 3.29 | Organization documents register (not in register) | CODE_READY | — | Extract the core for MCP |
| 3.30 | Company settings + help request | CODE_READY | — | — |
| 3.31 | Reporting / export (GOV-7) | PARTIAL | — | Add PDF when a client asks |
| 3.32 | Assets / tools / equipment (MKT-3) | PARTIAL | — | — |
| 3.33 | Hours page | CODE_READY | — | — |

### Area 4 — Job offers / demand, candidate search, matching, scouting, shortlist, consents

| ID | Feature | Status | Blocker / dependency | Recommended action |
|---|---|---|---|---|
| 4.1 | Canonical demand intake (DEM-1) | LIVE_PROVEN (brigade B2B-1, agency-chain A-4, mcp-agents A-1) | Free plan: 1 open need (7.2) | — |
| 4.2 | Demand ≠ supply direction (DEM-2) | CODE_READY | — | — |
| 4.3 | Worker opportunity board + interest (DEM-3) | LIVE_PROVEN (HUMAN_UI_PROVEN) | — | — |
| 4.4 | Public job board `/jobs` (+ detail, SEO) + external vacancy ingestion (DEM-4; sources in 10.18–10.20) | PARTIAL | Quota (13.4) | Merge #2403; run the retention purge |
| 4.5 | Matching engine, 20 criteria, both directions (DEM-5) | PARTIAL | — | — |
| 4.6 | Team matching + team offer to a demand (DEM-6) | LIVE_PROVEN (brigade-formation B2B 13/13, run 38231306190, 2026-10-12) | **Register says PARTIAL/TEST_PROVEN and "migration not applied" — stale (applied; walked)** | Update the register row |
| 4.7 | B2B offer negotiation: terms v1/v2, counter, agree (not in register) | LIVE_PROVEN (brigade B2B-4/5, 2026-10-12) | #2319 | Owner decides #2319 |
| 4.8 | Anonymous public need intake (DEM-7) | LIVE_PROVEN (real production intakes, register DEM-7) | — | — |
| 4.9 | Saved searches + job alerts (DEM-8) | PARTIAL | E-mail (1.13) | — |
| 4.10 | Organizational supply discovery (DEM-9) | CODE_READY | — | — |
| 4.11 | Candidates / scouting (ORG-7) | PARTIAL — anonymous discovery projection live since #2477 (2026-10-19) | — | Production API walk (#2505) |
| 4.12 | Shortlist + notes | LIVE_PROVEN (company-chain walk 2026-09-28; old) | — | Re-walk on the VPS |
| 4.13 | Auto-match + receipt (not in register) | CODE_READY | — | — |
| 4.14 | Candidate drafts (not in register) | CODE_READY | — | — |
| 4.15 | Agency ↔ client bridge (ORG-8) | LIVE_PROVEN (agency-chain 7/7, 2026-10-12 and 2026-10-14; VPS 2026-10-18) | — | — |
| 4.16 | Interested-worker contact | CODE_READY | — | — |
| 4.17 | Discoverability consent | LIVE_PROVEN (#2217, 2026-10-09) | — | — |
| 4.18 | Employer data disclosure grant (consent v2) | CODE_READY | #2471 | — |
| 4.19 | Contact disclosure requests (COM-2) | PARTIAL | Expiry design | Machine-safe expiry RPC (RED) |
| 4.20 | Discovery identity protection (not in register) | PARTIAL — #2477 applied 2026-10-19: the raw worker row needs a working relationship; discovery returns professional fields only (database checks pass; API walk pending) | — | Run the walk (#2505), then LIVE_PROVEN |
| 4.21 | Person page name gating (#2473/#2475/#2476) | CODE_READY | Cast member | Add an unrelated synthetic employer to the cast |
| 4.22 | Free 3 unique profile views per org + VIP (RED #2474) | PLANNED | **Owner decision 2026-10-19: deferred until the payment chain works** (a free organization must not be limited without a way to pay) | Revisit when billing is live |
| 4.23 | `/dashboard/talent` sample preview | DORMANT | — | Remove or link from admin |
| 4.24 | Legacy agency worker pool (ORG-10) | DORMANT | — | Keep retired |
| 4.25 | Admin matching workbench, candidate pool, need structuring | CODE_READY | — | — |
| 4.26 | Market-direction public fit preview `/match-preview` | DORMANT | — | Link it or drop it |
| 4.27 | `job_demands` (legacy demand table) | DORMANT | — | Leave frozen |
| 4.28 | First-party supply declaration + partner representation consent (not in register) | CODE_READY | — | — |
| 4.29 | Interest → vacancy handoff to partner (not in register) | PARTIAL | Nonstop tokens | Owner re-pairs the tokens |

### Area 5 — Conversations, notifications, calendar, chat-first control

| ID | Feature | Status | Blocker / dependency | Recommended action |
|---|---|---|---|---|
| 5.1 | Chat-first home + action backbone (AI-2, decisions 0014/0017) | LIVE_PROVEN (chat-continuity PASS on VPS 2026-10-17 after #2457; HUMAN_UI_PROVEN) | — | Add fingerprints to the remaining tokens |
| 5.2 | Chat transcript persistence (decision 0024) | LIVE_PROVEN (2 rows written after deploy, chat-continuity PASS, 2026-10-17) | RED #2440 (null guard) | Owner decides #2440 |
| 5.3 | Single-use confirmations | LIVE_PROVEN (chat-confirm-once 2/2; mcp-chain M-5/M-6) | — | — |
| 5.4 | Conversations, threads, attachments, unread (COM-1) | LIVE_PROVEN (marketplace M-3/M-6, agency-chain A-7, B2B threads) | — | Retire the legacy tables |
| 5.5 | Message translation | DORMANT | Owner: provider choice | Choose a 0 € provider (Cloudflare / LibreTranslate, self-hosted) |
| 5.6 | In-app notifications, 20 types (COM-3) | PARTIAL | — | — |
| 5.7 | E-mail notifications | DORMANT | 1.13 | Same as 1.13 |
| 5.8 | Push notifications | PLANNED | ARCH-6 mobile scope | Owner scopes it in ARCH-6 |
| 5.9 | Weekly digest (COM-4) | PARTIAL | E-mail | — |
| 5.10 | Attention / activity centre (COM-5) | PARTIAL | — | Consolidate |
| 5.11 | Worker calendar, five views, one projection (CAL-1) | LIVE_PROVEN (calendar-planning walk; PASS on VPS 2026-10-17) | — | Feed the remaining stores |
| 5.12 | Availability (CAL-3) | PARTIAL | — | — |
| 5.13 | Booking request → accept → engagement (CAL-6) | PARTIAL | — | Machine-safe expiry RPC (RED) |
| 5.14 | Command finder + voice dictation (COM-7) | PARTIAL | — | Show an error when mic access is denied |
| 5.15 | Voice as an equal door (COM-8) | PLANNED | Owner COM-8 | — |
| 5.16 | Owner Telegram alerts (not in register) | DORMANT | Owner bot token | — |
| 5.17 | Support conversations (not in register) | CODE_READY | — | — |
| 5.18 | Global dashboard search | CODE_READY | — | — |
| 5.19 | Inbox report view | CODE_READY | — | — |

### Area 6 — Universal marketplace: services, goods, orders, bookings, cross-border, logistics

| ID | Feature | Status | Blocker / dependency | Recommended action |
|---|---|---|---|---|
| 6.1 | Service offerings + request loop (MKT-1) | LIVE_PROVEN (marketplace M-2/M-5/M-6, 2026-10-12; PASS on VPS 2026-10-17) | — | Fix the stale availability flag |
| 6.2 | Listings for goods and work resources, sale / rental / wanted (MKT-2) | LIVE_PROVEN (marketplace M-1/M-3/M-4, 2026-10-12; VPS 2026-10-17) | — | — |
| 6.3 | One discovery index (`market_index_v1`) + subject registry | PARTIAL | — | — |
| 6.4 | Buyer / customer workspace (decision 0007) | PARTIAL | — | Walk the customer role |
| 6.5 | Bookings (see 5.13) | PARTIAL | — | — |
| 6.6 | Proposals / contracts / agreements (MKT-4) | PARTIAL | — | Converge on `agreements` |
| 6.7 | Procurement (MKT-5) | PARTIAL | — | — |
| 6.8 | Business trips (MKT-6) | PARTIAL | — | — |
| 6.9 | Finance records (not in register) | CODE_READY | — | — |
| 6.10 | Project-cost calculator | CODE_READY | — | Link it from for-companies |
| 6.11 | Cross-border readiness / mobility (GEO-3, SKL-8) | PARTIAL | — | — |
| 6.12 | Cross-border **deals** module | PLANNED | — | Decide whether 6.6 + 6.11 suffice |
| 6.13 | Orders (goods purchase lifecycle) | PLANNED | Payments (7.x) | Design after payments are armed |
| 6.14 | Logistics / shipment / delivery / freight | PLANNED | — | — |
| 6.15 | Partners page (not in register) | LIVE_PROVEN — counted under 4.15; listed for completeness | — | — |
| 6.16 | Commercial handoff to partner (Nonstop) | DORMANT | Owner tokens | — |
| 6.17 | CRM pipeline + lead intake (not in register) | CODE_READY | — | — |
| 6.18 | Waitlist (not in register) | CODE_READY | — | — |
| 6.19 | Team enquiries (not in register) | CODE_READY | — | — |
| 6.20 | Value channels / publish eligibility (not in register) | PARTIAL | — | Wire it or fold it into `publish-policy` |
| 6.21 | Public business listings on `/business/[slug]` | DORMANT | Orgs must opt in | — |
| 6.22 | Contract payment readiness (`lib/staffing/contract-payment-readiness.ts`, `service-model.ts`) | DORMANT (dead code, see §4) | — | Delete in a GREEN cleanup |

### Area 7 — Paid plans, free limits, VIP, LMC, payments

| ID | Feature | Status | Blocker / dependency | Recommended action |
|---|---|---|---|---|
| 7.1 | Plan catalogue + `/pricing` | LIVE_PROVEN (public page; 28/28 public pages after cutover, 2026-10-17) | — | — |
| 7.2 | Free organization limit: 1 open need | LIVE_PROVEN (brigade walk "free plan = 1 open need", 2026-10-12) | — | — |
| 7.3 | Entitlement resolver (`hasFeature`) | CODE_READY | — | — |
| 7.4 | Stripe test checkout / portal / refresh / webhook | DORMANT | Owner env + rebuild | — |
| 7.5 | Live charging (MKT-7, "two owner acts") | DORMANT | Owner; #2441 | Owner decides #2441; configure the webhook before arming |
| 7.6 | Billing recovery cron | DORMANT | — | — |
| 7.7 | Manual pilot grant (admin) | CODE_READY | — | — |
| 7.8 | LMC credit ledger (MKT-8) | DORMANT | Owner (spend reversal design) | Keep off until the owner designs it |
| 7.9 | LMC top-ups, VIP media (€24.99), `ai_plus`, agency tiers, referral rates | PLANNED | — | — |
| 7.10 | Free 3 unique profile views / org + VIP + two-tier projection | PLANNED | Owner figures | #2477 applied 2026-10-19. Owner 2026-10-19: #2474 deferred (payments first), #2471 prepared for final approval, #1475 deferred (not critical) |
| 7.11 | Deferred plans: `worker_plus`, `agency_pilot` | PLANNED | Owner | — |
| 7.12 | AI cost metering + per-org run cap | CODE_READY | — | — |
| 7.13 | Plan-gated feature `booking_requests` | CODE_READY | — | — |
| 7.14 | Vacancy translation entitlement | DORMANT | AI | — |

### Area 8 — Multilingual, country markets, SEO, mobile web and app

| ID | Feature | Status | Blocker / dependency | Recommended action |
|---|---|---|---|---|
| 8.1 | UI localization (GOV-5) | PARTIAL | Translation effort | Activate lv/et/sv/no/da for the 9 launch markets (decision 0010) |
| 8.2 | Multilingual work understanding | LIVE_PROVEN (sectors-languages 5/5, 2026-10-12) | — | — |
| 8.3 | Vacancy / message machine translation | DORMANT | Provider | — |
| 8.4 | Country labour-market pages | CODE_READY | — | — |
| 8.5 | Nine priority launch markets (decision 0010: LT LV EE NL DE DK NO SE PL) | PARTIAL | Sources + locales | Add one source + locale per market |
| 8.6 | Country requirement matrix (SKL-8) | PARTIAL | — | — |
| 8.7 | Public answer engine + `/llms.txt` (GEO-5) | CODE_READY | — | — |
| 8.8 | SEO plumbing | CODE_READY | — | Check indexation in Search Console (owner) |
| 8.9 | Public organization profile `/business/[slug]` (ORG-9) | PARTIAL | Orgs | Prompt orgs to opt in |
| 8.10 | Marketing site (for-workers / companies / agencies, about, vision, create-cv, worker-intake) | LIVE_PROVEN (public pages after cutover 2026-10-17; 390 px check 2026-10-18) | — | — |
| 8.11 | Mobile web (responsive, authenticated) | LIVE_PROVEN (mobile-surfaces 2/2, 2026-10-12/14) | — | — |
| 8.12 | PWA installability | PARTIAL | — | — |
| 8.13 | Native app (Expo 57, Android + iOS) | CODE_READY | ARCH-6 scope; Apple / Play accounts | Owner decides ARCH-6; set the QA password for a device walk |
| 8.14 | App links (AASA / assetlinks) | DORMANT | Store accounts | — |
| 8.15 | Mobile release (Play / App Store listings) | PLANNED | Owner accounts | — |
| 8.16 | Language feedback (not in register) | CODE_READY | — | — |
| 8.17 | Jobs board phone layout | PARTIAL — counted with 4.4 for function; layout verified | — | — |

### Area 9 — Administration, security, audit, RLS, API, data protection

| ID | Feature | Status | Blocker / dependency | Recommended action |
|---|---|---|---|---|
| 9.1 | Superadmin console hub (about 18 pages) | CODE_READY | — | — |
| 9.2 | Admin pilots, telemetry, league, market, launch readiness, project truth, readiness verify/reject | CODE_READY | — | — |
| 9.3 | Admin user inspect `/dashboard/admin/users/[id]` | CODE_READY | — | — |
| 9.4 | Privacy request intake + admin queue + deletion preview | PARTIAL — an open account deletion request pauses discoverability (#2503, applied 2026-10-19) | Owner: acknowledgement + erasure approval | Execute the open request manually or by #2442 before the deadline (private annex) |
| 9.5 | GDPR export, bundle v3 (PER-12) | PARTIAL | — | Walk it once on the VPS |
| 9.6 | GDPR erasure executor (account deletion) | PLANNED | Owner approval | Approve #2442 |
| 9.7 | Worker row access policy (identity split, decision 0027) | PARTIAL — applied 2026-10-19 (#2477); production API walk pending | — | Run the walk (#2505); details in the private annex |
| 9.8 | RLS on every table (GOV-8) | PARTIAL | — | — |
| 9.9 | Audit trail | PARTIAL | #2439 | — |
| 9.10 | Rate limiting | CODE_READY | — | Fine while there is one instance |
| 9.11 | Same-origin + public-origin checks | LIVE_PROVEN (probe 2026-10-17, `takeover-merges…`) | — | — |
| 9.12 | Legal pages (privacy, terms, data protection, data access, deletion, cookies, marketplace rules, legal notice) | LIVE_PROVEN (#2372 verified live 2026-10-14) | Owner legal review | Note that Gemini is listed as active while AI is off |
| 9.13 | Personal location privacy (GEO-2) | CODE_READY | — | — |
| 9.14 | Telemetry / funnel (GOV-4) | CODE_READY | — | — |
| 9.15 | Search stacks (GOV-6) | PARTIAL | — | — |
| 9.16 | External referral API v1 | DORMANT | Tokens | — |
| 9.17 | Internal supply feed (Agentai OS) | DORMANT | — | — |
| 9.18 | Public JSON APIs (`professions/[id]/skills`, `workers/[id]/skills`, `health`) | CODE_READY | — | — |
| 9.19 | Admin import sandbox | DORMANT | — | — |
| 9.20 | Admin intelligence observation inspector | DORMANT | — | — |
| 9.21 | Company verification admin | CODE_READY — counted in 1.7 (admin side) | — | — |
| 9.22 | Secrets / env schema validation | CODE_READY | — | — |
| 9.23 | Security-definer function governance | PARTIAL | GOV-1 | — |
| 9.24 | Security incident handling and evidence (not in register) | PARTIAL | security hardening in progress — details in the private annex | see EXECUTION-ROADMAP P0 |
| 9.25 | CodeQL / dependency alerts | PARTIAL | Owner repo setting | Turn on Dependabot alerts (free) |

### Area 10 — Agents OS / AI / MCP and other integrations

| ID | Feature | Status | Blocker / dependency | Recommended action |
|---|---|---|---|---|
| 10.1 | MCP door: 229 tools, Supabase JWT bearer, PRM, RFC 9728 (AI-1) | LIVE_PROVEN (mcp-chain walk on Vercel prod 2026-10-13 and on VPS 2026-10-17) | — | — |
| 10.2 | Agent scenarios over MCP (buyer / supplier / proposal / messaging / projects / isolation) | LIVE_PROVEN (mcp-agents 9/9, 2026-10-14; before the cutover) | — | — |
| 10.3 | OAuth 2.1 for MCP clients (Supabase AS, DCR, PKCE, consent page) | PARTIAL | Owner: #2454 | Merge #2454; run W-1/W-2 walks |
| 10.4 | MCP scopes enforcement | PLANNED | — | — |
| 10.5 | ChatGPT app / Claude directory listings (distribution surfaces 4 and 5) | PARTIAL | Owner portals | — |
| 10.6 | AI runtime: providers, registry, cost ceilings, egress gate (AI-3) | DORMANT | Owner: provider / paid tier (0 € rule) | Decide a 0 € path (self-hosted / Cloudflare) per task class |
| 10.7 | Conversation intent proposal (LLM) | DORMANT | 10.6 | — |
| 10.8 | CV AI structuring / worker intake AI | DORMANT | 10.6 | — |
| 10.9 | Journal AI suggestions | DORMANT | 10.6 | — |
| 10.10 | Match explanation / company need / market explanation AI | DORMANT | 10.6 | — |
| 10.11 | Six registered agents with no call site (`skill_evidence`, `country_readiness`, `document_assistant`, `booking_risk`, `admin_risk`, `support_onboarding`) | DORMANT | — | Wire them or retire them in the register |
| 10.12 | Legacy assist provider (`lib/ai/provider.ts`, `noop-provider.ts`, `legacy-assist-schemas.ts`, `estimate-clarify-actions.ts`, `lib/config/ai.ts`) | DORMANT | — | Delete in a GREEN cleanup (guard update) |
| 10.13 | `/dashboard/assist` (deterministic attention + provider state) | CODE_READY | — | Fold into the activity centre |
| 10.14 | Agents OS admin page | PARTIAL | — | — |
| 10.15 | Agents OS runtime (autonomous internal agents) | PLANNED | — | — |
| 10.16 | AI agents as labour-market participants, PROVIDER mode (AI-4, §1.13) | PLANNED | AGENT-1..4 owner decisions | Owner decides AGENT-1..4 |
| 10.17 | External action receipts | CODE_READY | — | — |
| 10.18 | Vacancy source: Arbetsförmedlingen (SE) | LIVE_PROVEN (#2402 run 38740080681, 2026-10-15) | Quota | — |
| 10.19 | Vacancy source: NAV (NO) | PARTIAL | — | Finish the parser + backfill |
| 10.20 | Vacancy retention / archive | PARTIAL | Owner GO (SQL via MCP) | Owner GO this week (quota deadline 2026-10-20) |
| 10.21 | Eurostat import | DORMANT | — | — |
| 10.22 | Nonstop integration (referral in, commercial handoff out) | DORMANT | Owner, both sides | — |
| 10.23 | Agentai OS supply feed | DORMANT | — | — |
| 10.24 | Self-hosted STT (`services/transcribe`, whisper.cpp) and translate (`services/translate`) | DORMANT | Owner: deploy on the VPS (1 vCPU / 3.9 GB is tight) | Test resource fit before deploying |
| 10.25 | Cloudflare Workers AI adapter (translation only) | DORMANT | Owner key | Candidate for 5.5 / 8.3 |
| 10.26 | OpenAI apps challenge route | DORMANT | Owner | — |
| 10.27 | Maps (Leaflet / OSM, Waze deep links) | CODE_READY | — | — |
| 10.28 | ESCO dataset | PARTIAL — counted in 2.17 (storage side) | — | — |

### Area 11 — Education, institutions, recognition / RPL (added area)

| ID | Feature | Status | Blocker / dependency | Recommended action |
|---|---|---|---|---|
| 11.1 | Institution capability + learner link (EDU-1) | LIVE_PROVEN (learning-practice L-1..L-3, 2026-10-12) | — | Learner-name RPC (owner) |
| 11.2 | Programmes / cohorts / members (EDU-2) | LIVE_PROVEN (L-4, 2026-10-12) | — | — |
| 11.3 | Learning compass (EDU-4) | LIVE_PROVEN (L-5, 2026-10-12) | — | — |
| 11.4 | Practice capacity offered by non-school companies | LIVE_PROVEN (L-8, 2026-10-12) | Placement-host relationship (owner) | — |
| 11.5 | Learner outcomes (EDU-3) | CODE_READY | — | — |
| 11.6 | Institution reporting + export (EDU-6) | CODE_READY | — | — |
| 11.7 | Recognition of practice → competency recognition (SKL-9 part) | PARTIAL (recognition-chain walk PASS 2026-10-12; equivalence / RPL structure deferred, ARCH-2) | — | — |
| 11.8 | Training & certification register (SKL-10) | PARTIAL | — | — |
| 11.9 | Human-in-loop learning review (EDU-5) | DORMANT | Owner parks it | Owner decides the nav door |
| 11.10 | Qualification / RPL equivalence structure (ARCH-2) | PLANNED | RED schema later | — |

### Area 12 — Map & market intelligence (added area)

| ID | Feature | Status | Blocker / dependency | Recommended action |
|---|---|---|---|---|
| 12.1 | Market map (GEO-1) | PARTIAL | — | Re-walk |
| 12.2 | Labour-market intelligence (GEO-4) | PARTIAL | — | — |
| 12.3 | `/dashboard/intelligence` trust insights | CODE_READY | — | — |
| 12.4 | Need text → demand recognizer `/dashboard/market/recognize` | CODE_READY | — | — |
| 12.5 | Public market facts / coverage claims | CODE_READY | — | — |
| 12.6 | Admin league / market counts | CODE_READY | — | — |

### Area 13 — Platform operations & governance (added area)

| ID | Feature | Status | Blocker / dependency | Recommended action |
|---|---|---|---|---|
| 13.1 | VPS hosting + auto-deploy (Vercel removed) | LIVE_PROVEN (deploy run 39119122990, 2026-10-18) | — | — |
| 13.2 | Health probe + product monitor | LIVE_PROVEN (alert open → auto-close, 2026-10-12; health 10/10, 2026-10-18) | — | — |
| 13.3 | Production QA walk harness | LIVE_PROVEN | Walk budget | — |
| 13.4 | Supabase capacity on the Free plan (500 MB) | BROKEN | Owner GO: purge + ESCO option (#2463) | Owner GO now |
| 13.5 | Database backup | BROKEN | Owner secret | Owner adds the secret |
| 13.6 | VPS cron bundle | PARTIAL | — | — |
| 13.7 | Migration safety + parity gates (GOV-1) | PARTIAL | Owner: a proper read-only role | — |
| 13.8 | Migration ledger parity | PARTIAL | — | Reconcile with a record-only process |
| 13.9 | Supabase GitHub integration | BROKEN | **Owner turns off prod auto-deploy** | Disable it before any ledger repair |
| 13.10 | Quality gates (GOV-2) | LIVE_PROVEN (required check on every main push) | — | — |
| 13.11 | E2E in CI (GOV-3) | PARTIAL | — | — |
| 13.12 | Executable product constitution (GOV-9) | CODE_READY | — | Refresh the stale rows |
| 13.13 | Feature-availability catalogue | PARTIAL | — | Re-baseline the catalogue |
| 13.14 | Owner waivers / landing freeze / product gate | CODE_READY | — | — |
| 13.15 | Browser compatibility: Safari / iOS < 16.4 and old in-app browsers | LIVE_PROVEN (2026-10-18: old-browser emulation against production — 8 entry pages crashed on load before #2483, 0 errors after; current browsers keep the native constructor; a physical old iPhone not tested) | — | Keep the shim first in `<head>`; re-run the old-browser emulation after large client changes |
| 13.16 | Browser crash reports (sanitised, logged, not stored) | CODE_READY (#2484) | — | Read `[client-error]` lines in the container log after each release |
| 13.17 | Environment parity after a hosting move | PARTIAL (2026-10-18 probe: the partner referral secret and the supply-feed secret are absent; payments, AI, owner alerts and voice are off by the minimal VPS configuration) | Owner: which integrations to re-enable | Hosting-move checklist (MASTER-MAP §5, §8) |

## 3. Documented but not built

1. Shifts / rotas / rosters (CAL-8).
2. Voice as an equal door to the action spine (COM-8). Voice on the phone (#2455 plan V-1/V-2).
3. AI agents as labour-market participants, PROVIDER mode (AI-4, §1.13, AGENT-1..4).
4. An Agents OS runtime inside the product. The admin page shows only doc cards.
5. RPL / recognised-equivalence structure (ARCH-2, deferred).
6. The subject's right to refuse an imported record (ARCH-5).
7. GDPR erasure executor (RED #2442). Journal evidence hash chain + immutable audit log (RED #2439).
8. Profile-view limit + VIP (RED #2474). External profiles under consent v3 (RED #2471). My Space pins (RED #1475; `workspace_pins` is absent in prod, the UI is hidden by `pinsAvailable`). Auto-enabled staff review (RED #2322). Offer label per thread (RED #2319). Machine-safe expiry for bookings and contact disclosures.
9. Live-payment DB flag (RED #2441). LMC top-ups, VIP media, `ai_plus`, agency tiers, referral rates. The `worker_plus` and `agency_pilot` plans.
10. Orders, logistics / delivery / freight, a cross-border deals module, a permit / posting workflow.
11. MCP scope enforcement (PR-4). Claude connector / directory listing. ChatGPT app store submission.
12. Push notifications, an offline PWA service worker, App Store / Play listings.
13. Complaint & mediation centre (`docs/product/complaint-mediation-future-scope.md`). Inspection & work review (`inspection-and-work-review-future-scope.md`). Reputation system P3 and invoice results P4 (`LABOURMARKETAI_NEXT_FUNCTIONS_PLAN.md`).
14. A public organization directory (ORG-9). PDF / XLSX reports.
15. Superseded drafts that will never be applied: `company_locations`, `multi_source_talent`, `dashboard_preferences`, `demand_interest_seen`, `open_markets_countries`.
16. Historical date correction (RED #2362). The predecessor-company period SQL (decision 0025, addendum B).

## 4. Built but unreachable, dormant or dead

**Unlinked routes**
- `/dashboard/talent` (superadmin sample, no inbound link)
- `/dashboard/learning` (orphan, owner-parked)
- `/dashboard/admin/import-sandbox` and `/dashboard/admin/intelligence-observations` (unlinked, flag-off)

**Weakly linked routes**
- `/match-preview` and `/work-opportunities` (sitemap / answer-engine only)
- `/calculators/project-cost` (command palette + sitemap)
- `/dashboard/buyer` (only via the start hub)
- `/dashboard/market/recognize` (only from market-map)
- `/dashboard/inbox/report` (only from inbox)

**Switched off by production env** (code is fine)
- All AI agents
- Message and vacancy translation
- Stripe test and live checkout, billing recovery, LMC (7 flags false)
- Invitation and notification e-mail
- Telegram owner alerts
- Voice transcription
- Nonstop referral and handoff
- Supply feed
- OpenAI challenge, AASA, assetlinks
- Eurostat import (no workflow)

**Dead code (no non-test importer)**
- `lib/feedback/work-feedback-loop.ts`
- `lib/staffing/contract-payment-readiness.ts`, `lib/staffing/service-model.ts`
- `lib/lmc/compensation.ts` `compensateSpend`
- `gateFeature` in `lib/billing/entitlements.ts`
- `components/marketing/service-offers.tsx` (deliberately unrendered)
- Legacy AI assist (`lib/ai/provider.ts`, `noop-provider.ts`, `legacy-assist-schemas.ts`, `estimate-clarify-actions.ts`, `lib/config/ai.ts`)
- 6 registered AI agents with no call site
- `lib/value-channels/channel-registry.ts` (no outside importer)
- Legacy agency pool `lib/agency/pool*.ts` (RETIRED)

**Dead tables**
- `job_demands`, `contracts` (legacy of `agreements`), `candidate_skills` (0 rows), `subscriptions` (no reader), `threads` / `messages` (legacy messaging), `agencies` / `agency_workers` (Model A)

## 5. Duplicates and overlapping implementations

1. **Organization identity:** `companies` (write) vs `organizations` (read mirror) (ORG-1).
2. **Roster truths:** `engagement_contexts` vs `company_workers`, `company_worker_engagements`, `agency_workers`, `organization_people`. People and capacity still partly read the legacy table (ORG-6).
3. **Skill claims:** `profile_skill_claims` + `worker_skills` + the frozen `candidate_skills` (SKL-4). There is also the platform taxonomy vs ESCO (bridged, intended).
4. **Commercial documents:** `proposals` / `contracts` / `agreements` (MKT-4).
5. **Search:** four stacks (`lib/search`, jobs ILIKE, ESCO typeahead, dashboard-search) (GOV-6).
6. **Attention:** spread across four surfaces (activity centre, notification panel, assist, inbox) (COM-5). `/dashboard/assist` overlaps the activity centre.
7. **Workspace context resolvers:** `getActiveOrganizationContext` vs `getWorkspaceContext` (ORG-4).
8. **Rate limits:** in-memory `rate-limit.ts` vs DB `request-rate-limits.ts`. They are complementary, but undocumented as a pair.
9. **Messaging:** legacy `threads` / `messages` tables vs `conversations` / `conversation_messages`.
10. **Matching:** `/match-preview` fork (`lib/staffing/fit.ts`) vs `match-v1`. Kept deliberately (STEP D); re-check when AI returns.
11. **Hours:** `/dashboard/hours`, Work in numbers, timesheets and journal metrics. They share one derivation rule (good), but there are three surfaces.
12. **Contradictory capability truth:** `feature-availability.ts` ("preparing" / "hidden") vs the capability register and the prod walks (live).

**Duplicate findings that are FALSE** (kept on purpose, per the register's STEP D):
- the four availability vocabularies
- the `match-preview` fork
- `agency_client_connections` + `agency_clients` (Model B)

## 6. Where this audit disagrees with the capability register

| Register item | Register says | This audit | Why |
|---|---|---|---|
| DEM-6 Team matching | PARTIAL / TEST_PROVEN; migration "built in code but NOT APPLIED" | LIVE_PROVEN (4.6) | The team-offer migrations were applied (`master-audit-2026-10-16`), and the brigade B2B walk passed 13/13 in prod (2026-10-12). |
| MKT-1 / MKT-2 Services, listings | PARTIAL | LIVE_PROVEN (6.1 / 6.2) | The marketplace walk passed 6/6 in prod (2026-10-12) and again on the VPS (2026-10-17). The remaining gaps are noted in-row. |
| CAL-1 / CAL-2 / CAL-5 Calendar, absences | PARTIAL | LIVE_PROVEN (5.11, 3.14, 3.15) | The calendar-planning walk passed on Vercel prod and on the VPS. The register itself says "not a human walk". |
| EDU-2 / EDU-4 and journey "Learners join the cohort" (product-truth: BROKEN) | PARTIAL; journey BROKEN | LIVE_PROVEN (11.2 / 11.3) | learning-practice L-2..L-5 passed in prod (2026-10-12). "BROKEN" here mixes zero real usage with missing code (ARCH-3). |
| AI-1 MCP note | "OAuth authorization server is not enabled by the owner" | OAuth live; ChatGPT OAuth proven 2026-08-30 | `docs/integrations/CHATGPT_MCP_CLIENT_V1.md`. `docs/CAPABILITY_INVENTORY.md` still says "12 MCP tools", but there are 229. |
| AI-3 AI runtime | PARTIAL, "real spend" | DORMANT (10.6) | VPS env `AI_PROVIDER_MODE=disabled` since the 2026-10-17 cutover. Also: the register says 13 agents, the code has 14 (`lib/ai/README.md` says 12). |
| GOV-1 | "add a read-only `SUPABASE_DB_URL` secret" | The secret exists; its role lacks reads | `takeover-merges-and-vps-restore-2026-10-17` (backup blocker). |
| PER-11 External profiles | PARTIAL, unblocked | PARTIAL, plus a defect | The visibility toggle never saved (missing RPC). It was replaced by a static label in #2472, and the v3 consent is RED #2471. |
| PER-1 Auth | BUILT_AND_USABLE | LIVE_PROVEN, with caveats | E-mail delivery is off, SMTP is rate-limited on the Free plan, and Google was not re-walked after the domain moved to the VPS. |
| CAL-8 / COM-8 | MISSING | PLANNED | Same meaning, mapped. |
| ORG-10 | RETIRED | DORMANT | Mapped. The anti-revival guard is correct. |

The walks cited above use the synthetic QA cast on production. They are stronger than CI and weaker than a real person's use. Rows marked LIVE_PROVEN from before 2026-10-17 were proven on the Vercel deployment; since the VPS cutover only these specs have been re-run: role-routes, brigade-formation, journal-confirm, living-cv-growth, marketplace, mcp-chain, calendar-planning and chat-continuity, plus project-context, agency-chain and staff-review-notice on 2026-10-18.

## 7. How to keep this audit current

- A production walk that proves or breaks a feature updates its row (status + evidence) in the same PR as the fix.
- A capability-register change updates the register snapshot in the MASTER-MAP (guarded).
- The full evidence (production counts, logs, security proofs) is kept in the private annex only.
