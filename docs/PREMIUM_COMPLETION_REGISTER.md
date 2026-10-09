# Premium completion — canonical execution register

Owner directive 2026-10-09 (P0). One register, one coordinator. This file is the
single place for status; do not start a parallel register. Authority for what the
product IS: `docs/OWNER_TARGET_ARCHITECTURE_V1.md`. Run
`node .github/scripts/product-truth.mjs` before architectural changes.

Evidence rule: no gate is passed without evidence. Audit rows below are
**code-read evidence only** (imports, register) until a rendered pass at 375 and
1280 px confirms them.

## Gates

| Gate | State | Evidence needed |
|---|---|---|
| 1 Functional completeness | OPEN | each in-scope workflow technically verified or recorded as deferred |
| 2 Internal premium quality | OPEN | all core routes on the premium grammar, 375 + 1280 screenshots |
| 3 Public landing | NOT STARTED (waits on 2) | 3-second test, registration path, LCP budget |
| 4 Human-like QA | NOT STARTED (waits on 2+3) | browser journeys, synthetic identities, read-back |
| 5 Production proof | NOT STARTED | green checks, deploy verified |

## Design base (decided by owner 2026-10-09)

Build on `main`. Base grammar = `components/app/premium/grammar.tsx` (Stamp,
Eyebrow, Accented, RegionHead, LevelMark, EvidenceBar), proven on `/cv` and the
"Your opportunities" block. Port only needed pieces of PR #2110 / #2125, route by
route. Do not merge either stack wholesale (landing guards conflict with #2205).

## Lane B — internal premium (code-read audit)

| Route | Class | Next |
|---|---|---|
| `/cv` | PREMIUM | keep |
| opportunities | PARTIAL | re-skin lower bands (premium block sits above ~2,200 legacy lines) |
| home | PARTIAL | RegionHead/Eyebrow rhythm; link to Living CV |
| journal, planning | PARTIAL | unify evidence vocabulary (EvidenceState vs LevelMark) |
| talent | PARTIAL | PersonIdentityCard |
| profile | LEGACY | slice 1 |
| hours | LEGACY | slice 3 |
| projects, projects/[id], operations | LEGACY | raw status/attention badges |
| company/*, candidates | LEGACY | |
| communication, inbox | LEGACY | |
| listings, services, buyer, network | LEGACY | |

Raw enum leak confirmed: `components/app/agency-workers-section.tsx:374`
(`{inv.status}`). Add a guard against raw enum rendering.

## Lane A — functional (register-derived; no row is BROKEN)

Capability register: 34 usable, 69 partial, 16 human-UI-proven. Candidate
actions, to be verified before work (some register notes pre-date merged work):

1. DEM-4 ingestion — OWNER POLICY 2026-10-09 (#2241): daily completeness is sufficient. NAV 4 scheduled runs/day + bounded self-rearming catch-up (>=600 s spacing, stops at feed head); Sweden 3 stream runs/day (+ transient invalid_json retry, #2239); ingestion-freshness.yml checks each source every 6 h, stale after 26 h, one incident per source, bounded recovery. OPEN: NAV is NOT yet proven caught up (2026-10-09 16:05Z: caughtUp=false, cursor still advancing; opaque token, no backlog estimate). Track separately: last session / last verified head catch-up / backlog / new+updated / withdrawn / failures. Verify withdrawal handling against the source rules. #2227 watchdog stays unapplied (needs a new owner decision).
2. MKT-2 universal marketplace — APPLIED in production 2026-10-07 (ledger 20261007155109/155211/155215/160116). No approval needed; remaining work is UI + walk evidence.
3. CAL-6 / COM-2 expiry — NOT scheduled. Both RPCs refuse a service-role caller. Package: new migration adding two service_role-only wrapper RPCs (sweep_expire_stale_booking_requests_v1, sweep_expire_contact_disclosure_requests_v1) + /api/cron/expiry-sweeps + daily workflow. RED (SECURITY DEFINER + GRANT). Pre-apply checks: booking_request_events.actor_id nullable; contact_disclosure_log_change accepts null actor. Owner approval required before apply.
4. DEM-6 team offers — APPLIED in production 2026-10-08 (ledger 20261008050149), 0 rows; remaining work is UI + walk evidence.
5. PER-2/PER-3 profile headline/bio editor mounted on the profile page?
6. COM-3 notifications: prove all types end to end.
7. PER-12 GDPR export completeness.
8. WRK-8 / EVID-6 corrections + right of reply: human-UI proof (0 prod rows).
9. CAL-8 shifts/rotas MISSING; ten dated stores not on the calendar.
10. COM-1 team threads participant model.

i18n: 13 locale folders; add a register row for locale parity.

## Lane C — public landing (prep only; builds after Gate 2)

Gaps: abstract headline fails 3-second test; no real product views; no Living CV /
Journal sections; competing doors (signup / Jobs / free-text "Understand");
mobile CTA position unmeasured; thin projects/services; ~20 webp stages per
persona with no LCP budget; JSON-LD only Organization + WebSite; SEO title
framing differs from h1.

## Lane D — feeds/search/scheduling
See Lane A item 1. `vercel.json` has two crons only.

## Lane E — human-like QA
Inactive until Gates 2 and 3 pass.

## Owner decisions open (agents may not resolve)
ORG-2, EVID-2, MKT-7, COM-6, COM-8, GOV-1. RED drafts awaiting gate: #2227,
#2209, #2203, #2165, #2150, #1816, #1813.

## Slice log
| Slice | PR | State |
|---|---|---|
| register | #2229 | merged |
| register reconcile 2026-10-09 | this PR | open |
| #2242 lane B pass | #2242 | merged 2026-10-09 |
| #2240 PGRST303 bounded retry | #2240 | merged 2026-10-09 (owner-authorized); prod verification pending |
| #2235 expiry RED | #2235 | UNAPPLIED. Pre-apply (read-only prod, 2026-10-09): sweeps would expire 0 booking + 0 disclosure rows today; actor user/profile absent (wrappers refuse, change nothing); provisioning script already neutralises triggers handle_new_user (role only from metadata) and ensure_worker_profile (deletes workers row). Still unproven until provisioned: banned user cannot log in, no privileges, audit attribution. Needs owner final approval |
| React hydration #418 | - | OPEN, unresolved; needs cold prod-build repeat + profile route scan |
