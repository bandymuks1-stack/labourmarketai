# Journal Evidence Auto-Recompute v1 — evidence loop

> Closes the evidence loop so the player card + matching v1 use a worker's REAL
> evidence tier (`worker_skills.source`), not just self-declaration. No fake
> verification, no hardcoded score, no demo data.

## The honest evidence ladder

| Tier (`worker_skills.source`) | Promoted by | Who can write it | This sprint |
|---|---|---|---|
| `self_declared` | floor — declared only | worker (owns_worker) | — |
| `work_journal` | a real Work Journal entry linked to the skill (`journal_entry_skills`) | **worker** (owns_worker) | **Slice A — DONE, GREEN** |
| `manager_confirmed` | explicit manager/client confirmation of the skill | **manager** → needs SECURITY DEFINER (RLS `worker_skills_write` = `owns_worker OR is_admin`, NOT employer) | **Slice B — owner-gated RED** |

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

## Slice B — manager_confirmed promotion (OWNER-GATED RED, NOT applied)

A manager confirming another worker's skill cannot write `worker_skills` under existing RLS (`worker_skills_write = owns_worker OR is_admin`), so this requires a **SECURITY DEFINER** RPC — owner-gated.

**The canonical promoter already exists in the repo, unapplied:**
`supabase/migrations/20260530140000_membership_engagement_reroute.sql` →
`public.confirm_entry_and_verify_skills(p_entry_id uuid, p_skill_ids uuid[], p_note text)` (SECURITY DEFINER), which already does exactly:

```sql
update public.worker_skills
   set verified = true, verified_by = uid, verified_at = now(),
       source = 'manager_confirmed', confidence_bin = 'green', updated_at = now()
 where worker_id = v_worker and skill_id = any(p_skill_ids)
   and (verified is distinct from true);
```

We deliberately did **not** author a parallel RPC (doctrine §2 — no parallel structures). To enable manager_confirmed promotion, the owner-gated path is:

1. **Owner review + apply** migration `20260530140000` (or just this RPC) via Supabase MCP `apply_migration` — **never `db push`, never auto** (it is SECURITY DEFINER + sets `verified`).
2. **Wire** the manager confirm UI to call `confirm_entry_and_verify_skills(entryId, confirmedSkillIds)` with the explicitly-confirmed skill ids (the `confirmation_scope.skills_confirmed` set) — a small follow-up slice.
3. Note: the RPC hardcodes `confidence_bin='green'`; a follow-up can route it through the existing deterministic `computeConfidence` instead.

**No production apply and no new SECURITY DEFINER migration was made in this PR.** This doc is the owner gate for Slice B.

## What is NOT in scope (per the goal)
No Phase C/D/E, no broader talent-pool scouting, no billing, no external AI, no fake verified/manager confirmation, no fake worker data, no large redesign, no background CRON/recompute job.
