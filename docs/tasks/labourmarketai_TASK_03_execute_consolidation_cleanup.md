# TASK 03 — Make the Repo Actually One Clean Line (Execute Approved Consolidation)
**For:** Claude Code (primary executor) · **From:** Chat Claude (architect) · **Date:** 2026-05-30
**RUN ORDER:** after TASK 02 (audit, PR #155). Run **THIS** before TASK 01 (keystone). DI has approved every action below ("taip viskam").

> Direction toward a goal, not a boundary. The "likely moves" are a sketch — do whatever genuinely makes the repo one clean line. The only firm lines are the **Guardrails**: deletions only for proven-redundant work, the salvage migration is drafted not applied, and nothing bypasses the gate.

---

## THE GOAL (read fully — the real target)
The audit (TASK 02) made the repository *known*: of 69 remote branches, 62 are already-merged residue, 5 are real, and there is no parallel project — the core loop and canonical org model live in exactly one place (main). The founder finally has clarity. **This task converts that clarity into an actually-clean single line.**

The destination: a repo that reads as **one deliberate system**, not a junk-pile. The merged residue is gone, the mirror worktrees and local branches that caused the mid-slice merge races are pruned, the two genuinely-unmerged drafts are consciously resolved (retired, with anything worth keeping captured so no idea is lost), the small real integrity guards that prod actually lacks are queued as one reviewable migration, and the two governance PRs (the audit and the auto-merge envelope) are landed. After this, when DI looks at the branch list, every entry is short and meaningful — and we can build the keystone on a clean main with zero parallel residue and zero risk of a third copy.

"Truly done," broadly: the branch list no longer looks like chaos; the concurrency mechanism behind the earlier races is gone; the two drafts are closed with their useful bits salvaged or captured; prod's small journal-integrity gaps are about to be closed (via a migration queued for review, not silently applied); the audit + envelope PRs are merged; and DI knows the exact one-time GitHub toggles still needed to switch auto-merge on. The repo should feel like one project being built on purpose — which is the whole point of everything we've done this session.

## HOW THIS FITS THE PROJECT GOAL
A trust platform across nine markets must be coherent and tamper-evident. Cleaning the repo to one line, and closing the real (if small) journal-integrity gaps the right way, protects both the founder's clarity and the platform's proof spine. This is the last cleanup before the keystone that makes verified proof real.

## READING ORDER
`PLATFORM_DOCTRINE.md` → `AGENTS.md` → `CLAUDE.md` → `TASKS.md` → `docs/BRANCH_CONSOLIDATION_AUDIT.md` → this file.

---

## GUARDRAILS (firm — never cross)
- **Delete a branch only if proven redundant** (merged/folded, content already in main, PR#-backed in the audit appendix) — these are recoverable. The ONLY unmerged branches you may delete are the two DI explicitly approved (`feat/sr1-tier2-schema-draft-v1`, `feat/cc/pr10b-0014-hardening-implementation`), and only **after** capturing their worth (below). Never touch any other unmerged branch.
- **The salvage migration is COMMITTED, NOT APPLIED.** It is RED (touches constraints/RLS on the proof spine) → queue it for Chat-Claude/DI review. Apply nothing to prod. Never `supabase db push`.
- **No new parallel sources of truth.** The `original_language` CHECK must derive its allowed set from the ONE canonical supported-language source (don't invent a second hardcoded list); document where that source is.
- **Append-only triggers are OUT of scope here** — capture them as a future TASKS.md item; do not rush trigger logic that must preserve the correction/supersession/soft-delete lifecycle.
- **Windows gotcha:** de-junction `node_modules` before `git worktree remove`.
- **Never bypass or `--admin`-override branch protection.** For PR #154, after merge, surface the one-time GitHub toggles DI must do to *activate* auto-merge — you cannot do those yourself.

## DIRECTION (a sketch — floor, not ceiling)
You'll likely: retire the 62 proven-redundant remote branches (one batch, each PR#-backed); prune the 22 worktrees + 137 local branches (de-junction first); retire `feat/sr1-tier2-schema-draft-v1` after writing a short "org tier-2 (org levels/plans) — deferred idea" note into TASKS.md; retire `feat/cc/pr10b-0014-hardening-implementation` after capturing in TASKS.md the append-only-trigger idea and the unshipped scaffolds (feature_flags, proof_of_work) it held; draft one fresh `YYYYMMDDHHMMSS_journal_integrity_guards.sql` containing exactly the two real additive guards prod lacks — the `original_language` CHECK (allowed set from the canonical language source) and the closed-only insert narrowing (§4 default-closed) — committed, not applied, queued for review; then mark PR #155 (audit) ready, let CI pass, merge; then PR #154 (auto-merge envelope) the same way; and report. If anything else is needed to leave the repo genuinely one clean line, do it.

## DEFINITION OF DONE (outcome, not steps)
- The remote branch list is short and every remaining entry is meaningful; merged residue is gone; worktrees/local mirrors pruned (merge-race mechanism removed).
- Both approved drafts are retired, with their worthwhile bits captured in TASKS.md (nothing lost).
- One `journal_integrity_guards` migration is drafted (2 guards, language-set from the canonical source), committed and queued for review — not applied.
- PR #155 and PR #154 are merged.
- A clear report lists what was retired/pruned, the queued migration for review, and the **exact one-time GitHub toggles DI must perform to activate auto-merge** (Allow auto-merge; require quality + migration-safety; approvals=0 or bot bypass).
- Explicit confirmation that main is now a clean single line, ready for the keystone (TASK 01).

Deliver the report; keep the salvage migration and any uncertain deletion behind the gate.
