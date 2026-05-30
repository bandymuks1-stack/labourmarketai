# TASK 04 — Make the Working Loop Usable by a Real Company (Roadmap Phase 2)
**For:** Claude Code (executor) · **From:** Chat Claude (architect) · **Date:** 2026-05-30
**Where it fits:** `docs/PROJECT_ROADMAP.md` → Phase 2 ("make the loop usable by a real company"). Builds directly on the keystone (TASK 01 / PR #157), which made verified Work Proof real at the RPC layer.
**RUN ORDER:** after PR #157 (keystone) merges to main.

> Direction toward a goal, not a boundary. The "likely surfaces" are a sketch — build whatever genuinely lets a real company walk the loop unaided. Firm lines are the **Guardrails**. Go broad; exceed the minimum.

---

## THE GOAL (the destination)
The trust loop now *works* — but only by calling RPCs by hand. A real owner, manager, and worker cannot yet walk it through the product. **This slice makes the loop genuinely usable by real people, end to end, with no terminal and no hand-called RPCs.**

When done, broadly: a company owner can bring a worker into their organization and grant a manager journal-review rights, all from the UI; that manager sees the worker's pending journal entries in a review queue and confirms the demonstrated skills with a click; the worker logs their work as easily as possible and then *watches their skill turn verified* — a visible badge on their profile, their living CV growing in real time. And onboarding lands every role on their real first action — a worker on "log your first entry," an owner on "add your team / review their work" — never a dead preview. The test of done: a real foreman, owner, and worker each walk their part of the loop unaided, and a declared skill becomes a visible verified proof without anyone touching a database.

This is what turns the keystone from a working mechanism into a product a company can actually use — the bridge to the first real customer (Phase 3).

## HOW IT FITS THE WHOLE
The platform's value is verified work driving trust. The keystone made that real once; this makes it real *repeatably, by anyone*, through the product surface. Every later phase (matching, Trust Connect, marketplace, AI) assumes real people are producing verified proof through a usable interface — this slice delivers that interface.

## READING ORDER
`docs/PROJECT_ROADMAP.md` → `PROJECT_VISION.md` → `PLATFORM_DOCTRINE.md` → `AGENTS.md` → `CLAUDE.md` → `TASKS.md` → this file.

## GUARDRAILS (firm — never cross)
- **Build on the live RPCs, don't reimplement them:** `add_org_member`, `grant_org_manager`, `set_engagement_journal_review`, `review_journal_entry`, `reviewable_journal_entry_ids`, `confirm_entry_and_verify_skills`. The verification/membership logic lives in those SECURITY DEFINER RPCs — the UI calls them, never re-creates the logic or writes worker_skills/engagement_contexts directly.
- **Canonical org model only** (organizations + engagement_contexts); never the legacy company_workers/agency_workers.
- **Default-closed preserved**; a manager sees only entries they're entitled to review (via the reviewable RPC), a worker sees only their own.
- **No fake/sample/demo data in the product** — real data or an honest empty state.
- **Author content is multilingual** (§2): anything a worker/manager writes shows in the viewer's language with original stored.
- Use the **frontend-design** skill for the UI. Likely GREEN-class (UI over existing RPCs, no schema/RLS change) → flows through the auto-merge envelope. If a schema or RLS change turns out necessary, it's RED → stop for review.

## DIRECTION (a sketch — floor, not ceiling)
You'll likely build: an owner/admin control to add a worker to the org and toggle a manager's journal-review rights; a manager review queue listing pending org-scoped entries with a confirm-skills action and clear status badges; the worker's profile showing skills with their verification state (declared → verified) and the moment-of-truth flip; and onboarding routing that drops each role on its real first action. Wire it all to the live RPCs, with honest empty states where there's no data yet. If anything else is needed for a real company to walk the loop unaided, build it.

## DEFINITION OF DONE (outcome, not steps)
- A real owner, manager, and worker can walk the full loop through the UI alone — add to org, enable review, log entry, confirm skill, see it verified — with no hand-called RPCs and no terminal.
- A worker visibly sees a skill flip to verified (a real badge), backed by a real confirmation, on prod.
- Onboarding lands each role on a real first action, never a dead/preview screen.
- No fake data anywhere in the product surface; honest empty states where data is absent.
- All membership/verification goes through the live RPCs on the canonical model; default-closed and the proof chain remain intact.

Deliver a draft PR (auto-merges if GREEN) + a short walkthrough showing a second verified proof produced entirely through the UI by real users.
