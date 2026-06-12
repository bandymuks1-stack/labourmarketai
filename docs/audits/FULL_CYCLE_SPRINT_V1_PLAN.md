# Full Cycle Sprint v1 — gap map + slice plan (Step 0)

> **Goal:** connect the first real cycle — worker player card → company need →
> matching v1 → scouting/shortlist → Work Journal skill evidence influencing
> the card and the match result. No demo, no fake data (§7/§18).
> **This PR (Slice 1):** the deterministic, evidence-weighted **matching v1
> engine** + unit tests + this plan. No schema, no prod apply, GREEN.

## What already exists (the cycle is ~70% built, but disconnected)

| Cycle stage | Already in repo | State |
|---|---|---|
| Worker player card | `components/app/worker-player-card.tsx` + `lib/player-card/player-card.ts` (`getWorkerPlayerCard`), page `/dashboard/player-card` | **Real, honest, live.** Shows declared/candidate/evidence counts, verified (manager-confirmed) skills, work-card confirmation, availability. |
| Skill evidence tiers | `worker_skills.source` ∈ `self_declared` / `work_journal` / `manager_confirmed`; `journal_entry_skills` link table; `journal_entry_confirmations` | Columns exist; the **`work_journal` tier is not surfaced on the card** and the recompute from confirmed entries is not wired. |
| Company need | `customer_requests` (§17 canonical) + `save_demand_draft` / `submit_demand_request` RPCs + `DemandDraftForm` on `/dashboard/company`; admin can structure into ESCO via `payload.structured_need` | **Real intake works.** `job_demands` exists but is dormant (not the intake path). |
| Matching | `lib/market/fit.ts` `computeContextFit` (deterministic ESCO-overlap, §19) + `lib/admin/match-suggestions.ts` (rule reasons); admin workbench `/dashboard/admin/matching` | **Fit engine exists but is admin-only** and treats skills as held/verified binary; no evidence-tier weighting; not company-facing. |
| Scouting / shortlist | `candidate_drafts` (owner-scoped pre-registration notes); `match_actions` (match-row-scoped view/like/skip…); S5 agency demand visibility | **No company-shortlists-matched-workers model.** `match_actions` is not org-scoped shortlist; `candidate_drafts` is manual notes. |

## The seam (where the cycle does not close)

1. **Matching is admin-only and evidence-blind.** `computeContextFit` answers
   skill coverage, but the sprint requires evidence strength
   (manager_confirmed > work_journal > self_declared) to influence the result,
   plus compatibility (location/availability/language/pay/accommodation) and
   "why"/missing-data reasons. → **Slice 1 (this PR).**
2. **No company-facing match view + shortlist.** A company cannot pick its
   demand, see ranked candidates with "why", and shortlist them. → Slice 3 (UI)
   + Slice 4 (a small additive shortlist table — the only schema change).
3. **The card hides the `work_journal` tier.** The journal-supported evidence
   signal isn't shown on the player card and isn't fed to matching. → Slice 2.

## Slice plan (each = one narrow GREEN PR; only Slice 4 touches schema)

- **Slice 1 — matching v1 engine (THIS PR).** `lib/market/match-v1.ts`
  `matchWorkerToNeed(need, subject)`: composes `computeContextFit` + evidence
  tiers + discrete compatibility checks → `status` (strong/possible/weak/
  insufficient_data) + `reasons` + `gaps` + `missingData`, all need-context,
  §19-compliant (no global score), pure/deterministic, no schema. + the
  mandatory unit tests. **Done in this PR.**
- **Slice 2 — evidence read layer + player card tier.** A read helper that
  assembles a `MatchSubject` from real rows (`worker_skills.source` → evidence
  tier, ESCO uris), and surfaces the `work_journal_supported` tier on the
  player card (no schema; reads existing columns; i18n in all 11 locales).
- **Slice 3 — company match view (read-only).** A company-facing page: pick a
  structured demand → run `matchWorkerToNeed` over the consented worker supply
  → show match list + open player card + "why" reasons. No new table (reads
  existing). Honest empty state when no structured need / no supply.
- **Slice 4 — shortlist model (RED-adjacent / owner-gated schema).** An
  additive `demand_shortlist` table (org+demand-scoped status: saved /
  interested / not_fit / reviewed) with owner-scoped RLS. **If any RLS choice
  is non-trivial, STOP and present it for the owner gate** (no autonomous RLS).
- **Slice 5 — journal → source recompute (optional).** Wire confirmed journal
  entries to bump `worker_skills.source`/confidence (the designed-but-unwired
  recompute), so manager confirmation actually promotes the evidence tier.

## Doctrine guardrails honored

- §19 (Fit, ne reitingas): no global person/company score; every number is
  need-context with basis; confirmed-vs-declared separated (here refined to 3
  tiers); nothing persisted. Verified against `lib/guards/fit-not-rating.test.ts`.
- §7/§7.1: pure deterministic engine — no external AI, no random, no fabricated
  matches/scores/verified.
- §2/§10: reason codes are slug-like; the UI renders localized sentences from
  JSON (no hardcoded copy in the engine).
- §4 default-closed: the future shortlist (Slice 4) is org-scoped; the match
  view (Slice 3) only reads consented supply.

## Not done in this PR (honest)

Slices 2–5 (UI surfaces, the player-card tier, the shortlist table, the journal
recompute). Slice 1 is the connective brain everything else composes around; it
is fully tested and safe to land without touching production data.
