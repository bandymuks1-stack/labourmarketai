# TASK 01 — Make Verified Proof Real (The Keystone)
**For:** Claude Code (primary executor) · **From:** Chat Claude (architect) · **Date:** 2026-05-30
**Branch:** `feat/cc/membership-engagement-reroute`

> This file is a **direction toward a goal, not a boundary of the work.** The technical anchors below are there so you don't fight the wrong architecture — they are NOT a closed checklist that caps the task. The goal is the target; reach it broadly. If making verified proof genuinely work requires touching things not listed here (an invitation flow, a missing status, a confusing UI path, a recompute job), do it. Exceed the minimum. The only lines you must not cross are the **Guardrails**.

---

## THE GOAL (read this fully — this is the real target)
labourmarket.ai's entire promise is one sentence: *"the right person for the right work at the right time — and WHY."* The "WHY" is verified work. A worker declares skills; they log what they actually did in the Work Journal; a manager who was actually there confirms it; that confirmation turns a claim into **proof**. Proof is what makes matching trustworthy, what a company will pay for, what separates this from "the LinkedIn problem" of unverified self-claims. Without verified proof flowing, the whole platform is just declarations.

Today that chain is broken at the last link. On production there are real profiles, real workers, real journal entries — but **zero verified proofs**, because no worker is actually connected to an organization in a way that gives any manager the authority to confirm their work. The journal entries hang on org-less engagements; there are no membership links; so no manager is ever "in the loop." Everything upstream works; the moment of truth — confirmation — has never once happened for real.

**The goal of this task is to make that moment of truth actually happen, for real, end to end.** A real worker, genuinely attached to a real organization, logs real work; a real manager with real authority confirms it; and the system records that as a verified Work Proof that shows up on the worker's profile and is now trustworthy enough to drive matching later. The first true verified proof on production is the milestone.

"Truly done," broadly, means the path a real construction crew would actually walk is smooth and complete: an owner can bring a worker into their organization; can give a foreman/PM the authority to review; that manager sees the worker's pending journal entries and can confirm them; and the worker watches their declared skill become *verified* in front of them. Not a demo, not a single hard-coded happy path — the genuine flow, built well enough that the next worker and the next manager just works. If parts of that journey are missing or rough (joining an org, granting review rights, the review queue UI, the worker seeing the result), they are in scope because they are part of the goal.

This is **the keystone of the entire roadmap.** Roughly twenty downstream ambitions — matching by skills/availability/evidence, Trust Connect, the marketplace, real customer pilots, the sales story, AI assistance — are hollow until proof is real. So this is the highest-leverage thing in the whole project. Treat it that way: aim for a genuinely working trust loop, not a minimal box-tick.

## HOW THIS FITS THE PROJECT GOAL
Verified proof is the heart of the universal labour-market OS. It is the data AI will later recommend on (and the reason AI can "never lie" — it only speaks from confirmed data). It is the legal/audit backbone (append-only, hash-chained). Building this correctly — on the canonical model, with the proof chain intact — is what makes everything after it possible and honest.

## READING ORDER
`PROJECT_VISION.md` → `PLATFORM_DOCTRINE.md` → `AGENTS.md` → `CLAUDE.md` → `TASKS.md` → this file.

---

## GUARDRAILS (firm — never cross; everything else is your judgment)
- **Build on the canonical model, never a parallel one.** Worker↔org membership belongs on `engagement_contexts` (+ `organizations`, `relationship_types`), NOT on the legacy `company_workers`/`agency_workers` tables. Do not create a new membership concept.
- **Protect the proof chain.** `engagement_contexts` and `journal_entries` are append-only and hash-chained (`hash_prev`/`hash_self`). Every write goes through the hash-chain RPC, never a raw INSERT, or the legal/audit trail breaks.
- **Keep visibility default-closed.** A manager may confirm only a worker's entries within the same org where they hold review rights; workers see only their own. Never widen who can read private journal/proof data.
- **Migrations additive + reversible + committed, not auto-applied.** This slice touches schema (additive) and RLS (a permission change) — that makes it gate-class. Before anything reaches production, STOP and surface the exact migration SQL + RLS diff + confirm logic for approval; then apply via MCP `apply_migration`. Never `db push`. Don't drop or migrate the legacy membership tables here (retire them in a later slice).

## DIRECTION (a sketch — not the limits of the work)
You'll likely need: room on `engagement_contexts` for a manager's operational role and a journal-review flag; a clean way for an owner to bring a worker into the org and grant a manager review rights (reuse/extend existing provisioning + invitation RPCs rather than inventing new ones); a confirm action that records the confirmation against the manager's engagement and turns the relevant declared skill into a verified one (with confidence recomputed); and the UI on both sides — an owner/manager review queue, and the worker seeing their skill flip to verified. Whatever else the real journey needs to feel complete is in scope. This is a floor, not a ceiling.

## DEFINITION OF DONE (outcome, not steps)
- On the live database, a real verified Work Proof now exists that did not before: a genuine confirmation recorded by a real manager, against a real worker's real journal entry, turning a declared skill into a verified one — demonstrated, not faked.
- The full path that produces it (join org → grant review → log → confirm → see verified) actually works for a fresh worker/manager, not just one hard-coded case.
- The proof chain is intact (all engagement writes hash-chained) and visibility stays default-closed.
- No parallel membership path was introduced; legacy tables are untouched and ready to retire later.

Deliver a draft PR plus a plain walkthrough proving the first real verified proof now exists, with the migration SQL + RLS diff queued for the gate.
