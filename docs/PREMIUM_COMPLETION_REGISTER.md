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

1. DEM-4 ingestion scheduling — register note says "no scheduler"; #2215/#2216/#2226
   made the NAV cadence self-rearming. **Verify current state before building.**
2. MKT-2 universal marketplace — migration `20261003150300` is RED/unapplied:
   owner gate.
3. CAL-6 / COM-2 expiry RPCs have no machine caller (RED).
4. DEM-6 team offers: migration `20261007150000` built, unapplied.
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
| register | this PR | open |
