# TASK 02 — One Working Project, Not a Junk-Pile (Branch & Parallel-Work Audit)
**For:** Claude Code (primary executor) · **From:** Chat Claude (architect) · **Date:** 2026-05-30
**RUN ORDER:** after TASK 00 (auto-merge envelope) lands, run **THIS** — and do it **before** TASK 01 (the keystone), because the keystone may already be half-built on another branch.

> This file is a **direction toward a goal, not a boundary of the work.** The "likely moves" are a sketch — go wherever the truth leads. The only firm lines are the **Guardrails** (mapping is free; destroying or merging work is gated). Otherwise use judgment, go broad, and don't stop at a minimal list.

---

## THE GOAL (read this fully — this is the real target)
labourmarket.ai is supposed to be **one** deliberately-built, coherent system. Right now it isn't clearly that. The CI run on the auto-merge PR surfaced several other active branches nobody accounted for — `feat/cc/adaptive-human-centered-os-v1`, `registered-user-core-loop-v1`, and likely more. The founder (DI) does not know what they are or how many exist. That uncertainty is the actual problem: when you can't see the whole picture, you build the same thing twice. We just spent this whole effort killing exactly that kind of duplication inside the database (two org models, two messaging systems, three demand flows). The danger now is the same disease one level up — parallel branches each quietly re-implementing the user loop, the auth, the org model, or the schema, none of them merging, all of them drifting.

**The goal of this task is to make the entire repository fully known and then genuinely one project.** First: produce a complete, honest, plain-language map of *every* branch and every scattered parallel effort — what each one is, whether it's alive or dead, whether it sits on the canonical line or has drifted into its own divergent world. Second: turn that map into convergence — fold each branch into the one canonical project, or consciously retire it, so that nothing unknown is left floating and there is exactly **one** implementation of each thing.

The single most important question this audit must answer, with evidence: **is the core user loop (signup → onboarding → profile → work journal → manager review → verified proof) or the canonical org model being built in more than one place?** If `registered-user-core-loop-v1` (or any branch) already implements part of the keystone, we must fold/rebase that work — not rebuild it on `feat/cc/membership-engagement-reroute` and create a third copy.

"Truly done," broadly, means: DI can look at the branch list and understand *every single one* in plain words — what it is, whether it's needed, and what's happening to it. Every branch is either merged into the one canonical line, queued to be folded, or retired with confirmation it held no unique value. There are no mystery branches, no two-of-a-kind implementations, and a clear, evidenced go/no-go for the keystone. The repo should feel like one system being built on purpose — not a pile of half-starts.

## HOW THIS FITS THE PROJECT GOAL
A universal labour-market OS — a trust platform across nine markets — cannot run on a junk-pile of divergent branches. Coherence *is* the product foundation: one schema, one auth, one loop, one source of truth. This audit is what turns scattered motion into a single, trustworthy system, and it protects the founder from the recurring "two parallel projects" anxiety for good.

## READING ORDER
`PROJECT_VISION.md` → `PLATFORM_DOCTRINE.md` → `AGENTS.md` → `CLAUDE.md` → `TASKS.md` → this file.

---

## GUARDRAILS (firm — never cross; everything else is your judgment)
- **Mapping/reading is free; destroying or merging is gated.** Do NOT delete branches, force-push, or merge anything that changes prod or could lose work without surfacing it for DI/Chat-Claude approval first (RED → `needs-human-gate`). A branch you can't prove is fully redundant is not yours to delete.
- **The canonical model is the convergence target, and it is fixed:** organizations + engagement_contexts + relationship_types; conversations + conversation_participants + conversation_messages; customer_requests (+customers); projects on organization_id. Anything a branch does differently is *flagged as drift*, never silently adopted as a second standard.
- **Production + the applied migration ledger are the source of truth — not branch files.** If a branch's schema or migrations disagree with prod, prod wins; the branch is the thing that must conform.
- **Create NO new parallel lines while auditing.** No "audit-v2" branch families. One audit branch, one report.
- **Never bypass branch protection or `--admin`-override.**

## DIRECTION (a sketch — floor, not ceiling)
You'll likely want to: enumerate every branch, local and remote, with last-commit date, which agent/author, how far ahead/behind `main`, and whether it's already merged; then classify each in plain language — *already merged (safe to retire)*, *stale/abandoned*, *active but divergent*, *overlaps the canonical model or the core loop*, or *unknown → needs DI*. Pay special, careful attention to whether `registered-user-core-loop-v1`, `adaptive-human-centered-os-v1`, or any other branch re-implements auth, the org model, the work-journal, or the user loop in parallel to canon — diff their schema/RPCs/routes against the canonical line and say plainly whether it's duplication. Look past branches too: duplicate directories, multiple config/lockfiles, `v1/v2` naming, anything that smells like a second copy. Then propose, per branch, a convergence action — fold (rebase/merge onto canon), retire (close after confirming no unique value), or escalate (needs a DI call) — and carry out the obviously-safe consolidations within the gate rules while queuing the rest. If something else is needed to make this genuinely one coherent project, do it.

## DEFINITION OF DONE (outcome, not steps)
- A single report (e.g. `docs/BRANCH_CONSOLIDATION_AUDIT.md`) accounts for **every** branch, each with a plain-language explanation and a recommended action — nothing left unexplained.
- A definitive, evidenced answer to: *is the core user loop / canonical org model duplicated anywhere?* If yes, which branch and the fold/retire recommendation.
- A clear **go / no-go for the keystone (TASK 01)**: either "the loop exists nowhere else — safe to build" or "branch X already holds part of it — fold/rebase instead of rebuilding."
- Obviously-safe consolidations done (within the gate); everything destructive or uncertain queued for DI with a one-line rationale each.
- DI can read the result and finally see the whole repo as one knowable, converging project.

Deliver the report (and a draft PR if any code/branch changes are proposed). Keep every destructive or prod-touching step behind the gate.
