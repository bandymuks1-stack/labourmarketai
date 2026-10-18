# LABOURMARKET-IMPROVEMENT-OPPORTUNITIES

An independent, critical review of the product and concrete proposals to complete, simplify, improve and
extend it. Part of the master set: [MASTER-MAP](LABOURMARKET-MASTER-MAP.md) ·
[FUNCTIONAL-AUDIT](LABOURMARKET-FUNCTIONAL-AUDIT.md) · [EXECUTION-ROADMAP](LABOURMARKET-EXECUTION-ROADMAP.md).

Review of main `fb741339a`, 2026-10-18. Every proposal respects the canonical architecture (one graph, no
narrowing, decision 0016: reuse before adding) and the 0 € rule: no new paid service without an economic
case and the owner's approval.

---

## A. Critical product assessment

| Question | Verdict | Why (evidence) |
|---|---|---|
| Does a visitor understand the value within 3 seconds? | **Partly.** | The landing is calm and branded, but it speaks to five audiences at once (worker, company, agency, institution, buyer). The strongest proof — "your real work becomes a verified history" — is not the first sentence. The public answer pages (questions, professions, skills, work-abroad) are reachable only from search engines. |
| Are the worker and employer paths logical and simple? | **The core is; the surface is too wide.** | 121 pages, 80 of them in the dashboard (22 admin), behind 4 header tabs; 70 dashboard routes are reachable only by in-page links, chat or search. Two admin pages are orphans; several features are reachable only by search or a chat chip. A new employer meets eight company "doors" at once. |
| Is the Work Journal really the centre? | **Yes in architecture, not yet in daily habit.** | Journal → evidence → CV → matching is wired and proven in production. But voice (the natural input on a site) is dormant, the native app has no hours field, photos are one per entry and there is no offline capture. |
| Is chat-first consistent? | **Mostly, with drift.** | One action spine serves chat, pages and AI agents (good). But 6 registered actions are dead, 2 executors have no chat door, some chat writes bypass the dispatcher, and the 8.3k-line chat component is a single point of complexity. AI intent proposal is off, so the chat is keyword-driven. |
| Does confirmed work history create real trust? | **Not yet strong enough.** | The confirmation states are honest (recorded / declared / confirmed / certified kept apart). But an owner can confirm their own work (open decision EVID-2), the journal and audit log are not immutable yet (RED #2439), and counterparty review has never been walked. |
| Does search/matching return useful results? | **Engine sound, supply thin.** | match-v1 is deterministic and explainable; scouting is anonymous by design. The real constraint is supply: few discoverable workers and imported vacancies from two countries only. Matching quality cannot be judged until supply grows. |
| Does the free plan drive use and the paid plan add enough? | **Not yet.** | Charging is not armed; the €99 plan is display-only and its extra value over free is unclear to a buyer. The free 3-profile-view limit and VIP are prepared (RED #2474) but need the owner's figures. |
| Can the marketplace work across countries with few users per country? | **Not yet.** | Services and listings work and are proven, but orders, delivery/logistics and cross-border deals do not exist, translation is off, and there is no escrow or dispute flow. A thin market per country needs cross-border matching to feel alive. |
| Are there enough protections against fraud, fake listings, unfair deals and disputes? | **Basic only.** | Organization verification is manual; there is no listing moderation queue, no report-abuse flow, no dispute/mediation centre (only documented), and per-IP brakes are in-memory. |
| Is the mobile experience good enough for daily use? | **Web yes, native not yet.** | The responsive web works and has phone layout guards. The native app is real (Expo) but unsigned, not in any store, and has no signed-in journey proven; no voice, chat, camera or offline. The phone bottom bar renders only in the admin chrome. |

---

## B. Proposals

Columns: **Benefit** · **Complexity** (S/M/L) · **Depends on** · **Risk** · **Scope** · **Priority** (P0–P4, see roadmap).

### 1. Must fix

| # | Proposal | Benefit | Cx | Depends on | Risk | Scope | P |
|---|---|---|---|---|---|---|---|
| F1 | Approve and apply the privacy package: #2477 (identity split, anonymous candidate threads), then #2474 (3-view limit, VIP, two-tier projection) | Identity stays with the worker; the plan limit holds on the data | M | Owner approval; deploy before apply | Low (rehearsed, reversible) | 2 migrations + app | P0 |
| F2 | Bring the database back under the free quota: purge dead vacancies (archived first), choose the ESCO storage option | Avoid read-only enforcement / forced upgrade | S | Owner GO (#2461 purge, #2463) | Low (archive exists) | SQL + VACUUM | P0 |
| F3 | A working backup that includes auth users and storage, kept off the application host | Recoverability | S–M | Owner adds the backup secret | Low | workflow + runbook | P0 |
| F4 | Disable production auto-deploy in the Supabase GitHub integration before any ledger repair | Prevent accidental re-application of migrations | S | Owner (dashboard) | — | setting | P0 |
| F5 | GDPR erasure executor (RED #2442) or a rehearsed manual runbook before the next statutory deadline | Legal duty | M | Owner approval | Medium | migration + runbook | P0 |
| F6 | Decide EVID-2 (block self-confirmation or label it) | Trust in "confirmed" | S | Owner decision | Low | one RPC | P1 |
| F7 | Origin accepts only Cloudflare ranges; durable rate limits for anonymous AI/intake doors | Cost and abuse protection | S | Owner (VPS) | Low | nginx + DB quota | P1 |
| F8 | Fix stale truth registers (`feature-availability.ts`, capability rows contradicted by walks) | Agents and users see the real state | S | — | Low | data | P1 |

### 1b. Quick wins found by the reachability audit (GREEN, S each)

| # | Fix | P |
|---|---|---|
| Q1 | The public for-companies lifecycle graph links an admin-only page (`/dashboard/talent`) — point it at `/dashboard/company/people` | P1 |
| Q2 | Link `/legal/data-deletion` (the URL registered with app stores) from the footer and add it to the sitemap | P1 |
| Q3 | Remove the stale `/dashboard/visual-os` registry entry and add a guard that every registry route has a page | P2 |
| Q4 | Link or retire the two orphan admin pages and declare their env flags | P2 |
| Q5 | Link `/match-preview` and the cost calculator from for-companies / pricing, or drop them from the sitemap | P2 |
| Q6 | robots.txt: drop the removed `/design` rule; `/oauth/consent` gets an explicit noindex | P2 |
| Q7 | The six native deep-link paths (`/today`, `/journal`, …) 404 on the web — add redirects to their dashboard pages | P2 |
| Q8 | The phone bottom bar renders only in admin chrome — decide: show the core tabs to every role on phones, or retire it | P2 |

### 2. Finish what is started

| # | Proposal | Benefit | Cx | Depends on | Risk | Scope | P |
|---|---|---|---|---|---|---|---|
| C1 | Transactional e-mail via a free-tier provider (invites, alerts, digest) | Growth stops depending on copied links | S | Owner: provider + DNS | Low | config | P1 |
| C2 | Voice Work Journal on a 0 € self-hosted transcription service; then voice on the phone (#2455) | The natural input on site; the journal becomes a daily habit | M | Owner host decision | Low | service + 2 slices | P2 |
| C3 | External profile links under the per-company consent (RED #2471) | Workers share LinkedIn/portfolio only with whom they choose | S | Owner approval of consent v3 wording | Low | migration + app | P2 |
| C4 | My Space pins (RED #1475) | Personal shortcuts across devices | S | Owner approval | Low | 1 table | P2 |
| C5 | Native app: sign, store listings, one signed-in journey in CI | Daily use from the home screen | M | Owner: developer accounts, keys | Medium | release | P2 |
| C6 | Payments: webhook endpoint first, then arm charging per MKT-7 | First revenue | M | Owner: two acts (MKT-7) | Medium | config + walk | P1 |
| C7 | Walk the never-walked flows: counterparty review, team → project, override receipt, password reset | Turn CODE_READY into LIVE_PROVEN | S each | Walk budget | Low | specs | P1 |

### 3. Simplify or merge

| # | Proposal | Benefit | Cx | Risk | P |
|---|---|---|---|---|---|
| S1 | One organization identity table (companies → organizations) | Removes a class of wrong reads | L | Medium (schema gate) | P2 |
| S2 | One roster truth (`engagement_contexts`) | People never vanish from capacity views | L | Medium | P2 |
| S3 | One skill-claim store; retire `candidate_skills` | Clear evidence tiers | M | Low | P2 |
| S4 | Retire dead registry actions, orphan components (~28) and legacy tables (`threads`/`messages`, `job_demands`, `contracts`) | Smaller attack and cognitive surface | M | Low | P3 |
| S5 | Split `conversation-chat.tsx` (8.3k lines) into door modules | Faster phones, safer changes | M | Medium | P2 |
| S6 | One attention surface (activity centre, notifications, assist, inbox) | Less "where do I look" | M | Low | P3 |
| S7 | Remove permanently-off constant flags and their dead branches (AI_ASSIST, VISION, LMC_*) | Honest code | S | Low | P3 |

### 4. Extend what exists

| # | Proposal | Benefit | Cx | Depends on | P |
|---|---|---|---|---|---|
| X1 | Cross-border matching as a first-class market view (supply in country A ↔ demand in B) | A thin market per country still feels alive | M | translation (X3) | P2 |
| X2 | Team (brigade) offered and matched as a unit (journey link marked broken) | The core B2B promise for construction | M | — | P2 |
| X3 | Free translation for messages and listings (self-hosted LibreTranslate or a free tier) | Cross-border conversations | M | 0 € host | P2 |
| X4 | Public organization profiles + verified-company badge with self-serve evidence | Trust for workers and buyers | M | verification evidence path | P3 |
| X5 | Recognition of demonstrated capability against formal requirements (RPL) | Education/institution journeys | L | ARCH-2 decision | P3 |

### 5. Missing important functions

| # | Proposal | Benefit | Cx | P |
|---|---|---|---|---|
| M1 | Report-abuse + moderation queue for listings, demands and profiles | Fraud and fake-listing defence | M | P1 |
| M2 | Dispute / mediation flow for bookings and service orders (design exists in docs) | Fair deals | L | P3 |
| M3 | Orders, delivery and simple logistics for the goods marketplace | The "universal marketplace" promise | L | P3 |
| M4 | Offline capture on the phone (queue journal entries and photos) | Construction sites have weak signal | M | P2 |
| M5 | Error tracking, log aggregation and an external uptime check | Know about failures before users do | S | P1 |
| M6 | Shifts / rotas (CAL-8) if the owner confirms the need | Operational planning | L | P4 |

### 6. Free / open-source options (0 €)

| Need | Option | Note |
|---|---|---|
| Speech to text | whisper.cpp (already prototyped in `services/transcribe`) on the VPS | CPU-bound; batch, not live |
| Translation | LibreTranslate self-hosted, or a provider free tier with the AI egress guard | Data-class rules apply |
| Error tracking | GlitchTip (Sentry-compatible, self-hosted) or a Sentry free tier | One DSN, no PII in events |
| Uptime | Uptime Kuma self-hosted on a separate free host | Not on the same VPS |
| Logs | Loki + Grafana (self-hosted) or journald + simple shipping | Size-capped |
| Backups | `pg_dump` + `age` encryption to off-host free object storage | Include auth + storage |
| Rate limits | a Postgres-backed counter (already used for some doors) | Survives deploys |

### 7. Later-stage technologies

Push notifications (Expo push), PWA service worker, vector search over evidence for matching
explanations (pgvector, already available as an extension option), AI agents as labour-market
participants (AI-4, only after the identity and consent model is complete), OAuth scopes for MCP tools.

### 8. Engagement, trust, growth and revenue levers

| Lever | Why it works | P |
|---|---|---|
| Invitation waves for imported people to claim their history | Turns organization data into active users | P1 |
| Weekly "your work in numbers" digest by e-mail | Habit loop around the journal | P2 |
| Verified-history badge on the CV and in discovery | Trust becomes visible and valuable | P2 |
| Company referral of its own workers (seat invitations) | Low-cost growth through employers | P2 |
| Clear paid value: unlimited views, team matching, reports, priority verification | A reason to pay | P1 (with C6) |
