# Journal Evidence Auto-Recompute v1 — evidence loop

> Closes the evidence loop so the player card + matching v1 use a worker's REAL
> evidence tier (`worker_skills.source`), not just self-declaration. No fake
> verification, no hardcoded score, no demo data.

## The honest evidence ladder

| Tier (`worker_skills.source`) | Promoted by | Who can write it | Status |
|---|---|---|---|
| `self_declared` | floor — declared only | worker (owns_worker) | live |
| `work_journal` | a real Work Journal entry linked to the skill (`journal_entry_skills`) | **worker** (owns_worker) | **Slice A — DONE, GREEN (PR #330)** |
| `manager_confirmed` | explicit manager/client confirmation of specific declared skills | **manager** via SECURITY DEFINER RPC (RLS `worker_skills_write` = `owns_worker OR is_admin`, NOT employer) | **ALREADY LIVE on prod** (RPC applied; UI wired) |

> **Loop status: closed.** Both halves are built. The manager half was already
> shipped in a prior sprint and is producing real data on prod (verified
> 2026-06-12: `confirm_entry_and_verify_skills` + `review_journal_entry` RPCs
> exist; **2 real `manager_confirmed` skill rows**, `verified = 2`). The worker
> half (work_journal) is PR #330, awaiting merge — once merged it runs under the
> worker's own `owns_worker` RLS with **no schema/prod change**.

## Slice A — work_journal promotion (GREEN, in this PR, no schema, no prod apply)

When the worker links/unlinks skills to a journal entry (`setJournalEntrySkillLinks`, the worker's own session), `worker_skills.source` is reconciled deterministically:

- a non-verified skill with ≥1 `journal_entry_skills` support row → `work_journal`;
- a non-verified skill with no support → back to `self_declared` (honest demotion when the last link is removed);
- **verified (`manager_confirmed`) rows are never touched** — the worker cannot create or revoke a confirmation.

Pure decision in `lib/journal/skill-source.ts` (`computeSkillSource`, `reconcileWorkerSkillSources`), applied through the **worker's own session** (`owns_worker` RLS) — **no SECURITY DEFINER, no RLS/grant/policy change, no migration**. Best-effort: a reconcile failure never fails the link write.

**Integration (automatic, no extra UI):**
- **Player card** — `journalSupportedSkills` (already counts `source='work_journal'`) now reflects real journal-supported skills; the cyan "journal-supported" tier lights up.
- **Matching v1** — `match-subject` maps `source → evidence tier`, so journal-supported skills already rank above self-declared (proven in `match-v1.test.ts`).
- **Scouting** — the evidence-tier counts + reasons surface journal-supported skills.

## Manager_confirmed promotion — ALREADY BUILT, WIRED, AND LIVE

A manager confirming another worker's skill cannot write `worker_skills` under existing RLS (`worker_skills_write = owns_worker OR is_admin`), so this goes through a **SECURITY DEFINER** RPC. That RPC was shipped and applied in a prior sprint — **this is not a gap, it is already live**:

- **RPC (applied to prod):** `public.confirm_entry_and_verify_skills(p_entry_id uuid, p_skill_ids uuid[], p_note text)` (SECURITY DEFINER, migration `20260530140000_membership_engagement_reroute.sql`). It re-validates manager/admin scope + `journal_review_enabled`, then for the explicitly-confirmed skills only:

  ```sql
  update public.worker_skills
     set verified = true, verified_by = uid, verified_at = now(),
         source = 'manager_confirmed', confidence_bin = 'green', updated_at = now()
   where worker_id = v_worker and skill_id = any(p_skill_ids)
     and (verified is distinct from true);
  ```

- **UI (live):** the manager inbox (`components/app/journal-inbox-entry.tsx`) mounts the `journal-confirm-skills` button → skill checkboxes (`confirm-skill-*`) → `journal-confirm-submit` → server action `confirmEntrySkills` (`lib/journal/review-actions.ts`) → `confirmEntryAndVerifySkills` (`lib/operations/org-membership.ts`) → the RPC. The manager picks **which declared skills** the entry proves; nothing is auto-confirmed.

- **Proof on prod (2026-06-12):** both `confirm_entry_and_verify_skills` and `review_journal_entry` RPCs exist; `worker_skills` has **2 `manager_confirmed` rows** with `verified = 2` — real manager-confirmed evidence, no fabrication.

This is the canonical promoter — we did **not** author a parallel RPC (doctrine §2). The earlier draft of this doc wrongly described it as "unapplied / a follow-up slice"; that was corrected against verified prod state.

**Open refinement (not a blocker, owner-gated if pursued):** the RPC hardcodes `confidence_bin='green'`. A future slice could route it through the existing deterministic `computeConfidence`. That would touch the SECURITY DEFINER function, so it stays an owner-gated migration — not done here.

## Loop closure

| Half | Mechanism | State |
|---|---|---|
| Worker → `work_journal` | `setJournalEntrySkillLinks` → `applyWorkerSkillSourceReconcile` (owns_worker RLS) | PR #330, GREEN, no schema — runs on merge |
| Manager → `manager_confirmed` | `confirmEntrySkills` → SECURITY DEFINER RPC | **live on prod** (2 real rows) |

Both tiers feed the same surfaces: player card (`verifiedSkills` = manager-confirmed, `journalSupportedSkills` = work_journal) and matching v1 (`sourceToEvidence`). Merging PR #330 makes the worker half active in production with **no DB change**, fully closing the loop.

## What is NOT in scope (per the goal)
No Phase C/D/E, no broader talent-pool scouting, no billing, no external AI, no fake verified/manager confirmation, no fake worker data, no large redesign, no background CRON/recompute job.
