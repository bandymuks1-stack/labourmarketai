# Journal → skills → profile/card → outputs — loop audit v1

Status: audited (quality-train PR H, 2026-07-06). Verdict: **the canonical
loop is connected and honest end-to-end — no repairs required.** This map
is the deliverable; the goal's stop condition (irreconcilable
completeness engines) does NOT apply.

## Canonical principle (verified in code)

`work journal entry → skill recognition/evidence → profile/player card →
opportunities/CV/report outputs`

## Loop map

| Stage | Surface / module | Data | Status |
|---|---|---|---|
| Entry creation | `/dashboard/journal`, `createJournalEntry` | `journal_entries` (hash-chained) | connected |
| Auto skill-linking on save | `lib/journal/journal-entry-skills-actions.ts` | links ONLY skills the worker already declared → `journal_entry_skills` | connected; evidence-support, never verification |
| Recognition | `lib/structuring/recognition-tiers.ts` | deterministic text rules; tiers auto_signal / candidate / manual — candidates are offered, never auto-linked | connected; no AI, no auto-verify |
| Skill evidence | `lib/profile/skill-evidence.ts` | `worker_skills.source` ∈ self_declared / work_journal / manager_confirmed + `verified` flag + entry links | connected |
| Profile hub | `/dashboard/profile`, `profile-hub-overview.tsx` | 4 real pillars (CV text, skills count, journal count, availability) + explicit "not yet verified by a human or document" disclaimer | connected |
| Player/work card | `worker-player-card.tsx`, `work-card.tsx` | `buildPlayerCardMinimum` missing-fields list; readiness ring = real met/total signals; gold ONLY on real confirmation | connected |
| CV export | `lib/cv-export/verified-cv.ts` | tiers: manager-confirmed (verified=true) / journal-supported / self-declared; proofs only from real `journal_entry_confirmations` | connected |
| Opportunities match | `lib/market/match-v1.ts` | evidence-tier-weighted (manager_confirmed 1.0 > work_journal > self_declared); statuses strong/possible/weak/insufficient_data — never "verified" | connected |

The ONLY path to `verified=true` is the manager confirmation RPC
(`confirm_entry_and_verify_skills`) — a human action.

## Completeness engines — no contradiction

The legacy `workers.profile_completeness` column is guard-banned from
every authenticated surface (product-readiness / worker-work-card /
my-space guards). What exists instead are three deliberate, non-percentage
answers to three different questions:

1. **Player-card minimum** (`lib/identity/player-card-minimum.ts`) —
   which of the 6 identity essentials are missing (concrete list, no %).
2. **Profile hub pillars** — is each of CV text / skills / journal /
   availability present (yes/no/count).
3. **Skill-evidence status** (`skillEvidenceStatus`) — none/some/all of
   the declared skills are supported by entries.

Different fields, different surfaces, all real data — they cannot
disagree because they never answer the same question twice.

## Fake-verification audit — zero findings

- Journal copy: "atpažinta / detected", never "verified"; guard
  `journal-evidence-clarity.test.ts` bans auto-verified/AI-verified copy.
- Verified badges light only on `verified === true`
  (`verified-cv-honesty.test.ts`).
- Similar-skills candidates carry the owner-approved "Pasirinkite, jei
  tinka" framing and route through the self-declared path only.
- Match output never labels anything verified; tiers only weight.
- Profile hub renders the explicit not-verified disclaimer
  (`profile-cv-evidence-hub.test.ts`).

## Guards already pinning the loop

`journal-evidence-clarity`, `evidence-status-honesty`,
`profile-cv-evidence-hub`, `verified-cv-honesty`, `player-card-profile`,
`journal-entry-skill-links`, `product-readiness` (completeness-% ban).

## Deferred candidates (small polish, owner-optional)

- Readiness-ring label could name which signals count (copy only).
- Auto-link failures after entry save are silent best-effort; surfacing a
  count is possible but touches the composer result plumbing.
- CV self-declared tier could carry an extra "(not yet confirmed)"
  subtext — current labels are already honest, this would be emphasis.

None of these is broken product logic; all are optional emphasis. Per the
train's "prefer root-cause fixes over cosmetic patches", they are listed,
not shipped.
