# LABOURMARKET-EXECUTION-ROADMAP

The prioritized plan: what to do, in which order, what blocks what, and which decisions only the owner can
make. Part of the master set: [MASTER-MAP](LABOURMARKET-MASTER-MAP.md) ·
[FUNCTIONAL-AUDIT](LABOURMARKET-FUNCTIONAL-AUDIT.md) · [IMPROVEMENT-OPPORTUNITIES](LABOURMARKET-IMPROVEMENT-OPPORTUNITIES.md).

Version 2026-10-18. **Rule: one wave at a time.** A wave starts only when the previous wave's exit
condition holds. Proposal ids (F, C, S, X, M) refer to IMPROVEMENT-OPPORTUNITIES.

## Priority classes

| Class | Meaning |
|---|---|
| P0 | Critical security, data integrity, a core function that does not work |
| P1 | Required for reliable commercial use |
| P2 | Highest-value functionality and UX improvements |
| P3 | Growth, automation, new markets |
| P4 | Long-term technology options |

---

## Wave 0 — P0 (now)

| Id | Work | Depends on | Blocks | Owner decision? | Exit condition |
|---|---|---|---|---|---|
| P0-1 | Privacy package: merge + deploy #2477, apply `20261018160000`; then #2474, apply `20261018150000` (it refuses to run first) | Owner approval of each; private migration plan | P1 paid-plan launch (C6), identity-sharing features (C3) | **Yes** (RED) | Verification harness proofs 1–7 true; walks green; regression baseline not lower |
| P0-2 | Database back under the free quota (F2) | Owner GO on #2461 purge and #2463 ESCO option | Every new data-heavy feature | **Yes** | Size < quota after VACUUM |
| P0-3 | Working off-host backup incl. auth + storage (F3) | Owner adds the backup secret | Safe execution of P0-1 / P0-2 at scale | **Yes** (secret) | One restore rehearsed |
| P0-4 | Supabase GitHub integration: production auto-deploy off (F4) | Owner (dashboard) | Any migration-ledger reconciliation | **Yes** | Setting off, recorded |
| P0-5 | GDPR erasure executor or rehearsed manual runbook (F5) | Owner approval of #2442 | Statutory deadline compliance | **Yes** (RED) | One erasure executed end to end on a synthetic account |
| P0-6 | GREEN hardening from this audit: role-routes walk fails on a 404 (#2478, merged), host address out of the workflow file (#2479, merged), trusted client address for per-IP brakes (#2480, auto-merge on green) | — | Honest walk results; abuse brakes | No | All merged + deployed |

## Wave 1 — P1 (commercial reliability)

| Id | Work | Depends on | Blocks | Owner? |
|---|---|---|---|---|
| P1-1 | EVID-2: block or label self-confirmation (F6) | — | Trust claims in sales | **Yes** |
| P1-2 | Origin restricted to Cloudflare ranges; durable rate limits for anonymous AI/intake (F7) | VPS access | Public launch traffic | **Yes** (VPS) |
| P1-3 | Transactional e-mail on a free tier (C1) | Provider + DNS | Invitation waves (P1-7), digest (P2) | **Yes** |
| P1-4 | Error tracking + uptime + log shipping on 0 € tooling (M5) | Separate free host for uptime | Confident releases | No |
| P1-5 | Payments: webhook first, test end to end, then arm per MKT-7 (C6) | P0-1, P1-4 | Revenue | **Yes** (two acts) |
| P1-6 | Report-abuse + moderation queue (M1) | — | Marketplace growth | No |
| P1-7 | Invitation wave for imported people (claim history) | P1-3 | Real adoption of history | **Yes** (send) |
| P1-8 | Truth registers corrected (F8); walks for never-walked flows (C7) | Walk budget | Honest status | No |

## Wave 2 — P2 (highest-value product work)

Voice journal on a 0 € STT host, then on the phone (C2) · external links under consent (C3) · My Space pins
(C4) · native app release (C5) · offline capture (M4) · cross-border matching + free translation (X1, X3) ·
brigade matched as a unit (X2) · one organization identity, one roster, one skill store (S1–S3) · split the
chat component (S5) · clear paid value (growth lever).
Dependencies: X1 needs X3; S1–S3 each need an owner schema gate; C5 needs owner developer accounts.

## Wave 3 — P3 (growth, automation, markets)

Dispute/mediation (M2) · orders and logistics (M3) · public org profiles + verified badge (X4) · RPL (X5) ·
retire dead code/tables/flags (S4, S7) · one attention surface (S6) · more locales (lv, et, da, no, sv) and
vacancy sources per market.

## Wave 4 — P4 (long-term)

Push notifications · PWA service worker · vector search for match explanations · AI agents as participants
(AI-4, after identity and consent are complete) · MCP OAuth scopes · shifts/rotas (CAL-8) if confirmed.

---

## Owner decisions (one list)

| # | Decision | Needed for |
|---|---|---|
| 1 | Approve #2477 apply (identity split) — then #2474 (limit, VIP, figures for paid plan and VIP scope) | P0-1 |
| 2 | GO on vacancy purge (#2461) and the ESCO storage option (#2463) | P0-2 |
| 3 | Add the backup database secret | P0-3 |
| 4 | Turn off Supabase "Deploy to production" | P0-4 |
| 5 | Approve erasure #2442 (or schedule the manual runbook) | P0-5 |
| 6 | EVID-2 self-confirmation rule | P1-1 |
| 7 | VPS: Cloudflare-only origin | P1-2 |
| 8 | E-mail provider + DNS | P1-3 |
| 9 | MKT-7 two acts to arm charging | P1-5 |
| 10 | #2471 consent v3 wording; #1475 pins; optional discoverability v3 wording (decision 0027) | P2 |
| 11 | Voice host (0 €) and phone voice decisions (#2455) | P2 |
| 12 | Store developer accounts and signing keys | P2 |
| 13 | ORG-2, ARCH-2, ARCH-5, COM-8 (open architecture decisions) | P2–P4 |
| 14 | Merges held for the owner: #2432–#2437, #2454, #2447, #2362, #2322, #2319, #2439, #2441 | per item |

## Risks to the plan

- **Walk budget** (12 production walks / 24 h) limits how fast CODE_READY becomes LIVE_PROVEN — batch walks per wave.
- **Owner-only actions** are the critical path for Wave 0 — the plan is ready to execute within an hour of each decision.
- **Guard counts** (migration count pins) make parallel RED PRs conflict — merge in the stated order and rebase once per merge.
- **No staging** — every apply is on production; the rehearsal on a local PostgreSQL cluster and the verification harness are the substitute.

## How this roadmap stays current

Each merged item moves to "done" with its PR; each owner decision is recorded under `docs/DECISIONS/` and
removed from the list above; the MASTER-MAP register snapshot is guarded in CI.
