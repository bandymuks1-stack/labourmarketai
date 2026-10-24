# GROWTH STRATEGY, LAUNCH PLAN, KPIs AND 30/60/90 ROADMAP — 2026-10-16

| Field | Value |
|---|---|
| **Status** | **PROPOSED.** Every item here is this audit's recommendation unless it cites an owner decision. Nothing is a requirement until the owner says so. Confirmed engineering work is marked CONFIRMED; speculative opportunities SPECULATIVE. |
| **Constraints honoured** | No paid advertising (owner). No spam, purchased engagement, fake reviews, scraping, or publication of personal work histories without consent. Public copy positive and universal; outcomes not mechanisms (AGENTS.md). No star ratings. No numbers in public copy that go stale. |
| **Companion** | [`docs/audits/MASTER_AUDIT_2026-10-16.md`](../audits/MASTER_AUDIT_2026-10-16.md) (defects, verdict) · [`docs/product/PRODUCT_MASTER_SPEC.md`](../product/PRODUCT_MASTER_SPEC.md) |
| **Evidence rule** | A number appears only with a source. "no verifiable figure" is written where none was found. The sourced research is summarised in §E.6 and §E.7. |

---

## F. The three highest-impact recommendations (deliverable F)

### F-1. Make the counterparty-confirmed work record shareable and public by consent

- **What changes.** A worker can publish a consented, indexable Living CV page (`/p/<slug>`) that shows only what they choose: confirmed engagements, confirmed hours, skills with their evidence state, photos they mark public. A "confirm this work" link lets a past employer confirm an engagement without an account (a one-time token, decision 0024 single-use, writes through the existing counterparty-review door). Share-to-employer links expire. The CV document gets a "potential" section and a consent-to-name-confirmer control (audit CV gaps).
- **Why it matters.** It is the only artefact in the market that no competitor has (LinkedIn = identity/affiliation; Upwork = platform ratings; Deputy = employer-owned timesheets). It gives a worker a reason to join before any employer is on the platform (cold-start, §7), and every consented page is an organic landing page about a real person with real confirmed work — the content type that AI search and Google cite.
- **Measurable benefit.** Public profile views → sign-ups (first-touch attribution already exists), confirmations requested → confirmations completed, share links created per active worker. Target to validate: ≥25% of active workers create a share link within 30 days of the first confirmation (hypothesis, not a forecast).
- **Difficulty.** Medium: `visibility_scope` enum already has `public_proof_link`; `can_view_worker` already gates discovery; the counterparty door exists. New: a public read RPC (anon-safe, consented fields only — RED, owner gate), the token-based confirm flow, the page and its metadata/hreflang, robots allow for `/p/*` only. ~2 engineer-weeks plus the RED review.
- **Cost.** Zero operating cost beyond hosting. No new dependency.
- **Risks.** Privacy (mitigated: opt-in per field, revocable, no employer identities without that employer's consent, no indexing of anything unconfirmed); fake confirmations (mitigated: confirmer must prove a relationship through the existing authority rule — an unlinked confirmer is shown as "declared by …", never "confirmed"); reputation gaming (no scores, only facts).

### F-2. Run the company side as "one hour a week of operations, not hiring": capacity truth + crew-lead invite loop

- **What changes.** (a) Feed the five existing commitment sources (project assignments, bookings, trips, absences, work plans) into the capacity model so "who is free" agrees with the reservation check (audit C-4, GREEN). (b) A crew-lead "invite your team to confirm this week's work" action from the company home and from the project stadium: each invited worker gets the journal with the project pre-attributed; the lead confirms; the company's evidence grows without recruiting anyone. (c) Company trust facts on the public business page: confirmed engagements, on-time confirmation rate, settled hours — facts, never reviews.
- **Why it matters.** Hiring is episodic; operations are recurring (`OPPORTUNITY_REALIZATION_LOCK_V1` §7). Small contractors in the demand markets are capacity-constrained (DK SMEs 29% shortage-constrained; SE 1 in 4 hires fails) and priced out of per-seat tools (Deputy's $30/month floor). Every invited worker is a new, already-contextualised journal user — the cheapest acquisition loop the product has, and it respects consent (join_team invitation = the consent).
- **Measurable benefit.** Invitations sent per company per week, acceptance rate, journal entries per invited worker in week 1, companies with ≥2 consecutive weeks of confirmed work (the "recurring workspace" KPI, §13).
- **Difficulty.** (a) Low (one read composition + a capacity test). (b) Medium (invitation type exists; new entry point + pre-attribution + i18n). (c) Medium (aggregates over existing confirmation tables; public RPC = RED).
- **Cost.** Zero beyond invitation e-mail (Postmark/Resend, currently off; DB caps 30/day/inviter already exist).
- **Risks.** Invitation spam (mitigated by the existing per-inviter and per-recipient caps and the fact that an invite pre-attributes real work); over-claiming on business pages (only confirmed facts with n-counts).

### F-3. Decide and finish the money path, then fund growth from the one live lever

- **What changes.** Owner decision N-1 (live Stripe is armed, webhook never observed): either disarm, or register the live webhook, run the smallest live charge + refund, enable the recovery cadence, make the activation token a real secret compared in constant time and couple `getBillingConfig` to the DB flag (audit B-1/B-2). Apply the money-RPC revoke (B-3) and the payment-reference uniqueness (B-4) before any LMC top-up. Add a money-denominated monthly AI cap and a per-organization cost view.
- **Why it matters.** The product has exactly one enforced paid lever (free org = 1 open need; €99 = unlimited) and it is live. A paying organization that receives no entitlement because no webhook fires is the single most damaging first-customer experience available. Conversely, a proven path means the first ten Nordic/DACH companies can be charged without a human in the loop.
- **Measurable benefit.** Webhook events received (today 0), trial → paid conversions, entitlement latency after payment, AI spend per active organization.
- **Difficulty.** Low in code (two GREEN changes, one RED migration already written, one new partial unique index); the proof is an owner act (Stripe dashboard + one real charge).
- **Cost.** Stripe fees on the proof charge only.
- **Risks.** Charging a trial organization before the proof (today's state); double-crediting a top-up on retry (B-4); runaway AI spend with no money cap.

---

## 7. Cold-start: value from day one, per participant group

The rule for each group: the standalone value must not depend on anyone else being on the platform.

| Group | Immediate standalone value (exists today unless marked) | Main problem solved | Registration incentive | First-session activation | Retention mechanism | Referral / invitation mechanism | Monetization potential |
|---|---|---|---|---|---|---|---|
| **Individuals / workers** | A private, append-only work record with time, site, photos and skills derived deterministically; a Living CV and EU-format export; the public job board (SE/NO ~89k ads) with honest freshness; opportunities matched to their own record | "I cannot prove three years of tiling across two countries" (no reference letters survive agency churn — NO agency ban, SE 24-month rule) | Free, no paywall anywhere; a CV that improves with every entry | **PROPOSED:** first journal entry (today the first ask is "add skills" — flip the order, audit IA-2); chat: "what did you do today?" | Day-plausibility feedback, Work-in-Numbers, job alerts (**MISSING** — DEM-8), the calendar as a projection of their own record | Ask a past employer to confirm (F-1); share a Living CV link; crew invites (F-2) | None directly (worker stays free); indirect via employer plans |
| **Employers** | Project/task/assignment board with conflict detection and override receipts; roster; hours and evidence approvals; need intake with a shortlist from evidence tiers; agency bridge | Daily coordination of a crew across sites, and proof of what was done when a dispute comes (doctrine §1: the smaller party) | Free org workspace: 1 open need, unlimited operations | Create a project, invite the crew (F-2), see the first confirmed day | Weekly confirmations, reports, the morning brief, planning zone | Invite crew; invite subcontractor teams; share a verified project portfolio (SPECULATIVE) | €99/month plan (live); later: declared boundaries (contact reveals, priority visibility) once metered |
| **Teams / subcontractors** | A team entity with consent-only membership, team offers against a demand (aggregate capability only), disband; team assignment as a unit on a client project | Being offered as a unit without exposing members; keeping the crew's history when the client changes | Collective visibility without a middleman's fee (lead-fee fatigue in DE/NL/NO trade marketplaces) | Form the team from existing members; respond to one demand | Team offers pipeline; capacity visibility (**PARTIAL**) | Lead invites members (exists); client invites the team (exists via bridge) | Later: team-level plan (OPEN) |
| **Companies / organizations** | Multi-organization contexts, roles (employer / client / contractor / subcontractor / project_operator), procurement inquiries, agreements with workflow approval, reports hub | Cross-company coordination with provenance | Same free workspace | Declare roles, connect one partner organization | Approvals engine, consolidated history | Organization invites partner companies (bridge exists) | €99 plan; agency plans (OPEN) |
| **Buyers** | Marketplace discovery across goods, services, work resources and project work; honest `unavailable`; enquiry opens a conversation; public business pages | Finding a verified provider without a lead fee | Free; no account to browse the public board; account to enquire | One enquiry | Saved searches / alerts (**MISSING**) | Buyer invites a supplier to respond (SPECULATIVE: "invite to quote" link) | None (keep buyers free) |
| **Sellers / service providers** | Listings in five domains with a publish policy; service offerings; public business page; the chat routes a plain sentence ("I have 30 kg cucumbers") to the right board (fixed in this audit) | A lawful realization path for anything they can offer, without understanding marketplaces | Free listing; no payments on-platform (no DAC7 trigger while consideration is unknown — counsel before changing) | Publish one listing from a sentence | Enquiries, expiry reminders (**PARTIAL**) | Seller shares a public listing/business page (exists) | Later: visibility boundaries, never pay-to-rank |

**Why LabourMarket.ai rather than the alternative, in one sentence per group:** workers — the record is theirs and confirmed, not a platform rating; employers — operations that double as proof, below per-seat pricing; teams — offered as a unit, members never exposed; organizations — provenance across companies; buyers — verified facts, no lead fee; sellers — a lawful path from a sentence.

---

## 8. Organic growth mechanisms (zero paid advertising)

Ordered by evidence strength and cost.

1. **Consented public Living CV pages (F-1).** Each is a real-person page with structured data; AI search cites brand-controlled structured pages and real people more than anything else (Ahrefs: brand mentions correlate 0.66 with AI Overview visibility; Semrush: comparative/structured content earns 2.4× mentions). Measure: profile views, confirm requests, sign-ups attributed.
2. **Profession × country pages from real counts.** 49 catalogue professions × 6 locales = 294 pages (plus 12 existing country pages) fed by live open-ad counts, salary band aggregates from public `compensation*` fields, the ESCO skills vocabulary and the "understood" entry sentence. Canonicalise the board's `?profession=` filter to them. Only render a country × profession page when ≥ N open ads (no thin pages). Evidence: job-board programmatic pages +199% organic in 6 months (Animal Advocacy Careers); Jobrapido +395% registrations from organic after structured data. City pages are impossible under the anon boundary — do not build.
3. **Public job board quality.** Fix U-10 (structured descriptions, no 39k duplicates); keep JobPosting off while the product is people/evidence-first (owner policy; revisit when confirmed-offer volume exists — the trade-off is the Jobs rich result, +11% views per job in early-adopter data, versus Google's expiry policing and job-board framing).
4. **An open, attributed feed of verified demand** (JSON/RSS, link-back clause like Remote OK's, demand only, no personal data). Free syndication to boards and aggregators, dofollow backlinks, AI-crawler discoverability. Small effort. Owner decision on terms.
5. **Corridor checklists as content.** Posting worker obligations per corridor (A1, SOKA-BAU + Steuer-ID, ID06 passport rule 2026, HMS-kort, Valtti, Bouwpas/VCA, RUT) — pages nobody in the market serves, directly useful to posting employers and workers, naturally linkable from associations (LSA, Byggföretagen, Embuild, Bauindustrie).
6. **Answer engine.** Infrastructure complete, 0 published answers; publish ≥20 HUMAN_APPROVED answers (LT+EN first) before advertising the hub; until then keep `/questions` out of the sitemap and llms.txt (U-11).
7. **Honest platform statistics and comparison pages.** "Open startup" transparency is a citation magnet; comparison content ("confirmed work record vs star ratings") earns 2.4× AI mentions. Every number computable from the DB, none from copy.
8. **Communities, in the person's voice.** Lithuanian diaspora Facebook groups (Norvegijos lietuviai ~67k in 2021; "Dirbantiems Norvegijoje"; Swedish community groups listed by the MFA), r/Construction (~570k), vocational schools, LSA members. Rule: answer real questions with the person's real page, never a brand pitch; no scraping, no DMs.
9. **Founder-led outreach** to the ten first demand-side companies per corridor (SE and NO construction first — ~7,100 Lithuanian posted construction workers in SE in 2025) with the company trust page and the crew invite loop as the offer.
10. **LinkedIn content** per the existing calendar in `docs/marketing/` with the safe-claims gate.
11. **llms.txt** stays (cheap) but expect no lift (≈10% adoption, read mostly by bots).

---

## 9. International acquisition plans (differentiated)

Worker-origin markets supply the record; demand markets consume it. The same product, different first move.

| Country | Role | Verified facts (sources in §E.6) | First move | Language | Legal flags |
|---|---|---|---|---|---|
| **LT** | Origin + domestic demand | 28.7k emigrants (2024); 141k foreign workers, ~28k TCN in construction; LSA Dec-2025: 70% expect shortage; boards charge €158–169/ad; public stock 10–16k vacancies/month | Workers: the record + confirm loop; employers: free operations workspace vs €158/ad boards; Užimtumo tarnyba CC BY feed for the board | LT (+RU/UA/EN for migrants) | DAC7 (services from first euro if paid on-platform); Omnibus trader flag |
| **SE** | Demand #1 | ~75k posted workers 2025, construction 46%, LT ~7,100; 76% of Byggföretagen members find recruiting hard; Platsbanken free + CC0 API; ID06 de-facto required | Promote `sv` UI (N-3); SE profession pages; ID06 "declared" attribute; outreach to firms using LT crews | SV (EN on site) | 24-month rule (entreprenad exempt) |
| **NO** | Demand #2, highest LT stock | 48k Lithuanian citizens (forum citing SSB — verify); HMS-kort mandatory; NAV feed live (token held); shortage easing (4,050) | Promote `no`; subcontracting/team-offer positioning (agency hire banned in the Oslo region); NAV terms: withdrawn ads removed immediately | NO | Agency ban Oslo region; subcontracting legal |
| **DK** | Demand, SME-skewed | SMEs 29% shortage-constrained; RUT tightened Nov 2024; Jobindex DIY 1,025 kr/3 wk, no public API | SME operations offer below Deputy/Planday pricing; RUT checklist page | DA | RUT ID-showing |
| **FI** | Mixed | Valttikortti + tax number; Duunitori free listings; construction unemployment 11.3% (Dec 2024) alongside skill gaps; Työmarkkinatori org-activated API | Later; apply for the KEHA interface as an organisation | FI (SV) | Valtti |
| **DE** | Largest demand | 41.3k unfillable skilled posts; foreign share 25%; SOKA-BAU + Steuer-ID from Sep 2025; StepStone €1.4k/ad; no lawful public API | DE locale exists; SOKA-BAU checklist; employer operations offer; no ingestion (unofficial BA API is a legal risk) | DE mandatory | SOKA-BAU |
| **NL** | Demand | 28.5k construction vacancies Q4 2025, 71% hard to fill; Bouwpas/VCA; Werkspot lead fees; UWV no API | NL locale exists; VCA as a certified evidence state; lead-fee-free provider positioning | NL/EN | Bouwpas/VCA |
| **BE** | Demand | 75 construction shortage occupations (VDAB); VDAB API by partnership | NL locale covers Flanders; VDAB partnership application | NL/FR | — |
| **LU** | Demand via frontaliers | 233k cross-border workers; ADEM CC0 skills data only | Later; EDC-compatible export angle (early EDC adopter) | FR/DE/LB | — |
| **AT** | Demand | 78% of firms short of staff; BUAK not verified; AMS no outbound API | DE locale covers; later | DE | BUAK (verify) |

Beyond these: evaluate PL and the Baltics (origin + demand, decision 0010 already names LV/EE/PL) before any further market; evaluate GE/US only when a demand-side customer asks (canonical vision §13 keeps the architecture global).

---

## 10. Viral and network-effect loops (consent-respecting)

| Loop | User value | Trigger | Friction | Expected conversion | Privacy / consent | Abuse risk | Complexity | Measure |
|---|---|---|---|---|---|---|---|---|
| Worker invites employer to confirm experience (F-1) | Confirmed record | First journal entry on a past engagement | One e-mail/link | no verifiable figure — hypothesis ≥30% of confirm requests complete | Employer sees only the engagement asked; confirmer must hold a relationship | Fake confirmers → shown as "declared", never "confirmed" | Medium (RED public RPC) | requests → confirmations |
| Employer invites crew (F-2) | Pre-attributed journal | Project created / week starts | Existing join_team invite | Instawork-style word of mouth (no published share) | Invitation = consent | DB caps 30/day, 5/recipient/day | Low–medium | invites → active journals |
| Team invites subcontractors | Unit offers | Demand received | Exists (bridge) | — | ARCH-4 aggregate only | Low | Low | — |
| Project manager invites participants | Trace + handover | Assignment | Exists | — | Engagement = consent | Low | Low | — |
| Seller shares a public listing / business page | Reach | Publish | One link | — | Public by choice | Listing spam → publish policy | Exists | shares → enquiries |
| Buyer invites a supplier to respond | Quotes | Need stated | SPECULATIVE "invite to quote" | — | Supplier chooses | Low | Low | — |
| Worker shares Living CV | Discovery | Share link | One link | — | Consent per field; revocable | Scraping → robots + token expiry | Medium | views → sign-ups |
| Company shares a verified project portfolio | Trust | Project handover | SPECULATIVE | — | Worker consent for names | Over-claiming → confirmed facts only | Medium | — |
| Organization invites partner companies | Coordination | Procurement / agreement | Exists | — | Both sides consent | Low | Low | — |

No dark patterns: no contact-list upload, no auto-messaging, no "your colleague joined" prompts.

---

## 11. Commercial market research — positioning
Summarised in the audit §7.2; strengths, weaknesses, unserved needs and differentiation in §7 and §F above. Claims we may make truthfully: counterparty-confirmed history; no paid placement; no auto-apply to third-party sites; evidence states labelled; no anonymous ratings. Claims we must never make: more interviews, bigger network, more jobs, faster hiring, "honest reviews", salary estimates without n and evidence state, reach figures.

---

## 12. Launch plan by phase (with effort, cost, dependencies, risks, metric, priority)

Effort: S < 2 days · M < 2 weeks · L > 2 weeks. Operating cost: 0 unless stated. Evidence: CONFIRMED (code/defect) vs HYPOTHESIS.

| Phase | Initiative | Impact | Evidence | Effort | Cost | Dependencies | Risks | Metric | Priority |
|---|---|---|---|---|---|---|---|---|---|
| **1 Reliability** | Restore hosting; merge the six GREEN audit branches; prod walk (audit §8 checks) | Unblocks everything | CONFIRMED | S + owner | hosting | Vercel account | — | `/api/health` build; walk pass | P0 |
| 1 | N-1 payments decision + webhook proof (F-3) | Prevents a charge without entitlement | CONFIRMED B-1/B-2 | S + owner | fees on one charge | Stripe dashboard | Charging a trial | webhook events > 0 | P0 |
| 1 | Amend + apply #2426; execute the 11-14 request | Statutory | CONFIRMED | M + owner | 0 | RED gate | Cascade into journals (fixed by amendment) | receipt issued | P0 |
| 1 | Merge #2419; AI 429 alert | Observability | CONFIRMED AI-2 | S | 0 | — | — | issue opened on next 429 | P1 |
| 1 | GOV-1 secret → live secdef + parity gates | Security CI | CONFIRMED | owner | 0 | — | — | gates active | P1 |
| 1 | Register truth (C-1, EVID-2, ARCH-5, ORCHESTRATION) after ledger read | Honest backlog | CONFIRMED | S | 0 | ledger read | — | product-truth output | P1 |
| **2 Immediate value** | Capacity feeds five sources (C-4) | Planning truth | CONFIRMED | S | 0 | — | capacity figures change | reservation = capacity | P1 |
| 2 | Journal: materials/equipment/expenses as universal optional metrics; >1 photo; documents as evidence | Owner field list | CONFIRMED gap | M | storage | — | — | entries with evidence | P2 |
| 2 | Cross-border listing fields (N-2): route distance labelled, logistics cost, currency, conditions, trader flag | Owner brief §3.5 | CONFIRMED gap | L (RED) | routing provider if route distance is live (or "ask the map" link, 0) | owner decision | DAC7/DSA framing | listings with complete fields | P1 |
| 2 | Services empty state: nearby/remote fallback; "I need goods" NL reading | Cold-start | CONFIRMED gap | S | 0 | — | — | enquiries from empty states | P2 |
| 2 | IA fixes: ask-once onboarding, one "market" meaning, one calendar, unlink /dashboard/talent | Friction | CONFIRMED IA-1..4 | S | 0 | — | — | onboarding completion | P2 |
| **3 Activation** | First journal entry as the first ask (IA-2) | Activation | HYPOTHESIS | S | 0 | — | — | registration → first entry | P1 |
| 3 | Job alerts / saved searches (DEM-8) | Retention | CONFIRMED MISSING | M | e-mail | provider on | spam → caps | alerts → return visits | P1 |
| 3 | Crew invite loop (F-2) | Acquisition | HYPOTHESIS | M | e-mail | provider on | — | invites → journals | P1 |
| 3 | A11y: focus after send, skip link, contrast | Inclusion | CONFIRMED | S | 0 | — | — | axe pass | P2 |
| **4 Distribution** | Profession × country pages; structured job descriptions (U-10); gate /questions | SEO | HYPOTHESIS + case studies | M | 0 | real counts | thin pages | organic sessions, sign-ups | P1 |
| 4 | Consented public Living CV (F-1) | SEO + loop | HYPOTHESIS | M (RED) | 0 | owner RED | privacy | views → sign-ups | P1 |
| 4 | Open demand feed with link-back | Syndication | Remote OK precedent | S | 0 | owner terms | — | referring domains | P2 |
| 4 | Corridor checklists; ≥20 answers; sv/no locales (N-3) | Content + reach | HYPOTHESIS | M–L | 0 | editorial | — | pages indexed, LT→SE/NO visits | P2 |
| **5 Network** | Company trust facts page; buyer "invite to quote"; team capacity visibility | Loops | HYPOTHESIS | M | 0 | RED public RPC | over-claiming | enquiries, offers | P2 |
| 5 | LibreTranslate host (no egress) | Cross-language threads | CONFIRMED value (145 runs before suspension) | M + owner host | small VPS | owner | — | translated threads | P2 |
| **6 Monetization** | Metering for declared boundaries; per-org AI cost view; money cap | Paid tiers honest | CONFIRMED gaps | M | 0 | — | enforcing 21 gates at once | free→paid | P2 |
| 6 | Agency plan; worker never pays | Revenue | OPEN prices | L | 0 | MDD decisions | — | MRR, churn | P3 |

---

## 13. Measurement and KPIs (privacy-conscious, first-party)

Existing: `pilot_events` (allow-listed scalar metadata, no IP/UA), first-touch attribution in localStorage → `user_metadata` (now disclosed), funnel emitters, `ops_product_metrics_v1` (people / orgs / invitations / needs / offers with TEST/INTERNAL/REAL populations), `usage_cost_events`, product monitor hourly. Nothing third-party. Extend, never replace (`OPPORTUNITY_REALIZATION_LOCK_V1` §8).

| KPI | Definition (computable today? Y/N) | Vanity or value |
|---|---|---|
| Visitor → registration | sessions with first-touch → `auth.users` created, by source | Y (attribution + users) · value only with the next row |
| Registration → activation | registered → first journal entry (worker) / first project or need (org) within 7 days | Y (journal + projects + needs) · **value** |
| Work Journal adoption | people with ≥1 entry in the last 7 days / REAL people | Y · value |
| Verified work records | confirmations by an independent counterparty (not self) per week; share of entries confirmed | Y (`journal_entry_confirmations`, self flag) · **value** |
| Employer activation | orgs with ≥1 assignment + ≥1 confirmed day in the last 14 days | Y · value |
| Company workspace usage | orgs with ≥2 consecutive weeks of confirmed work ("recurring workspace") | Y · **value** |
| Active marketplace supply | active unexpired listings + offerings, by domain and country | Y (`market_index_v1`) · vanity unless paired with enquiries |
| Buyer inquiries | enquiries → conversations opened, by domain | Y · value |
| Completed commercial interactions | accepted service requests; team offers accepted → assignment; (no payments on-platform) | Y · **value** |
| Invitations sent / accepted | by type (join_team, roster claim, bridge) | Y (`invitations`) · value |
| Returning users | people with activity in ≥2 distinct weeks of the last 4 | Y · value |
| AI cost per active user | `usage_cost_events.cost.actualCents` (served runs only, after AI-1) / weekly active people | Y · value |
| Infra cost per active user | Vercel + Supabase invoices (owner) / weekly active | N (owner inputs) |
| Free → paid | orgs trial → paid; entitlement latency after webhook | Y once webhooks arrive |
| Revenue and retention | Stripe MRR, churn by cohort | Y (Stripe) |

Vanity to avoid in public copy: registrations, listing counts, "reach". Report UNMEASURED as unmeasured, never zero (A-12).

---

## G. 30 / 60 / 90-day roadmap (deliverable G)

**Days 0–30 — Reliability (CONFIRMED work).** Hosting restored; six GREEN branches merged one at a time with `/api/health` checks; prod walk per the audit §8 list; N-1 decided and the webhook proven (or live disarmed); #2426 amended, approved, applied, the 11-14 request executed with its receipt; #2419 merged; GOV-1 secret added; ledger read → register truth PR (C-1, EVID-2, ARCH-5, C-5); B-3 applied; C-4 capacity feed; IA-1/3/4; the three test timeouts given explicit `testTimeout`; worktree cleanup (N-7).

**Days 31–60 — Immediate value + activation (CONFIRMED gaps; order PROPOSED).** First journal entry as the first ask; journal universal optional metrics (materials/equipment/expenses) and multi-photo; job alerts (DEM-8); crew invite loop (F-2 b); cross-border listing field set decided (N-2) and drafted as one RED migration; a11y fixes; U-10 structured job descriptions; gate /questions; dead negative copy removed (U-4/5); `LANGUAGE_MATRIX` corrected; three.js chore in a clean install.

**Days 61–90 — Distribution + network (SPECULATIVE, owner-gated where RED).** Consented public Living CV pages (F-1, RED public RPC); profession × country pages from real counts; open demand feed with link-back terms; corridor checklists; ≥20 published answers; `sv` promoted (N-3) if the first Nordic customer exists; company trust facts page; LibreTranslate host decision; metering for declared boundaries and a money-denominated AI cap; first founder-led outreach wave to ten SE/NO firms using LT crews.

Not on the roadmap until the owner decides: AI agents as providers (AGENT-1..4), RPL build (ARCH-2 dependency point), payments on-platform (DAC7/PWD counsel first), any paid dependency.

---

## E.6 Sources used for the market facts (verified in this session)

LinkedIn pricing/help pages; Indeed AU pricing; Upwork/Fiverr/Freelancer fee explainers (secondary); cv.lt, cvmarket.lt price pages; cvonline.lt operator financials (scoris.lt); 15min/LRT on Užimtumo tarnyba vacancy counts; Arbetsförmedlingen/JobTech dataset pages (CC0); NAV pam-stilling-feed docs and API terms; Jobindex DIY pricing; Duunitori; StepStone (secondary); MyHammer/Werkspot/Mittanbud/Byggstart pages; Checkatrade "twelve checks"; Deputy pricing; Connecteam/Planday (costbench); Fieldwire/Procore/Buildertrend/monday (secondary); Europass EDC; walt.id (vendor); Velocity Network; ID06 (schnellkompetens, Måleriföretagen); Vastuu Group; Arbeidstilsynet HMS; SOKA-BAU/DGUV; Bouwpas; mklaw.dk (RUT); EC PD A1 2023 report, Agence Europe 2024, KU Leuven HIVA 2024; byggindustrin.se 2026-03-09; av.se; fafooestforum (SSB citation); Prague Process; OECD Migration Outlook 2025; LRT/EUAA/Newland Chase on LT migration; statybunaujienos.lt (LSA survey); IW via DHZ; Bauindustrie; UWV sector pages and employer survey 2025; Byggföretagen 2026-03; NAV bedriftsundersøkelse 2025; dansk-byudvikling.dk; Rakennuslehti; rt.fi; Embuild Vlaanderen; VDAB; status.lu; STATEC; Vialto; WKÖ; Ius Laboris / Remote Work Europe on the Platform Work Directive; Vivid/Forvis Mazars on DAC7; Mondaq/CCPC on DSA Art. 30; iubenda on Omnibus; Arbeidstilsynet innleie forskrift and bygg.no; Kompetensföretagen/Magnusson on the 24-month rule; EA Forum (Animal Advocacy Careers); Google case studies (Jobrapido, ZipRecruiter, Monster India); Google JobPosting docs; Radancy on Google Jobs ads; VDU OIKOS (diaspora group count 2021); lietuviainorvegijoje.lt; se.mfa.lt; gummysearch (r/Construction); Ahrefs llms.txt study and AI Overview brand correlation; ezy.ai; Semrush ghost citations; Search Engine Land; Omnibound; BusinessWire (Yext); Wonderin.ai, Product Hunt, Tracxn; Wikipedia/Reworked/Indeed help on Glassdoor + One Login; Springer RAS 2026 paper; TechRadar; Remote OK hire page and API notice; WWR (via snippets, 403 on fetch); Remoty; small-start.com; Werkspot/Klussendirect; Etsy 10-K; leadcapture.io; Instawork help + Contrary research; Zenjob/Coople help; CICA report; data.gov.lt dataset 2894; Työmarkkinatori interface page; VDAB developer portal; data.public.lu; ADEM; EURES legal notice (indexed); Adzuna developer ToS; Jooble help; bundesAPI/jobsuche (unofficial) + netzpolitik.org; data.overheid.nl (UWV).

## E.7 Could not verify (do not use in copy)
cvbankas.lt and skelbiu.lt employer prices; Lithuania's 2024 A1 split by article/destination; current diaspora group member counts; Upwork/Fiverr/Freelancer fees against their own help centres; Indeed's current EU billing model; MyHammer/Werkspot/Mittanbud lead prices; Europages/Kompass/Credly/Quinyx/Procore/Buildertrend prices; SSB-confirmed Norwegian figures; DK/BE/AT/LU site-card schemes; 2025 volumes of SOKA/Valtti/HMS cards; the "+11% llms.txt citation lift" and Yext's 86%; LT vocational enrolment −40%; 2025 Google for Jobs UX changes; Wonderin pricing/funding/users; Glassdoor "give to get" as current policy and Enhanced Profile list price; WWR traffic; Remote OK traffic/revenue; JobTech CC0 coverage of ad text itself; Jobindex partner feed; AMS outbound API; Jooble/Careerjet attribution clauses; Indeed Publisher shutdown date; EURES partner eligibility for a non-PES platform; Užimtumo tarnyba field list and rate limits; UVA Health +188%; Instawork referral share.
