# LabourMarket.ai — canonical completion map (2026-11-01)

> Generated from `docs/program/FUNCTION_REGISTER.md` (the single source of status). This map adds remaining work, effort,
> dependency, priority and lane per function. Security and permission details stay in the private record (AGENTS.md).
> Status words here: VERIFIED = `LIVE_VERIFIED`; PARTIAL = `PASS_CI_ONLY` or `NOT_VERIFIED`; FAILED = `FAIL`.

## Full planned scope

| Status | Count |
|---|---|
| VERIFIED | 185 |
| BLOCKED | 40 |
| PARTIAL | 31 |
| NOT IMPLEMENTED | 22 |
| FAILED | 9 |
| OPTIONAL | 1 |
| **Total** | **288** |

- **Scope:** 277 register rows, minus 2 DUPLICATE rows (7.10 = 4.22, 4.17 = 2.35), plus 13 functions found in the vision, architecture and decision documents (2.36, 2.37, 3.34–3.36, 4.30, 5.20, 5.21, 6.22–6.24, 7.30, 7.31) = **288**.
- **Verified in production:** 185 / 287 = **64.5 %**. The optional Stripe TEST scenario is excluded.
- **Built:** everything except NOT IMPLEMENTED = 265 / 287.
- **Seven rows** that product-truth contradicts moved from LIVE_VERIFIED to NOT_VERIFIED / FAIL on 2026-11-01. Their earlier proof stays in the register.

## The 7 incomplete user journeys

| Journey | State | What finishes it | Who |
|---|---|---|---|
| J-6 company invites a person | partial | D-5 provisioning, then the invited-worker walk | owner, then coordinator |
| J-10 brigade as a unit | partial | unit matching link (3.8, 4.6) | P0-CDF lane |
| J-12 institution → learner → qualification | partial | learner self-join (ARCH-3), RPL (ARCH-2) | owner decision, then Education lane |
| J-13 buyer workspace → provider | partial | open item on 6.4; request → offer/contract (RED-1) | owner decision, then P0-CDF |
| J-14 organization buys a plan | blocked | terms (7.28), VAT #2685, EUR 99 visibility, tiers (7.31) | owner and legal, then P0-E |
| J-15 job alert e-mail | unverified | D-4 mailbox walk | owner, then coordinator |
| J-17 install from a store | blocked | store accounts, signing, closed test | owner, then mobile lane |

## Android and iOS

- **Technical state:**
  - Expo SDK 57 / RN 0.86, bundle id `ai.labourmarket.app`.
  - Signed-in journeys are proven against production on an Android emulator and an iOS simulator (8.17, 8.18).
  - No physical device or signed build has been tested yet.
- **In the app:** email sign-in, Today, Work Journal draft/confirm, Living CV skills, jobs, availability, need intake, 6 locales, a keychain session, an account-deletion link, and a privacy manifest. No push and no risky permissions.
- **To reach web parity (owner directive 2026-11-01):** journal correction, messages, in-app notifications, projects.
- **Store blockers (owner):**
  - Google Play account ($25). A personal account needs a 12-tester closed test for 14 days; an organisation account (D-U-N-S) does not.
  - Apple Developer ($99/yr).
  - Signing keys and certificates, the App Store Connect record, store art approval.
- **After the accounts exist:**
  - technically ready: 1–2 agent days;
  - submittable: about 1 day after account verification;
  - public on iOS: 1–3 review days per round;
  - public on Android: about 15 or more calendar days on a personal account.

## ChatGPT / OpenAI

- **Live:** the MCP endpoint (10.1). Journal draft/confirm/correct and the Living CV tools are proven in production. The ChatGPT developer-mode connector was proven on 2026-08-30.
- **Before any public listing:**
  - the scripted OAuth walk (10.3);
  - product scopes and a curated toolset (10.4, owner decision X-2);
  - security hardening items (details in the private record);
  - consent wording and a data-minimisation pass;
  - listing assets.
- **Sign-in:** "sign in with a ChatGPT account" as an identity provider is not a product to assume. The documented path is a ChatGPT app/connector over MCP with OAuth, where LabourMarket.ai is the authorisation server. Official options are to be confirmed from OpenAI documentation.
- **External / owner:** directory listings (10.5), the domain challenge (10.26), OpenAI verification, final legal pages, and the AI runtime decision (10.6).
- **Effort:** about 8–14 agent days.

## Critical path

1. **Owner decisions and legal:** terms (7.28), pricing tiers (7.31, MKT-7), store accounts, AI provider (10.6), connector decisions X-1…X-8, and ARCH-3/5/6, ORG-2, EVID-2/6, PER-11, RED-1.
2. **Store accounts:** the Play closed test (14 days on a personal account) is the longest fixed wait.
3. **After pricing:** the billing build (7.31, LMC, VIP, invoices 7.20/7.30) is the largest engineering block.
4. **In parallel, no owner input needed:**
   - the 7 reconciled rows;
   - production proof of PARTIAL rows;
   - the forecast engine (3.34), pipeline (4.30), overlap flow (3.35);
   - mobile parity;
   - ChatGPT security work.

## Effort and targets

| Block | Agent effort | Lane | Owner dependency |
|---|---|---|---|
| Reconciled rows + production proofs | 10–15 d | coordinator + P0 lanes | D-4/D-5 for 3 rows |
| Partial functions 2.36, 3.34–3.36, 4.30 | 15–25 d | P0-D, P0-CDF, P0-A/B | 3.36 confirm |
| Mobile parity + store submission | 12–18 d | mobile lane | store accounts, art approval |
| ChatGPT production readiness | 8–14 d | MCP/AI lane | X-2, OAuth walk release, listing accounts |
| Billing: tiers, LMC, VIP, invoices, VAT | 25–40 d | P0-E | pricing + legal + VAT approval |
| New modules 2.37, 5.20, 5.21, 6.22–6.24, 7.30 | 45–65 d | P0-CDF, P0-E | scope decisions; 5.21 paid provider |
| Owner-designed modules 6.12–6.14, 10.15, 10.16, 11.10, 8.5 | 50–80 d | various | owner design decisions |
| BLOCKED rows after unblock (40) | 20–40 d | various | each row's owner step |

- **Total remaining agent work:** about 185–295 working days. With 5 parallel lanes and timely owner decisions, about 9–13 calendar weeks.
- **Targets** (conditional, not guaranteed; reviewed weekly):
  - **core product** complete and public: **mid-December 2026**;
  - **full historical scope:** **February 2027** (preliminary).

## FAILED (9)

| ID | Function | Priority | Remaining work | Effort | Dependency | Lane | Evidence (register) |
|---|---|---|---|---|---|---|---|
| 2.20 | Manager review / confirm | P1 | open security/permission item - details in the private record | 1-5 d | - | P0-A/B journal + Living CV | 2026-11-01: 2026-11-01 reconciled with product-truth: self-confirmation is not blocked at the integrity level (EVID-2); details in the priva… |
| 2.24 | Experience records + disputes | P1 | open security/permission item - details in the private record | 1-5 d | - | P0-A/B journal + Living CV | 2026-11-01: 2026-11-01 reconciled with product-truth: open RED moderation item (EVID-6); details in the private record; the earlier producti… |
| 7.27 | Free VIP for approved employers | P1 | owner #2474 | 1-5 d | owner/legal | P0-E billing (owner-gated) | —: admin grant invisible in live org workspace (registry BROKEN) |
| 7.28 | Payee and terms | P0 | owner/legal clauses (RED); meta-text removal in progress | 1-5 d | owner/legal | P0-E billing (owner-gated) | —: live terms name seller UAB the partner organization but no renewal/cancellation/refund/14-day withdrawal clauses, and say legal info is '… |
| 9.25 | CodeQL / dependency alerts | P0 | open security/permission item - details in the private record | 1-5 d | - | P0-E admin + privacy + security | 2026-11-01: 2026-11-01: triaged, details in the private record; earlier: #2879, #2880, #2881 merged |
| 10.20 | Vacancy retention | P1 | open security/permission item - details in the private record | 1-5 d | - | MCP / AI | 2026-10-23: dry run 39936626534 10-23 fails closed: service_role lacks SELECT on 2 protected-id tables; would purge 110,481/[volume withheld… |
| 11.8 | Training & certification register | P1 | engaged non-member workers cannot be assigned training (owner product decision, RED #2816) | 1-5 d | owner/legal | Education | 2026-10-28: company-governance 40687308231 (2026-10-28 12:28Z) green incl. T-5 — #2857 workspace scoping LIVE_VERIFIED; course register, ass… |
| 13.1 | VPS hosting + auto-deploy | P0 | REGRESSION-class infra: GitHub-runner → VPS inbound loss now fails production walks; provider network fault probable, not proven; Hostinger ticket pending owner | 1-5 d | owner/legal | Infra (coordinator) | 2026-11-01: 2026-11-01: infrastructure finding and remediation #2911 + agentai#1226 (live 2026-11-01); details in the private record; 72 h v… |
| 13.17 | Env parity after hosting move | P1 | OWNER+LEGAL: AI off coincides with owner 10-15 Gemini personal-data restriction (needs billed key + AI_GEMINI_PAID_TIER_CONFIRMED=1 / DPA). SMTP: LM_SMTP_PASS + INVITE_EM… | 1-5 d | owner/legal | Infra (coordinator) | 2026-10-27: 2026-10-27 read-only: last real AI call gemini 2026-10-15 16:07; since then provider=disabled reason=mode_disabled (AI_PROVIDER_… |

## BLOCKED (40)

| ID | Function | Priority | Remaining work | Effort | Dependency | Lane | Evidence (register) |
|---|---|---|---|---|---|---|---|
| 1.8 | Multi-capability organization | P2 | waits for an owner step | 0.5-3 d after unblock | owner | P0-A identity | —: owner decision ORG-2 |
| 2.10 | External profile links | P2 | waits for an owner step | 0.5-3 d after unblock | owner | P0-A/B journal + Living CV | —: RED #2471 |
| 2.27 | Org historical evidence import | P2 | waits for an owner step | 0.5-3 d after unblock | owner | P0-A/B journal + Living CV | —: ARCH-5 owner |
| 2.28 | Historical consolidation | P2 | waits for an owner step | 0.5-3 d after unblock | owner | P0-A/B journal + Living CV | —: owner OK on #2362 |
| 2.30 | Voice Work Journal | P2 | waits for an owner step | 0.5-3 d after unblock | owner | P0-A/B journal + Living CV | —: STT host (owner) |
| 4.18 | Employer data disclosure grant | P2 | waits for an owner step | 0.5-3 d after unblock | owner | P0-CDF demand + matching | —: owner #2471 |
| 5.5 | Message translation | P2 | AI provider keys (owner) — honest off-state proven, the AI function itself not | 0.5-3 d after unblock | owner | P0-CDF communication | 2026-10-26: ai-off-honesty run 40191899327 10-25: A-4/A-5 original English words shown labelled 'no translation' on phone; outsiders refused… |
| 5.8 | Push | P1 | owner: VAPID keys + real delivery test | 0.5-3 d after unblock | owner | P0-CDF communication | —: #2712 merged; migration 20261023190255 applied (0 subscriptions, RLS on, no anon grant); channel OFF unless WEB_PUSH_ENABLED=true (code-v… |
| 5.16 | Owner Telegram alerts | P2 | waits for an owner step | 0.5-3 d after unblock | owner | P0-CDF communication | —: owner bot token |
| 6.21 | /business/[slug] | P2 | waits for an owner step | 0.5-3 d after unblock | owner | P0-CDF marketplace | —: RED RPC owner |
| 7.6 | Billing recovery cron | P2 | owner VPS step | 0.5-3 d after unblock | owner | P0-E billing (owner-gated) | —: #2696 removed the GH cadence that hit nginx-404; recovery still needs the VPS cron line + BILLING_RECOVERY_ENABLED |
| 7.7 | Manual pilot grant (admin) | P2 | waits for an owner step | 0.5-3 d after unblock | owner | P0-E billing (owner-gated) | —: no admin session |
| 7.8 | LMC credit ledger | P2 | waits for an owner step | 0.5-3 d after unblock | owner | P0-E billing (owner-gated) | —: owner design |
| 7.12 | AI cost metering | P2 | waits for an owner step | 0.5-3 d after unblock | owner | P0-E billing (owner-gated) | —: AI runtime off (10.6) |
| 7.14 | Vacancy translation entitlement | P2 | AI provider keys (owner) — honest off-state proven, the AI function itself not | 0.5-3 d after unblock | owner | P0-E billing (owner-gated) | 2026-10-26: ai-off-honesty run 40191899327 10-25: C-2 failed on a spec locator (two main elements); translation entitlement needs AI; re-pro… |
| 7.15 | EUR 99 subscription checkout | P1 | owner: approve #2685 and decide when to show EUR 99 | 0.5-3 d after unblock | owner | P0-E billing (owner-gated) | —: EUR 99 order hidden by design while the pilot pass is on; VAT path = RED #2685 (Stripe Tax) awaiting owner approval |
| 7.19 | Refunds and disputes | P2 | owner refund policy + TEST walk | 0.5-3 d after unblock | owner | P0-E billing (owner-gated) | —: refund/dispute recorded only; 0 events in prod |
| 8.3 | Machine translation | P2 | AI provider keys (owner) — honest off-state proven, the AI function itself not | 0.5-3 d after unblock | owner | Mobile + i18n | 2026-10-26: ai-off-honesty run 40191899327 10-25: A-4 no machine translation, original kept and labelled; re-proven 2026-10-26 prod walk ai-… |
| 8.5 | Nine priority launch markets | P2 | Activating the 5 markets needs ~9400 missing keys per locale plus the [EN] placeholders translated and reviewed (owner: translation source/budget decision; zero paid AI p… | 0.5-3 d after unblock | owner | Mobile + i18n | 2026-10-28: 2026-10-28 catalog audit: active locales lt/en/ru/nl/de/pl complete (15191 strings, 0 '[EN]' placeholders); inactive da/et/lv/no… |
| 8.9 | Public org profile | P2 | owner: allow a synthetic public profile for the walk, or wait for a real organization to opt in | 0.5-3 d after unblock | owner | Mobile + i18n | 2026-10-26: public-org-locales run 40205429467 10-25: S-10 skipped honestly - no organization has a published public profile (production cou… |
| 8.13 | Native app | P1 | waits for an owner step | 0.5-3 d after unblock | owner | Mobile + i18n | 2026-10-30: shared native client proven per platform in 8.17 (Android) and 8.18 (iOS) on production build 84cc2f85; earlier: ARCH-6 + store … |
| 8.14 | App links | P1 | waits for an owner step | 0.5-3 d after unblock | owner | Mobile + i18n | —: store accounts |
| 8.15 | Mobile store release | P1 | owner store accounts (Google Play, Apple, EAS) + ARCH-6 | 0.5-3 d after unblock | owner | Mobile + i18n | 2026-10-30: apps run against production (8.17 Android, 8.18 iOS); no store listing; earlier: no Play/App Store listing exists |
| 9.16 | External referral API | P2 | waits for an owner step | 0.5-3 d after unblock | owner | P0-E admin + privacy + security | —: partner tokens; anon 401 PASS |
| 9.19 | Admin import sandbox | P2 | owner: enable flag if wanted | 0.5-3 d after unblock | owner | P0-E admin + privacy + security | 2026-10-25: owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): renders 'disabled — set INTELLIGENCE_SANDBOX_ENA… |
| 9.20 | Admin intelligence inspector | P2 | owner: enable flag if wanted | 0.5-3 d after unblock | owner | P0-E admin + privacy + security | 2026-10-25: owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): renders 'disabled — set INTELLIGENCE_INSPECTOR_E… |
| 10.5 | ChatGPT/Claude listings | P2 | waits for an owner step | 0.5-3 d after unblock | owner | MCP / AI | —: owner portals |
| 10.6 | AI runtime | P2 | AI provider keys (owner) — honest off-state proven, the AI function itself not | 0.5-3 d after unblock | owner | MCP / AI | 2026-10-26: ai-off-honesty run 40191899327 10-25: B-4 provider state shown as off; re-proven 2026-10-26 prod walk ai-off-honesty run 4030160… |
| 10.7 | Conversation intent LLM | P2 | waits for an owner step | 0.5-3 d after unblock | owner | MCP / AI | —: 10.6 |
| 10.8 | CV AI structuring | P2 | waits for an owner step | 0.5-3 d after unblock | owner | MCP / AI | —: 10.6 |
| 10.9 | Journal AI suggestions | P2 | waits for an owner step | 0.5-3 d after unblock | owner | MCP / AI | —: 10.6 |
| 10.10 | Explanation AI | P2 | waits for an owner step | 0.5-3 d after unblock | owner | MCP / AI | —: 10.6 |
| 10.21 | Eurostat import | P2 | owner: allow scheduled import | 0.5-3 d after unblock | owner | MCP / AI | —: gates on but no scheduler calls runEurostatImport; data from 07-15 |
| 10.22 | the partner organization integration | P2 | waits for an owner step | 0.5-3 d after unblock | owner | MCP / AI | —: owner |
| 10.24 | Self-hosted STT/translate | P2 | waits for an owner step | 0.5-3 d after unblock | owner | MCP / AI | —: owner deploy |
| 10.25 | Cloudflare AI adapter | P2 | waits for an owner step | 0.5-3 d after unblock | owner | MCP / AI | —: owner key |
| 10.26 | OpenAI apps challenge | P2 | waits for an owner step | 0.5-3 d after unblock | owner | MCP / AI | —: owner token |
| 11.9 | Human-in-loop learning review | P2 | waits for an owner step | 0.5-3 d after unblock | owner | Education | —: owner parked nav door |
| 13.5 | Database backup | P1 | open security/permission item - details in the private record | 0.5-3 d after unblock | owner | Infra (coordinator) | 2026-11-01: 2026-11-01: the repository backup pipeline with its restore proof (#2906) has never completed (owner secret missing); the hostin… |
| 13.9 | Supabase GitHub integration | P2 | waits for an owner step | 0.5-3 d after unblock | owner | Infra (coordinator) | —: owner |

## PARTIAL (31)

| ID | Function | Priority | Remaining work | Effort | Dependency | Lane | Evidence (register) |
|---|---|---|---|---|---|---|---|
| 2.17 | ESCO taxonomy | P1 | production proof missing | 0.5-2 d | - | P0-A/B journal + Living CV | —: quota / RED #2463 |
| 2.36 | Profession-specific journal templates | P1 | no production walk | 0.5-2 d | - | P0-A/B journal + Living CV | 2026-11-01: templates + migration exist (decision 0006; lib/journal/journal-templates.ts); no production proof yet |
| 3.8 | Team->project assignment | P1 | production proof missing | 2-5 d | - | P0-D projects + HR | 2026-11-01: 2026-11-01 reconciled with product-truth: product-truth: brigade matched as a unit — the journey link is broken (DEM-6/WRK-6); t… |
| 3.34 | Project forecast engine + recompute modes | P1 | wire to the project course + register in capability-register | 2-5 d | - | P0-D projects + HR | 2026-11-01: built (#2733, lib/forecast: engine, facts, history, scheduler, modes) but not wired to any screen; owner order 2026-10-24 |
| 3.35 | Commitment overlap -> warning -> alternatives -> override -> audit | P1 | flow + production walk | 2-5 d | - | P0-D projects + HR | 2026-11-01: architecture §5 J-TIME-FREEDOM; MCP calendar_conflicts_get exists; UI flow and override audit unproven |
| 3.36 | Company Living CV | P1 | owner to confirm the product shape | 0.5-2 d | owner step | P0-D projects + HR | 2026-11-01: owner order 2026-10-24; nearest: company history 3.27 |
| 4.6 | Team matching + team offer | P1 | pricing note fixed #2687 | 2-5 d | - | P0-CDF demand + matching | 2026-11-01: 2026-11-01 reconciled with product-truth: product-truth: brigade matched as a unit — the journey link is broken (DEM-6/WRK-6); t… |
| 4.8 | Anonymous public need intake | P1 | not walked in production | 0.5-2 d | - | P0-CDF demand + matching | 2026-10-30: isolated public-need walk (signup-isolated 40833394554, #2883): anonymous intake stores one row; earlier: form renders |
| 4.9 | Saved searches + alerts | P1 | not walked in production | 0.5-2 d | - | P0-CDF demand + matching | 2026-10-30: isolated saved-search walk (40833394554, #2883): search stored, match notification + alert mail delivered; earlier: worker-recor… |
| 4.30 | Candidate pipeline -> hire decision -> close need (+ agency commissions, agency-… | P1 | build decision/history UI; agency parts | 2-5 d | - | P0-CDF demand + matching | 2026-11-01: vision §6; lib/pipeline/candidate-pipeline-facts.ts exists; decision + history UI and agency parts missing |
| 5.7 | E-mail notifications | P1 | not walked in production | 0.5-2 d | - | P0-CDF communication | 2026-10-30: isolated notification walk (40833394554, #2883): per-kind e-mail consent stored, invitation_accepted mail delivered; earlier: SM… |
| 5.9 | Weekly digest | P1 | by design a worker who visited that week gets the digest in-app only | 0.5-2 d | - | P0-CDF communication | 2026-10-30: isolated digest walk (40833394554, #2883): one digest per week, mail delivered; earlier: search-support-privacy run 40215640433 … |
| 5.15 | Voice as equal door | P1 | no prod voice walk | 0.5-2 d | - | P0-CDF communication | —: COM-8 corrected to PARTIAL/CODE_PROVEN (#2714): voice capture panel + turn policy exist |
| 6.18 | Waitlist | P2 | production proof missing | 0.5-2 d | - | P0-CDF marketplace | —: modal + validation live; no real submit |
| 7.2 | Free organization limit 1 open need | P2 | production proof missing | 0.5-2 d | - | P0-E billing (owner-gated) | 2026-10-23: brigade walk 10-12; pilot lifted limit 10-23 |
| 7.5 | Live charging | P2 | production proof missing | 0.5-2 d | owner step | P0-E billing (owner-gated) | 2026-11-01: 2026-11-01 reconciled with product-truth: one EUR 1 pilot payment only; self-serve paid plan is not live (owner decision MKT-7);… |
| 7.13 | Plan-gated booking_requests | P2 | needs an org at its booking limit (synthetic Gama is on the pilot) | 0.5-2 d | - | P0-E billing (owner-gated) | 2026-10-25: public-org-locales run 40205429467 10-25: S-6 PASS - bookings surface renders with no plan gate at rest; the gate at the plan li… |
| 7.18 | Payment changes rights | P2 | missing evidence: payment failure or expiry -> rights withdrawn (TEST-mode failed payment scenario, or the pilot's own expiry 2026-11-22) | 0.5-2 d | - | P0-E billing (owner-gated) | 2026-10-23: paid -> rights PASS (pilot 10-23) |
| 7.21 | Billing portal for every billing manager | P2 | missing evidence: a second billing manager of the same org opens the portal | 0.5-2 d | - | P0-E billing (owner-gated) | 2026-10-23: payer opened the Stripe portal (10-23) |
| 7.22 | Paid-feature rights and limits | P2 | missing evidence: the other paid-feature limits (profile views #2474, VIP) are not built/applied | 0.5-2 d | - | P0-E billing (owner-gated) | —: plan limits enforced for needs + bookings (pilot lifted the open-need limit live) |
| 7.25 | LMC balance and history | P2 | open security/permission item - details in the private record | 0.5-2 d | - | P0-E billing (owner-gated) | 2026-10-25: lmc-csrf run 40210854856 10-25: chat 'Kiek turiu LMC?' door opens the balance section (LT/EN, 390 px), signed-out refused; both … |
| 7.29 | VAT Stripe Tax | P2 | production proof missing | 0.5-2 d | - | P0-E billing (owner-gated) | —: RED draft #2685; sandbox scenarios PASS Stripe-side |
| 9.9 | Audit trail | P2 | open security/permission item - details in the private record | 0.5-2 d | - | P0-E admin + privacy + security | 2026-10-30: isolated walk 40833394554 (#2883) |
| 9.17 | Internal supply feed | P2 | readback 1x/24 h vs 4/day intended | 0.5-2 d | - | P0-E admin + privacy + security | 2026-10-23: 401 anon; edge logs show authorized Agentai pulls 10-23 (readback 05:50, supply feed 06:02/08:32/11:01) |
| 9.18 | Public JSON APIs | P2 | production proof missing | 0.5-2 d | - | P0-E admin + privacy + security | —: /api/health public 200 ok; others authenticated by design |
| 10.3 | OAuth 2.1 for MCP clients | P2 | merge or dispatch #2454 | 0.5-2 d | - | MCP / AI | —: discovery live (401 challenge, PRM, DCR, S256); walk #2454 runs without owner creds |
| 11.2 | Programmes / cohorts | P2 | production proof missing | 0.5-2 d | - | Education | 2026-11-01: 2026-11-01 reconciled with product-truth: product-truth: learners cannot join a cohort themselves (EDU-2, owner decision ARCH-3)… |
| 11.7 | Practice->competency recognition | P2 | production proof missing | 2-5 d | - | Education | 2026-11-01: 2026-11-01 reconciled with product-truth: product-truth: demonstrated capability is not recognised against a formal requirement … |
| 13.4 | Supabase capacity | P2 | production proof missing | 0.5-2 d | - | Infra (coordinator) | 2026-10-25: Supabase org plan=pro (get_organization 2026-10-25) |
| 13.13 | Feature-availability catalogue | P2 | production proof missing | 0.5-2 d | - | Infra (coordinator) | —: catalog guards green; effect only in signed-in dashboards, no prod walk |
| 13.16 | Browser crash reports | P2 | production proof missing | 0.5-2 d | - | Infra (coordinator) | —: only a registry citation; no primary evidence recoverable |

## NOT IMPLEMENTED (22)

| ID | Function | Priority | Remaining work | Effort | Dependency | Lane | Evidence (register) |
|---|---|---|---|---|---|---|---|
| 2.37 | Subject refuses an imported record | P2 | owner decision ARCH-5, then build | 3-8 d | owner decision / design | P0-A/B journal + Living CV | 2026-11-01: architecture §1.6/§10 (ARCH-5); appears only as the blocker of 2.27 |
| 4.22 | 3 free profile views + VIP | P2 | owner approval + figures | 3-8 d | owner decision / design | P0-CDF demand + matching | —: built only in RED draft #2474, not merged/applied |
| 5.20 | User-defined automations | P2 | build | 10-20 d | owner decision / design | P0-CDF communication | 2026-11-01: vision §12, §19 item 7 |
| 5.21 | SMS / WhatsApp channels | P2 | owner: paid channel provider (separate approval) | 3-8 d | owner decision / design | P0-CDF communication | 2026-11-01: vision §11 (marked later) |
| 6.12 | Cross-border deals | P2 | owner: decide whether 6.6 contracts + 6.11 cross-border readiness suffice | 10-20 d | owner decision / design | P0-CDF marketplace | —: registry NOT_BUILT: cross-border deals module |
| 6.13 | Orders goods purchase | P2 | depends on payments for goods (only org plans are armed); owner design | 10-20 d | owner decision / design | P0-CDF marketplace | —: registry NOT_BUILT: goods purchase order lifecycle |
| 6.14 | Logistics | P2 | depends on 6.13 | 10-20 d | owner decision / design | P0-CDF marketplace | —: registry NOT_BUILT: logistics/shipment/freight |
| 6.22 | Housing / accommodation | P2 | owner scope, then build | 10-20 d | owner decision / design | P0-CDF marketplace | 2026-11-01: vision §8, §19 item 4 |
| 6.23 | Service order rating, cancellation and dispute | P2 | owner policy, then build | 3-8 d | owner decision / design | P0-CDF marketplace | 2026-11-01: vision §7 |
| 6.24 | Swipe-style B2C discovery feed | P2 | owner to confirm | 3-8 d | owner decision / design | P0-CDF marketplace | 2026-11-01: decision 0013 pattern 3 (lower confidence) |
| 7.9 | LMC top-ups, VIP, ai_plus, tiers | P2 | owner prices; LMC owner-locked | 3-8 d | owner decision / design | P0-E billing (owner-gated) | —: registry NOT_BUILT: LMC top-ups, VIP media EUR 24.99, ai_plus, agency tiers, referral rates |
| 7.11 | Deferred plans | P2 | owner prices | 3-8 d | owner decision / design | P0-E billing (owner-gated) | —: registry NOT_BUILT: worker_plus, agency_pilot plans |
| 7.20 | Invoices inside LM | P2 | build Stripe invoice read for the org | 3-8 d | owner decision / design | P0-E billing (owner-gated) | —: in-app invoices/payment history not built (Stripe portal invoice exists; RED draft #2682 adds plan name+amount only) |
| 7.23 | LMC top-up | P2 | owner: packages, VAT, refund; LMC owner-locked | 3-8 d | owner decision / design | P0-E billing (owner-gated) | —: registry NOT_BUILT: LMC one-time top-up (1 LMC = [amount withheld]) |
| 7.24 | LMC granted once per payment | P2 | depends on 7.23 | 3-8 d | owner decision / design | P0-E billing (owner-gated) | —: registry NOT_BUILT: LMC grant tied to one confirmed payment |
| 7.26 | LMC spend + reversal | P2 | depends on 7.23 | 3-8 d | owner decision / design | P0-E billing (owner-gated) | —: registry NOT_BUILT: LMC spend + refund reversal (functions exist, no caller) |
| 7.30 | Invoices + work-acceptance acts from the Work Journal | P2 | owner: invoicing rules per country, then build | 10-20 d | owner decision / design | P0-E billing (owner-gated) | 2026-11-01: vision §10, §19 item 5 (invoice, advance, credit note, acceptance act, accountant export) |
| 7.31 | Free + two paid tiers for workers AND for companies | P2 | owner: final tiers, limits and prices (separate approval); no pricing change before that | 3-8 d | owner decision / design | P0-E billing (owner-gated) | 2026-11-01: owner product goal (2026-11-01); documented today: worker free only (+1 deferred), company free + EUR 99 |
| 10.4 | MCP scopes | P2 | auth path = RED; buildable as draft | 3-8 d | owner decision / design | MCP / AI | —: registry NOT_BUILT: MCP OAuth scope enforcement (bearer has full user scope) |
| 10.15 | Agents OS runtime | P2 | owner AGENT-1..4 decisions; ARCHITECTURE_ONLY | 10-20 d | owner decision / design | MCP / AI | —: registry NOT_BUILT: autonomous internal agents runtime |
| 10.16 | AI agents as participants | P2 | owner AGENT-1..4 decisions | 10-20 d | owner decision / design | MCP / AI | —: registry NOT_BUILT: AI agents as market participants (AI-4) |
| 11.10 | RPL equivalence structure | P2 | owner, RED schema | 10-20 d | owner decision / design | Education | —: registry NOT_BUILT: RPL equivalence structure (ARCH-2) |

## OPTIONAL (1)

| ID | Function | Priority | Remaining work | Effort | Dependency | Lane | Evidence (register) |
|---|---|---|---|---|---|---|---|
| 7.4 | Stripe TEST checkout/portal/webhook | - | extra TEST scenario; does not block launch and is not a payment defect | - | - | P0-E billing (owner-gated) | 2026-10-28: billing-test-mode never executed: the pilot organization is not armed in Stripe TEST; production stays LIVE (owner 10-28) |

## VERIFIED (185)

| ID | Function | Priority | Remaining work | Effort | Dependency | Lane | Evidence (register) |
|---|---|---|---|---|---|---|---|
| 1.1 | E-mail+password sign-up / sign-in | - | - | - | - | P0-A identity | 2026-10-28: isolated CI walk signup-isolated (#2861/#2864/#2865, local Supabase, Chromium) 9/9 2026-10-28: S-1..S-3 form sign-up worker/comp… |
| 1.2 | Google OAuth | - | - | - | - | P0-A identity | 2026-10-18: owner Google sign-in 10-18/19; buttons x6 live |
| 1.3 | Password reset | - | - | - | - | P0-A identity | 2026-11-01: production use 2026-11-01: a real (non-synthetic) account requested a reset, opened the mailed link and updated the account with… |
| 1.4 | Onboarding + setup hub | - | - | - | - | P0-A identity | 2026-11-01: prod walk fresh-activation 41279196446 2026-11-01 on 38bfb9d93: fresh worker + fresh company onboarding (owner-created accounts)… |
| 1.5 | Multi-role identity | - | - | - | - | P0-A identity | 2026-11-01: prod walk role-routes 41280157502 2026-11-01 on 38bfb9d93 (5/5 roles); earlier: role-routes run 39783147517 (green) 10-22; 5 rol… |
| 1.6 | Organization creation + identity | - | - | - | - | P0-A identity | 2026-10-25: public-org-locales run 40205429467 10-25 (19 green, 2 skipped): S-[volume withheld] identity page shows Alfa's own record |
| 1.7 | Organization verification | - | - | - | - | P0-A identity | 2026-10-25: public-org-locales run 40205429467 10-25 (19 green, 2 skipped): S-2 verification status shown, honest |
| 1.9 | Memberships, invitations, roles | - | - | - | - | P0-A identity | 2026-10-28: isolated CI walk signup-isolated (#2861/#2864/#2865, local Supabase, Chromium) 9/9 2026-10-28: S-9 invitation link → sign-up thr… |
| 1.10 | Workspace context + switching | - | - | - | - | P0-A identity | 2026-11-01: prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-7: another organization sees none of the roster, anonymous refu… |
| 1.11 | Cross-org isolation | - | - | - | - | P0-A identity | 2026-11-01: prod walk worker-identity-split 41318189146 2026-11-01 on 681e6678f (5/5): owner, manager and agency get only workers they have … |
| 1.12 | Invitation / referral network | - | - | - | - | P0-A identity | 2026-10-28: #2855 (ledger 20261028081810) + #2858 (20261028091725) applied, verified, deployed a4cbc9b9; send ledger shows no duplicate reci… |
| 1.13 | Transactional e-mail | - | - | - | - | P0-A identity | 2026-10-28: partner invitation mails delivered via the ledgered provider path (10-27/28); earlier: 2026-10-27 production: owner configured S… |
| 1.14 | Staff review notice | - | - | - | - | P0-A identity | 2026-10-21: staff-review-notice 39604913210 10-21 |
| 1.15 | Org history before claim + claim | - | - | - | - | P0-A identity | 2026-11-01: prod walk company-talent-history 41279265278 2026-11-01 on 38bfb9d93 (17/17) H-1..H-6; earlier: company-talent-history run 40217… |
| 2.1 | Professional profile + narrative | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-3; earlier: profile-cv-history run 40182648408 10-25 … |
| 2.2 | Work card availability/pay/locations | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-4; earlier: profile-cv-history run 40182648408 10-25 … |
| 2.3 | CV import confirm each fact | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-6; earlier: ai-off-honesty run 40191899327 10-25 (12/… |
| 2.4 | Living CV / player card / EU export | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk fresh-activation 41279196446 2026-11-01 on 38bfb9d93: first journal entry reaches the Living CV; prod walk living-cv-g… |
| 2.5 | Employment history | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-7; earlier: profile-cv-history run 40182648408 10-25 … |
| 2.6 | Practice / volunteering | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-8; earlier: profile-cv-history run 40182648408 10-25 … |
| 2.7 | Education records | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-9; earlier: profile-cv-history run 40182648408 10-25 … |
| 2.8 | Achievements / declared certificates | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-10; earlier: profile-cv-history run 40182648408 10-25… |
| 2.9 | Languages | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-5; earlier: profile-cv-history run 40182648408 10-25 … |
| 2.11 | Requirement ledger | - | - | - | - | P0-A/B journal + Living CV | 2026-10-25: requirements-countries run 40209522348 10-25 (9/9): R-1/R-2 DE+NL ledger reads have/missing (LT, EN, 390 px), no gate wording; R… |
| 2.12 | Skill catalogue + professions | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-11; earlier: profile-cv-history run 40182648408 10-25… |
| 2.13 | Deterministic recognition journal->skill | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk living-cv-growth 41281984217 2026-11-01 on 38bfb9d93 (3/3, lt/en/ru); #2894 skill involvement time (CI); earlier: #288… |
| 2.14 | Evidence tier ladder | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-12; earlier: profile-cv-history run 40182648408 10-25… |
| 2.15 | Free-label skill claims | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-13; earlier: profile-cv-history run 40182648408 10-25… |
| 2.16 | Transversal capabilities | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-14; earlier: profile-cv-history run 40182648408 10-25… |
| 2.18 | Documents / credential validity | - | - | - | - | P0-A/B journal + Living CV | 2026-10-25: documents-approvals 40152566232 10-25 (walk passed) |
| 2.19 | Work Journal | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk fresh-activation 41279196446 2026-11-01 on 38bfb9d93: a fresh worker's first journal entry is saved and reaches the Li… |
| 2.21 | Work verification 8 states | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk work-verification 41280396705 2026-11-01 on 38bfb9d93 (6/6); #2895 correction door over MCP: prod walk mcp-agents 4130… |
| 2.22 | Photos / task evidence | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk worker-records-exports 41312948857 2026-11-01 on 7f8bfaa2a (8/8) P-1; earlier: worker-records-exports run 40186822215 … |
| 2.23 | Hours metrics/allocations/timesheets | - | - | - | - | P0-A/B journal + Living CV | 2026-10-23: project-execution E-11 run 39968362991 10-23 |
| 2.25 | Work in numbers | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-17; earlier: profile-cv-history run 40182648408 10-25… |
| 2.26 | One continuous professional history | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-18; #2894 duration-pending records shown without hour… |
| 2.29 | Living CV potential capabilities | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk living-cv-growth 41281984217 2026-11-01 on 38bfb9d93 (3/3, lt/en/ru); earlier: living-cv-growth run 39791708600 (green… |
| 2.31 | Journal hash chain | - | - | - | - | P0-A/B journal + Living CV | 2026-10-24: journal-confirm run 40083466362 10-24 (3/3): worker records entry, employer approves, worker sees it confirmed on Living CV and … |
| 2.32 | Counterparty review | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-16; earlier: profile-cv-history run 40182648408 10-25… |
| 2.33 | Gallery | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk worker-records-exports 41312948857 2026-11-01 on 7f8bfaa2a (8/8) G-1/G-2 on the phone; earlier: worker-records-exports… |
| 2.34 | Journal + hours export | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk worker-records-exports 41312948857 2026-11-01 on 7f8bfaa2a (8/8) E-1/E-2; earlier: worker-records-exports run 40186822… |
| 2.35 | Discoverability consent | - | - | - | - | P0-A/B journal + Living CV | 2026-11-01: prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) P-8; earlier: search-support-pr… |
| 3.1 | Company home | - | - | - | - | P0-D projects + HR | 2026-10-23: owner session 10-23 the partner organization 1.6 s; role-routes 39783147517 |
| 3.2 | Projects | - | - | - | - | P0-D projects + HR | 2026-11-01: prod walk project-execution 41283540387 2026-11-01 on 38bfb9d93 E-1 PASS; earlier: project-execution E-1 39798187544 10-22 |
| 3.3 | Objects / sites | - | - | - | - | P0-D projects + HR | 2026-10-23: project-execution E-11 run 39968362991 10-23 |
| 3.4 | Stages | - | - | - | - | P0-D projects + HR | 2026-11-01: prod walk project-execution 41283540387 2026-11-01 on 38bfb9d93 E-3 PASS; earlier: project-execution run 40085615921 (green) 10-… |
| 3.5 | Tasks | - | - | - | - | P0-D projects + HR | 2026-11-01: prod walk project-execution 41283540387 2026-11-01 on 38bfb9d93 E-4 PASS; earlier: project-execution run 40081437313 10-24: E-4 … |
| 3.6 | Worker->project assignment | - | - | - | - | P0-D projects + HR | 2026-11-01: prod walk project-execution 41295981934 2026-11-01 on 3b7eafbe4 green end to end (after #2897: the walk now waits for the assign… |
| 3.7 | Brigades | - | - | - | - | P0-D projects + HR | 2026-10-22: brigade-formation 39795574869 10-22 |
| 3.9 | Readiness | - | - | - | - | P0-D projects + HR | 2026-10-23: project-execution E-7 run 39968362991 10-23 |
| 3.10 | Defects / corrections | - | - | - | - | P0-D projects + HR | 2026-10-23: project-execution E-8 run 39968362991 10-23 |
| 3.11 | Handover passport | - | - | - | - | P0-D projects + HR | 2026-10-23: project-execution E-9 run 39968362991 10-23 |
| 3.12 | Project economics | - | - | - | - | P0-D projects + HR | 2026-10-23: project-execution E-10 run 39968362991 10-23 |
| 3.13 | Operations board + export | - | - | - | - | P0-D projects + HR | 2026-11-01: prod walk project-execution 41283540387 2026-11-01 on 38bfb9d93 E-2 PASS (dates); earlier: project-execution E-2 run 39968362991… |
| 3.14 | Employer planning / calendar | - | - | - | - | P0-D projects + HR | 2026-10-21: calendar-planning 39571666417 10-21 |
| 3.15 | Absences / leave | - | - | - | - | P0-D projects + HR | 2026-10-23: calendar-planning run 40007491242 (green) 10-23 |
| 3.16 | Capacity / gap timeline | - | - | - | - | P0-D projects + HR | 2026-10-23: owner session 10-23: workforce planning shows active team 2, capacity [volume withheld]-days, honest partial count |
| 3.17 | Capacity reservation | - | - | - | - | P0-D projects + HR | 2026-10-23: project-execution E-6 run 39968362991 10-23 |
| 3.18 | Utilisation | - | - | - | - | P0-D projects + HR | 2026-10-26: prod walk utilisation-planned-actual run 40295307338 (2026-10-26): U-0..U-3 8/8 — owner commits worker to dated project, committ… |
| 3.19 | Planned vs actual | - | - | - | - | P0-D projects + HR | 2026-10-26: prod walk run 40295307338 (2026-10-26): P-1..P-4 — three stages planned 5 days, started+finished; fresh load shows planned vs ac… |
| 3.20 | Shifts / rotas | - | - | - | - | P0-D projects + HR | 2026-10-28: rota-repeat 40659497014; earlier: prod-qa-walk rota-repeat 40018016745 10-23 (5/5): weekly Mon/Wed/Fri + 2-on/1-off saved via Re… |
| 3.21 | Roster | - | - | - | - | P0-D projects + HR | 2026-11-01: prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-1; earlier: org-roster R-1 39800182427 10-22 |
| 3.22 | People import | - | - | - | - | P0-D projects + HR | 2026-11-01: prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-2; earlier: org-roster run 40052543761 (green) 10-24 |
| 3.23 | On/offboarding runs | - | - | - | - | P0-D projects + HR | 2026-11-01: prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-3; earlier: org-roster R-3 run 39969976834 10-23 |
| 3.24 | Approvals / workflows | - | - | - | - | P0-D projects + HR | 2026-10-28: documents-approvals 40663181329; earlier: documents-approvals 40152566232 10-25 (walk passed) |
| 3.25 | Management decisions + reviews | - | - | - | - | P0-D projects + HR | 2026-10-28: company-governance 40687308231 (2026-10-28) D-1..D-5 green; prod walk company-governance run 40296167812 (2026-10-26): D-1..D-5 … |
| 3.26 | Instructions | - | - | - | - | P0-D projects + HR | 2026-11-01: prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-5; earlier: org-roster run 40052543761 (green) 10-24 |
| 3.27 | Company history + data quality | - | - | - | - | P0-D projects + HR | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-20; #2894 company period split (CI); earlier: profile… |
| 3.28 | Manager chat answers | - | - | - | - | P0-D projects + HR | 2026-10-24: manager-chat run 40054481359 10-24 (5/5) |
| 3.29 | Organization documents register | - | - | - | - | P0-D projects + HR | 2026-10-25: documents-approvals 40152566232 10-25 (walk passed) |
| 3.30 | Company settings + help request | - | - | - | - | P0-D projects + HR | 2026-11-01: prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-4; earlier: org-roster R-4 run 40052543761 10-24 (7/7): setting… |
| 3.31 | Reporting / export | - | - | - | - | P0-D projects + HR | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-21; earlier: profile-cv-history run 40182648408 10-25… |
| 3.32 | Assets / tools | - | - | - | - | P0-D projects + HR | 2026-11-01: prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-6; earlier: org-roster R-6 assets issue/return run 39969976834 … |
| 3.33 | Hours page | - | - | - | - | P0-D projects + HR | 2026-11-01: prod walk company-chain 41283188592 2026-11-01 on 38bfb9d93 (13/13) H-1/H-2 company + agency; earlier: company-chain 39569833029… |
| 4.1 | Canonical demand intake | - | - | - | - | P0-CDF demand + matching | 2026-11-01: prod walk fresh-activation 41279196446 2026-11-01 on 38bfb9d93: fresh company describes a need, visible where it lands; prod wal… |
| 4.2 | Demand != supply direction | - | - | - | - | P0-CDF demand + matching | 2026-10-25: public-market-direction run 40186517027 (green) 10-25: demand vs supply direction on public market, LT/EN/RU at 390+1280 px; ano… |
| 4.3 | Worker opportunity board + interest | - | - | - | - | P0-CDF demand + matching | 2026-11-01: prod walk company-chain 41283188592 2026-11-01 on 38bfb9d93 (13/13) C-1; earlier: company-chain C-1 run 40315387466 (success; re… |
| 4.4 | Public /jobs board | - | - | - | - | P0-CDF demand + matching | 2026-10-28: jobs-search 40645813917 J-1..J-6 6/6 (board, filter, page bounds, job page, signed-in save → saved view → remove); earlier: publ… |
| 4.5 | Matching engine both directions | - | - | - | - | P0-CDF demand + matching | 2026-11-01: prod walk company-talent-history 41279265278 2026-11-01 on 38bfb9d93 (17/17) K-2: real fit band + skill basis on the board (#288… |
| 4.7 | B2B negotiation | - | - | - | - | P0-CDF demand + matching | 2026-10-22: brigade-formation run 39795574869 (green) 10-22 |
| 4.10 | Organizational supply discovery | - | - | - | - | P0-CDF demand + matching | 2026-11-01: prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) M-2; earlier: search-support-pr… |
| 4.11 | Candidates / scouting | - | - | - | - | P0-CDF demand + matching | 2026-11-01: prod walk company-chain 41283188592 2026-11-01 on 38bfb9d93 (13/13) C-2; earlier: fresh-activation run 40546035425 2026-10-27: s… |
| 4.12 | Shortlist + notes | - | - | - | - | P0-CDF demand + matching | 2026-11-01: prod walk company-talent-history 41279265278 2026-11-01 on 38bfb9d93 (17/17) K-1..K-5; earlier: company-talent-history run 40187… |
| 4.13 | Auto-match + receipt | - | - | - | - | P0-CDF demand + matching | 2026-11-01: prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) M-3; earlier: search-support-pr… |
| 4.14 | Candidate drafts | - | - | - | - | P0-CDF demand + matching | 2026-11-01: prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) M-5; earlier: search-support-pr… |
| 4.15 | Agency-client bridge | - | - | - | - | P0-CDF demand + matching | 2026-10-26: agency-chain run 40357361254 2026-10-26: 8/8 incl. A-1b (saved offer on the agency home, list one click away) + cleanup: this ru… |
| 4.16 | Interested-worker contact | - | - | - | - | P0-CDF demand + matching | 2026-11-01: prod walk company-chain 41283188592 2026-11-01 on 38bfb9d93 (13/13) C-3/C-4; earlier: company-chain C-3/C-4 run 40315387466 (suc… |
| 4.19 | Contact disclosure requests | - | - | - | - | P0-CDF demand + matching | 2026-11-01: prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) M-4; earlier: search-support-pr… |
| 4.20 | Discovery identity protection | - | - | - | - | P0-CDF demand + matching | 2026-10-24: worker-identity-split run 40046311013 (green) 10-24 |
| 4.21 | Person page name gating | - | - | - | - | P0-CDF demand + matching | 2026-11-01: prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) P-5; earlier: search-support-pr… |
| 4.25 | Admin matching workbench | - | - | - | - | P0-CDF demand + matching | 2026-10-25: owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/matching workbench renders open needs bes… |
| 4.26 | /match-preview public fit | - | - | - | - | P0-CDF demand + matching | 2026-10-25: ai-off-honesty run 40191899327 10-25 (12/13 green): C-1 signed out: match preview computes the fit, says AI explanation not gene… |
| 4.28 | First-party supply declaration | - | - | - | - | P0-CDF demand + matching | 2026-11-01: prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) P-6; earlier: search-support-pr… |
| 4.29 | Interest->vacancy hand-off | - | - | - | - | P0-CDF demand + matching | 2026-10-23: prod DB 10-23: 3/3 consented hand-offs delivered ~2 s (partner 201/200); 10 non-consented withheld by design; cron 06:00 call 20… |
| 5.1 | Chat-first home | - | - | - | - | P0-CDF communication | 2026-10-25: ai-off-honesty run 40191899327 10-25 (12/13 green): B-3 chat opens the door for a known sentence, says 'not understood' for an u… |
| 5.2 | Transcript persistence | - | - | - | - | P0-CDF communication | 2026-11-01: prod walk chat-continuity 41322286924 2026-11-01 on 4a5b45828: a question survives a brand-new session; a thread never shows in … |
| 5.3 | Single-use confirmations | - | - | - | - | P0-CDF communication | 2026-10-21: chat-confirm-once 39604342494 10-21 |
| 5.4 | Conversations / threads | - | - | - | - | P0-CDF communication | 2026-10-21: agency-chain 39601269995 10-21 |
| 5.6 | In-app notifications | - | - | - | - | P0-CDF communication | 2026-10-25: notifications-inapp runs 40012716741 (10-23) + 40204616787 (10-25), 8/8 green both |
| 5.10 | Attention / activity centre | - | - | - | - | P0-CDF communication | 2026-11-01: prod walk notifications-inapp 41312513056 2026-11-01 on 7f8bfaa2a (8/8), incl. N-6 mark-all-read on the phone; earlier: notifica… |
| 5.11 | Worker calendar | - | - | - | - | P0-CDF communication | 2026-10-23: calendar-planning run 40007491242 (green) 10-23 |
| 5.12 | Availability | - | - | - | - | P0-CDF communication | —: owner session write+revert |
| 5.13 | Booking request->accept->engagement | - | - | - | - | P0-CDF communication | 2026-11-01: prod walk orders-bookings 41321294873 2026-11-01 on 4a5b45828 (16/17; B-1 skipped: no synthetic customer identity, 6.4 has its o… |
| 5.14 | Command finder + voice | - | - | - | - | P0-CDF communication | —: owner #2673/#2679 (finder only) |
| 5.17 | Support conversations | - | - | - | - | P0-CDF communication | 2026-11-01: prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) S-1; earlier: search-support-pr… |
| 5.18 | Global dashboard search | - | - | - | - | P0-CDF communication | 2026-11-01: prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) S-2; earlier: search-support-pr… |
| 5.19 | Inbox report view | - | - | - | - | P0-CDF communication | 2026-11-01: prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) S-5; earlier: search-support-pr… |
| 6.1 | Service offerings + request loop | - | - | - | - | P0-CDF marketplace | 2026-11-01: prod walk marketplace 41284728549 2026-11-01 on 38bfb9d93 (6/6) M-2, M-5, M-6; earlier: marketplace-goods-services run 401643108… |
| 6.2 | Listings goods/rental/wanted | - | - | - | - | P0-CDF marketplace | 2026-11-01: prod walk marketplace 41284728549 2026-11-01 on 38bfb9d93 (6/6) M-1, M-3, M-4; earlier: marketplace-goods-services run 401643108… |
| 6.3 | One discovery index | - | - | - | - | P0-CDF marketplace | 2026-11-01: prod walk marketplace 41284728549 2026-11-01 on 38bfb9d93 (6/6) M-3/M-5; earlier: marketplace-goods-services run 40164310896 10-… |
| 6.4 | Buyer workspace | - | - | - | - | P0-CDF marketplace | 2026-10-26: buyer-workspace run 40377604733 2026-10-26 (owner-created synthetic buyer): B-0 onboarding via shipped wizard, B-[volume withhel… |
| 6.6 | Proposals/contracts | - | - | - | - | P0-CDF marketplace | 2026-10-25: documents-approvals 40152566232 10-25 (walk passed) |
| 6.7 | Procurement | - | - | - | - | P0-CDF marketplace | 2026-11-01: prod walk orders-bookings 41321294873 2026-11-01 on 4a5b45828 P-1; earlier: orders-bookings run 40361384432 2026-10-26 PASS (re-… |
| 6.8 | Business trips | - | - | - | - | P0-CDF marketplace | 2026-11-01: prod walk orders-bookings 41321294873 2026-11-01 on 4a5b45828 T-1; earlier: orders-bookings run 40361384432 2026-10-26 PASS (re-… |
| 6.9 | Finance records | - | - | - | - | P0-CDF marketplace | 2026-11-01: prod walk orders-bookings 41321294873 2026-11-01 on 4a5b45828 F-1..F-4 (another organization export never carries the record); e… |
| 6.10 | Project-cost calculator | - | - | - | - | P0-CDF marketplace | 2026-10-25: public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-7 project-cost calculator computes a result |
| 6.11 | Cross-border readiness | - | - | - | - | P0-CDF marketplace | 2026-10-23: live 10-23 public part |
| 6.16 | Commercial handoff to the partner organization | - | - | - | - | P0-CDF marketplace | 2026-10-24: prod DB: commercial_handoffs 7 delivered, last 2026-10-24 08:58 UTC |
| 6.17 | CRM pipeline | - | - | - | - | P0-CDF marketplace | 2026-10-25: owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/pipeline renders all demand sources by st… |
| 6.19 | Team enquiries | - | - | - | - | P0-CDF marketplace | 2026-11-01: prod walk company-talent-history 41279265278 2026-11-01 on 38bfb9d93 (17/17) T-1..T-5; earlier: public-org-locales run 402054294… |
| 6.20 | Value channels | - | - | - | - | P0-CDF marketplace | 2026-10-26: public-org-locales run 40371836163 2026-10-26: S-9 chat names the value channel for an offer (#2831 fixed the walk's page-offset… |
| 7.1 | Plan catalogue + /pricing | - | - | - | - | P0-E billing (owner-gated) | 2026-10-25: public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-2 /pricing plan cards honest for the billing state |
| 7.3 | Entitlement resolver | - | - | - | - | P0-E billing (owner-gated) | 2026-10-23: pilot payment changed effective entitlements live 10-23 |
| 7.16 | Webhook signature verification | - | - | - | - | P0-E billing (owner-gated) | 2026-10-23: 3 LIVE events verified 10-23 |
| 7.17 | No double charge / processing | - | - | - | - | P0-E billing (owner-gated) | —: 3 live events, 0 dup event ids, UNIQUE(provider,event_id); 1 subscription row |
| 8.1 | UI localization | - | - | - | - | Mobile + i18n | 2026-10-23: live 6 locales x 25 routes 10-23 after #2686 |
| 8.2 | Multilingual work understanding | - | - | - | - | Mobile + i18n | 2026-10-26: prod walk sectors-languages run 40300823818 (2026-10-26): 11/11 — 5 sectors understood, saved and listed (lt/en/ru/en/pl); #2779… |
| 8.4 | Country labour-market pages | - | - | - | - | Mobile + i18n | 2026-10-25: public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-5 country labour-market page renders |
| 8.6 | Country requirement matrix | - | - | - | - | Mobile + i18n | 2026-10-25: requirements-countries run 40209522348 10-25: C-1/C-2 DE+NL matrices from the country index (LT, EN, 390 px) with europa.eu sour… |
| 8.7 | Public answer engine + llms.txt | - | - | - | - | Mobile + i18n | 2026-10-25: public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-8 /llms.txt plain text naming the product |
| 8.8 | SEO plumbing | - | - | - | - | Mobile + i18n | 2026-10-25: public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-9 robots, sitemap, canonical + hreflang to the apex |
| 8.10 | Marketing site | - | - | - | - | Mobile + i18n | 2026-10-25: public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-1 landing + 4 marketing pages LT/EN/RU at 390 and 1280 |
| 8.11 | Mobile web | - | - | - | - | Mobile + i18n | 2026-11-01: prod walk mobile-surfaces 41311144346 2026-11-01 on 7f8bfaa2a (6/6) and 41317177981 on 681e6678f (6/6, bookings page added to th… |
| 8.12 | PWA installability | - | - | - | - | Mobile + i18n | 2026-10-25: public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-10 every locale home links the manifest; served |
| 8.16 | Language feedback | - | - | - | - | Mobile + i18n | 2026-10-26: public-org-locales run 40371836163 2026-10-26: S-12 the synthetic owner sends a language report from the account menu, sees 'Ači… |
| 8.17 | Android app (native) | - | - | - | - | Mobile + i18n | 2026-10-30: Android signed-in journey on production build 84cc2f85 (run 41014999978): sign-in, Today read, journal entry drafted + confirmed… |
| 8.18 | iOS app (native) | - | - | - | - | Mobile + i18n | 2026-10-30: iOS signed-in journey on production build 84cc2f85 (run 41015011284, passed on attempt 2 of 2): sign-in, Today read, journal dra… |
| 9.1 | Superadmin console | - | - | - | - | P0-E admin + privacy + security | 2026-10-28: admin-console 40688059945 (2026-10-28) green: non-admins refused, operator pages render; owner admin session 2026-10-25 ~13:50 L… |
| 9.2 | Admin pilots/telemetry/league | - | - | - | - | P0-E admin + privacy + security | 2026-10-25: owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/pilots, /admin/telemetry and /admin/leagu… |
| 9.3 | Admin user inspect | - | - | - | - | P0-E admin + privacy + security | 2026-10-25: owner admin session 2026-10-25, read-only: /admin/users/<synthetic QA id> renders role, state, profile text, suggested skills, d… |
| 9.4 | Privacy request intake | - | - | - | - | P0-E admin + privacy + security | 2026-10-19: prod DB: erasure request received + executed via intake 2026-10-19 (receipt requested_at) |
| 9.5 | GDPR export | - | - | - | - | P0-E admin + privacy + security | 2026-11-01: prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) P-2; earlier: search-support-pr… |
| 9.6 | GDPR erasure executor | - | - | - | - | P0-E admin + privacy + security | 2026-10-19: prod DB: privacy_erasure_receipts_v3 executed receipt 2026-10-19 15:23 UTC |
| 9.7 | Worker row access identity split | - | - | - | - | P0-E admin + privacy + security | 2026-10-21: worker-identity-split 39602569732 10-21 |
| 9.8 | RLS on every table | - | - | - | - | P0-E admin + privacy + security | 2026-10-23: prod catalog 10-23: 243/243 public tables RLS on; 15 no-policy tables sealed; anon probes 401/404 |
| 9.10 | Rate limiting | - | - | - | - | P0-E admin + privacy + security | 2026-10-23: live 10-23: 6 anon POST /api/waitlist (non-JSON) -> 5x400 then 429 retry-after 600 (5/10 min) |
| 9.11 | Same-origin checks | - | - | - | - | P0-E admin + privacy + security | —: prod build 711745d0 (waitlist 403, logout 303) + lmc-csrf run 40210854856 O-1..O-3: cross-origin transcript POST refused, same-origin val… |
| 9.12 | Legal pages | - | - | - | - | P0-E admin + privacy + security | 2026-11-01: prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) P-1; earlier: public-org-locale… |
| 9.13 | Personal location privacy | - | - | - | - | P0-E admin + privacy + security | 2026-11-01: prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) P-4; earlier: search-support-pr… |
| 9.14 | Telemetry / funnel | - | - | - | - | P0-E admin + privacy + security | 2026-10-25: owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/telemetry funnel renders real counts (90-… |
| 9.15 | Search stacks | - | - | - | - | P0-E admin + privacy + security | 2026-11-01: prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) S-3; earlier: search-support-pr… |
| 9.22 | Env schema validation | - | - | - | - | P0-E admin + privacy + security | —: zod env validation at load; deploy 39952179926 health=healthy, build 431385cf; rollback on unhealthy |
| 9.23 | Security-definer governance | - | - | - | - | P0-E admin + privacy + security | 2026-10-23: prod 10-23: anon SECURITY DEFINER set = allowlist 9/9; PUBLIC exec 0/589 |
| 9.24 | Security incident handling | - | - | - | - | P0-E admin + privacy + security | —: live headers HSTS preload, CSP report-only, XFO DENY, nosniff, Referrer/Permissions-Policy; monitor issues + health probe + onRequestErro… |
| 10.1 | MCP door 229 tools | - | - | - | - | MCP / AI | 2026-11-01: prod walk mcp-agents 41307643008 2026-11-01 on c3df7431d (10/10, A-9: entry recorded and corrected over MCP, one live version, s… |
| 10.2 | Agent scenarios over MCP | - | - | - | - | MCP / AI | 2026-10-23: mcp-agents 9/9 39885097311 10-23 |
| 10.11 | Six agents without call site | - | - | - | - | MCP / AI | —: decision implemented (#2765): country_readiness integrated, 5 duplicates retired, 0 uncalled agents; prod: anon Chromium (not_authenticat… |
| 10.13 | /dashboard/assist | - | - | - | - | MCP / AI | 2026-10-25: ai-off-honesty run 40191899327 10-25 (12/13 green): B-4 assist page states the AI provider state and that no text came from a mo… |
| 10.14 | Agents OS admin page | - | - | - | - | MCP / AI | 2026-10-25: owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/agent-os renders the agent register |
| 10.17 | External action receipts | - | - | - | - | MCP / AI | 2026-10-23: mcp-agents run 39885097311 (green) 10-23; audit_logs rows observed |
| 10.18 | Vacancy source SE | - | - | - | - | MCP / AI | 2026-10-23: cursor 06:03 10-23; 49,731 live |
| 10.19 | Vacancy source NAV | - | - | - | - | MCP / AI | 2026-10-23: cursor 07:27 10-23; 9,266 live |
| 10.23 | Agentai supply feed | - | - | - | - | MCP / AI | 2026-10-24: prod edge logs 2026-10-24/25: rpc first_party_supply_feed_v1 200 x4 (last 09:32 UTC) = authorized feed pulls served; anon 401 (e… |
| 10.27 | Maps | - | - | - | - | MCP / AI | 2026-11-01: prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) S-6; earlier: search-support-pr… |
| 11.1 | Institution + learner link | - | - | - | - | Education | 2026-10-21: learning-practice 39601905282 10-21 |
| 11.3 | Learning compass | - | - | - | - | Education | 2026-10-25: learning-practice run 40154033299 (green) 10-25 |
| 11.4 | Practice capacity | - | - | - | - | Education | 2026-10-25: learning-practice run 40154033299 (green) 10-25 |
| 11.5 | Learner outcomes | - | - | - | - | Education | 2026-10-25: learning-practice run 40154033299 (green) 10-25 |
| 11.6 | Institution reporting + export | - | - | - | - | Education | 2026-10-25: learning-practice run 40154033299 (green) 10-25 |
| 12.1 | Market map | - | - | - | - | Market intelligence | 2026-10-23: owner session 10-23: market map renders Leaflet tiles, markers, radius and location controls |
| 12.2 | Labour-market intelligence | - | - | - | - | Market intelligence | 2026-10-23: live public 10-23 |
| 12.3 | /dashboard/intelligence | - | - | - | - | Market intelligence | 2026-11-01: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-19; earlier: profile-cv-history run 40182648408 10-25… |
| 12.4 | Demand recognizer | - | - | - | - | Market intelligence | 2026-10-23: owner session 10-23 after #2690: LT need sentence recognises role, place (Vilniuje), experience, scope, start (nuo lapkričio) 5/… |
| 12.5 | Public market facts | - | - | - | - | Market intelligence | 2026-10-23: live 10-23 58,997 = DB |
| 12.6 | Admin league / market | - | - | - | - | Market intelligence | 2026-10-25: owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/league + /admin/market render real supply… |
| 13.2 | Health probe + monitor | - | - | - | - | Infra (coordinator) | —: live |
| 13.3 | Prod QA walk harness | - | - | - | - | Infra (coordinator) | 2026-10-22: role-routes run 39783147517 (green) 10-22 |
| 13.6 | VPS cron bundle | - | - | - | - | Infra (coordinator) | 2026-10-23: prod data 10-23: all 4 VPS cron entries ran (handoffs 06:00, job-alerts, weekly digest Mon, erasure every 10 min); pg_cron booki… |
| 13.7 | Migration safety + parity | - | - | - | - | Infra (coordinator) | 2026-10-23: parity tool vs prod ledger 10-23 |
| 13.8 | Migration ledger parity | - | - | - | - | Infra (coordinator) | 2026-10-23: prod ledger 10-23: 396 match; all drift documented except ESCO fn applied with file only in open #2410 |
| 13.10 | Quality gates | - | - | - | - | Infra (coordinator) | 2026-10-25: Quality Gates on main run 40175733431 success 2026-10-25 |
| 13.11 | E2E in CI | - | - | - | - | Infra (coordinator) | —: e2e-smoke 39950760373 on live build 431385cf: 32/32 |
| 13.12 | Executable product constitution | - | - | - | - | Infra (coordinator) | —: quality 39950760135 product-truth green (111 caps, 28 nodes, 6 journeys) |
| 13.14 | Owner waivers / product gate | - | - | - | - | Infra (coordinator) | —: product gate + self-test pass; waivers 35/35; live anon secdef gate PASS 589/9 |
| 13.15 | Old-browser compatibility | - | - | - | - | Infra (coordinator) | —: shim live |
