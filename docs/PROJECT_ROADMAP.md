# labourmarket.ai — North Star & Build Sequence

> Vykdymo programa (10 sprintų iki pilnos vizijos): [`PROJECT_EXECUTION_PLAN_10_SPRINTS.md`](PROJECT_EXECUTION_PLAN_10_SPRINTS.md)
**For:** Claude Code (executor) + DI (founder) · **From:** Chat Claude (architect) · **Date:** 2026-05-30
**What this is:** the orienting map — the full-product destination and the *sequenced* path toward it. It pairs with `PROJECT_VISION.md` (the *what*) by giving the *how-we-get-there, in order*. **It is NOT a single sprint to execute now.** Build toward it deliberately, ONE coherent slice at a time, each on the clean canonical line, each through the auto-merge gate. Every future slice handoff should cite where it sits in this map.

> Direction toward a goal, not a boundary. The phases below are the intended march, not a rigid contract — order may flex with judgment. The only firm lines are the **Guardrails**. Aim for the whole; never scatter into parallel fronts to get there faster.

---

## THE WHOLE GOAL (the destination, in full)
labourmarket.ai is a **universal labour-market operating system**: one place where work becomes trustworthy. A worker keeps **one honest profile**, logs what they actually do in the **Work Journal**, a manager who was there **confirms it**, and that confirmation becomes a **verified Work Proof**. From that real, confirmed data flows everything else — matching, recruitment, market intelligence, honest AI assistance — across nine launch markets, in each person's own language.

When the whole thing is working: a worker's profile *grows itself* as verified proof accumulates (a living CV, not a self-claim); a company or agency can find and engage **the right person for the right work at the right time — and see WHY**, grounded in confirmed work, never an opaque score; demand and supply are visible in real time; crews can be assembled, mobilized, housed, and paid; AI helps draft, search, and decide but **never lies and never acts without human confirmation**; and the platform is multilingual, default-closed/private by design, legally auditable (append-only, hash-chained), and financially sustainable. Construction is only the first vertical; the architecture expands to new sectors and countries without obstacles.

That is "done" at the product level. Everything below is the ordered march toward it.

## WHERE WE ARE (grounding, 2026-05-30)
- **Foundation converged:** one canonical data model (organizations + engagement_contexts; conversations*; customer_requests; projects on organization_id), legacy parallels removed, one Supabase project, one clean `main`. No parallel project — proven by audit.
- **Self-driving delivery live:** auto-merge envelope — GREEN slices merge themselves once CI (quality + migration-safety) is green; RED (destructive/RLS/auth) stops for human review.
- **Keystone in progress:** making the first real **verified Work Proof** happen end-to-end (TASK 01).

> **Owner-locked sequence (2026-06-10):** Phase 3 → **TASK 07** (living-arena
> UI, starts only after the owner's visual lock) → **M4+ AI**. TASK 07 is a UX
> layer and may run alongside Phase 4–5 engineering, but the AI layer always
> comes last, on verified Work Proof data. This pins the §21-C3 conflict of
> `docs/product/labourmarketai-full-product-overview-and-implementation-plan.md`.

## THE MARCH (direction — ordered, flexible)
- **Phase 1 — Verified proof is real (NOW).** The work-journal loop produces genuine confirmed proof on prod. *Everything downstream depends on this; until it flows, the rest is hollow.*
- **Phase 2 — Make the loop usable by a real company.** A clear company control center (on the canonical org model); onboarding that lands every user on a real first action (worker → log an entry; owner → add a worker / review); one canonical demand/intake (customer_requests; fold pilot_drafts; decide leads); continuous production smoke + honest empty-states + small UX fixes. Goal: a real foreman/owner can walk the whole path unaided.
- **Phase 3 — First real customer.** Articulate the concrete value to a company; define one or two real use scenarios; whatever the first pilot genuinely needs to be usable; sales material + a pilot agreement draft (DI + Chat-Claude; legal review by DI); owner-approved pricing (§13); one real client test; fast feedback fixes. *Engineering + go-to-market converge here.*
- **Phase 4 — Deepen the proof engine (M2).** External CV import (Level-0 unverified skills as fast onboarding); the 5-level verification ladder; auto-detecting skills from journal entries (tags → NLP); multi-profession UX.
- **Phase 5 — Trust productized (M3+).** The matching engine (skills · availability · evidence · country · price) built on the **dormant** job_demands/matches schema and driven by verified proof + real demand; Trust Connect; marketplace; crew booking; housing/mobilization; analytics (on pilot_events); company library; billing + plan limits (on existing plans/subscriptions). *Only meaningful once proof and demand are real.*
- **Phase 6 — Honest AI (M4+).** The six AI agent types (worker search, candidate fit, document prep, manager decision queue, market monitoring, communication drafting) and voice AI — all recommending only from verified data, never sending/approving/changing without human confirmation.
- **Cross-cutting, throughout.** Multilingual author→viewer translation (infra is day-1; evolve to community-assisted localization); expansion across the 9 launch markets and beyond; sustainability/monetization (§13); legal/audit integrity preserved at every step.

## GUARDRAILS (firm — never cross, at any phase)
- **One line, no parallels.** One repo, one `main`, one canonical model, one product name (labourmarket.ai — never "LABMA"). Never re-introduce a second model, branch family, or naming.
- **Toward the whole, one slice at a time.** Build deliberately in sequence; never open parallel fronts or scatter half-features to move "faster." Coherence beats motion.
- **Every slice on canonical structures**, extending them — never around them.
- **Safety tiers hold.** GREEN self-merges; RED (destructive / RLS-loosening / auth / irreversible) stops for human review; migrations additive + reversible, applied only via MCP after approval, never `db push`.
- **Honesty.** No fake/sample/demo data in the product surface — real data or an honest empty state. AI never lies, never acts without human confirmation.
- **The proof spine is sacred.** Append-only, hash-chained, default-closed. Never weaken it for convenience or speed.

## HOW WE MARCH (operating rhythm)
Chat Claude issues each slice as its own goal-forward handoff (`TASK_NN`), citing where it fits in this map. Claude Code builds it toward the whole, broadly, on the canonical line; GREEN flows through the envelope automatically; RED stops for review. One slice lands clean before the next opens. This map is the living reference — update it as phases complete.

## DEFINITION OF DONE
- **Per slice:** lands coherent on canon, gate-passed, with real (not faked) verification, visibly moving the whole forward.
- **The whole:** the work-journal trust loop, the company-facing surface, real-proof-driven matching, and trust productization are live; real companies use it across markets; the platform is multilingual, private-by-design, auditable, and sustainable — the universal labour-market OS, working.
