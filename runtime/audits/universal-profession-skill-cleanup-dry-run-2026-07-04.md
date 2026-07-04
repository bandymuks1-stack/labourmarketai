# Universal profession/skill model — DATA CLEANUP DRY-RUN PLAN

**Date:** 2026-07-04 · **Branch:** `feat/cc/universal-profession-skill-model`
· **Status:** DRY-RUN PLAN ONLY. **No mutation was executed. Every step below is
owner-gated.** Companion to
`runtime/audits/universal-profession-skill-root-audit-2026-07-04.md`.

---

## 0. Owner-gated actions in recommended order

| # | Action | Class | Gate |
|---|---|---|---|
| 1 | Apply migration `20260704120000_universal_profession_skill_catalogue.sql` | additive INSERT-only (GREEN by classifier) | owner applies via Supabase MCP `apply_migration`; rollback `supabase/rollbacks/20260704120000_*.down.sql` |
| 2 | Run the read-only stale-link report (§2) | SELECT only | safe, but run after #1 so slug names resolve |
| 3 | Optional: soft-hide stale construction links flagged by the report | `UPDATE` of `journal_entry_skills` (RED) | explicit owner approval per doctrine §4; NOT bundled with this PR |

Until #1 is applied, the shipped code degrades gracefully: recognition,
labels, activity slugs and suggestions work from the locale registry; only the
DB-backed persistence of NEW slugs (auto-link → `journal_entry_skills`,
profession picker rows) silently no-ops because the slug rows don't exist yet.

## 1. Exact tables/columns affected

### 1a. `public.journal_entry_skills` (`journal_entry_id`, `worker_id`, `skill_id`)
**Why stale:** before the recognition fixes (PR #562 train and earlier), the
biased construction-only recognizer auto-linked construction skills
(`skill_id` → construction rows of `public.skills`) to entries whose text was
not construction (the audited "dog-walking with construction chips" class).
The rows persist. Display is already honest — `lib/journal/entry-skill-source.ts`
classifies them `stale_needs_review` and the journal UI moves them into a
"Reikia peržiūrėti" bucket — but the underlying links still exist and feed
`worker_skills` source reconciliation counts.

### 1b. `public.worker_skills` (`worker_id`, `skill_id`, `source`)
**Why possibly stale:** worker_skills rows created *solely* because the old
recognizer suggested a construction skill on a non-construction entry and the
worker confirmed the mislabelled suggestion. These are worker-confirmed data —
**do not bulk-delete**; they can only be reviewed by the worker (product flow),
never by a background mutation.

### 1c. NOT affected
`profile_skill_claims` (free-text, sector-neutral, honest), `professions` /
`skills` / `profession_skills` (reference data, extended additively),
`worker_professions` (worker-chosen).

## 2. Safe dry-run report (read-only)

The recognizer is TypeScript, so the check "does the current recognizer support
this link from this entry's text?" cannot run in SQL. The dry-run is a
read-only script that reuses the production logic verbatim
(`recognizeSkills` + `buildEntrySkillSources` from
`lib/journal/entry-skill-source.ts` — the same code the journal page runs).

### 2a. SQL — candidate extraction (SELECT only, service role, local run)

```sql
-- All journal entry↔skill links joined with the entry text and skill slug.
select
  jes.journal_entry_id,
  jes.worker_id,
  jes.skill_id,
  s.slug         as skill_slug,
  s.category     as skill_category,
  je.original_text,
  ws.verified    as worker_skill_verified
from public.journal_entry_skills jes
join public.skills s            on s.id = jes.skill_id
join public.journal_entries je  on je.id = jes.journal_entry_id
left join public.worker_skills ws
       on ws.worker_id = jes.worker_id and ws.skill_id = jes.skill_id
where s.category like 'construction.%'
order by jes.worker_id, jes.journal_entry_id;
```

### 2b. Script — classification (no writes)

For each row, feed `original_text` through `recognizeSkills(text, 8)` and
classify with `classifyEntrySkillSource`:

- `verified = true` → **confirmed_by_person — keep, never touch.**
- slug recognized from text by the CURRENT (universal) recognizer →
  **recognized_from_text — keep.**
- slug not recognized but in the recognizable vocabulary →
  **stale_needs_review — report row.** This is the cleanup candidate set.

Output: `runtime/audits/universal-profession-skill-cleanup-report-<date>.md`
with counts per worker + per slug and the exact `(journal_entry_id, skill_id)`
pairs. **The script performs zero writes.** (Implementation note: this is
~30 lines against the existing exports; run locally with service-role env via
`pnpm -C apps/web` tsx script — same pattern as `scripts/skills-evidence-report.ts`.)

## 3. Expected before/after effect (if the owner later approves a mutation)

- **Before:** stale construction links exist in `journal_entry_skills`; UI
  shows them under "needs review"; they inflate the construction skill counts
  in `worker_skills` reconciliation for affected workers.
- **After (proposed, owner-gated):** flagged links are NOT deleted (append-only
  doctrine §3 leans against destroying links that were once shown to users).
  Proposal: soft-disposition — either (a) leave as-is (the review bucket is the
  product surface for the worker to resolve), or (b) add a nullable
  `reviewed_disposition` column via a future additive migration so workers'
  own review decisions persist. **Recommendation: (a) — no DB mutation at all;
  the worker resolves stale links through the existing review UI.** The
  cleanup report quantifies the problem so the owner can decide if (b) is
  worth building.

## 4. Rollback plan

- Catalogue seed: `supabase/rollbacks/20260704120000_universal_profession_skill_catalogue.down.sql`
  — guarded deletes; refuses to remove any skill/profession referenced by
  `worker_skills`, `journal_entry_skills` or `worker_professions`.
- Dry-run report: read-only, nothing to roll back.
- Any future soft-hide/disposition mutation would ship as its own migration +
  paired `.down.sql` and go through the RED human gate.

## 5. Owner gate requirement

- Applying the catalogue migration to prod: **owner channel** (MCP
  `apply_migration`), per the merge-model rules — the agent did NOT apply it.
- Any UPDATE/DELETE on `journal_entry_skills` / `worker_skills`: **RED, hard
  human gate**, dry-run report first, exact SQL in the PR description.
- This PR contains **no data mutation** and touches no billing/auth/DNS/secrets.
