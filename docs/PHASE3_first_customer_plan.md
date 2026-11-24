# labourmarket.ai — Phase 3: First Real Customer (full scene)
**For:** DI (founder) + Chat Claude (architect) + Claude Code (executor) · **Date:** 2026-05-30
**Where it fits:** `docs/PROJECT_ROADMAP.md` → Phase 3. Builds on Phase 1 (verified proof real) + Phase 2 (loop usable through the UI). main is one clean line.
**What this is:** the orienting scene for getting ONE real company onto the platform and producing real verified proof for them. Two tracks — engineering (Claude Code) and business (DI + Chat Claude) — sequenced so they meet at a live pilot. Not a single sprint; we march one slice at a time.

> Direction toward a goal, not a boundary. Order may flex with judgment. Firm lines: the project Guardrails (one line/no parallels, canonical model, safety tiers, honesty, proof spine sacred). Build toward the whole.

---

## THE GOAL OF PHASE 3
Get **one real construction company** (the first vertical) using labourmarket.ai for real: their workers logging real work, their managers confirming it, real verified proofs accumulating — and the company seeing concrete value from it. The destination of this phase is a **signed, running pilot with one real client** and a tight feedback loop turning their reactions into fast fixes. Everything here serves that single outcome.

Success looks like: a real owner signs a simple pilot agreement at an owner-approved price (or free pilot by choice), onboards a handful of real workers, runs the loop for real over a few weeks, and we can point to real verified proofs and real company value — with their feedback already shaping the next slices.

## THE TWO TRACKS (and where they meet)
**Engineering (Claude Code)** — make the loop *pilot-ready* for one company.
**Business (DI + Chat Claude)** — the value story, the pilot offer, the agreement, the pricing, the client, the feedback loop.
They meet at the moment a real owner walks the loop with their real crew.

---

## THE MARCH (sequenced slices)

### Slice 3.1 — Demand intake, real (ENGINEERING · Claude Code · next handoff)
Wire the canonical demand path so a company can express a real need in-product, not by hand. Consolidate to ONE intake: `customer_requests` (+ customers, attachments); fold `pilot_drafts` into it; decide `leads` (keep as pre-auth funnel vs retire) — no third path. Repoint the live Phase-9 sales-offer / pilot-request CTAs onto the canonical intake. Honest empty states. Likely 🟡 (touches demand schema) → migration committed, RLS/gate as needed. *Outcome: a real company need can be captured and seen through the product, on one canonical model.*

### Slice 3.2 — The value story + use scenario (BUSINESS · Chat Claude drafts, DI owns)
Articulate, in plain founder-ready language: what concrete value labourmarket.ai gives a construction company *today* (verified crew skills, a real growing record, manager-confirmed proof, trust over self-claims) — honestly scoped to what's actually live (Phases 1–2), not promised futures. Define one or two concrete real use scenarios (e.g. "a foreman confirms a formworker's skills across a 3-week site; the company gets a verified crew roster"). *Outcome: a crisp, true value narrative + a scenario the pilot is built around.*

### Slice 3.3 — Sales material + pilot agreement (BUSINESS · Chat Claude drafts, DI + lawyer review)
A short sales one-pager / deck outline grounded in the real value story. A simple pilot agreement **template** (scope, duration, data handling/privacy per doctrine default-closed, no false promises, mutual exit). NOTE: Chat Claude is not a lawyer — the agreement is a draft for DI and a real lawyer to review before use. *Outcome: ready-to-send pilot materials.*

### Slice 3.4 — Owner-approved pricing (BUSINESS · DI decides, Chat Claude structures)
Structure pricing options consistent with PLATFORM_DOCTRINE §13 (marketplace fee primary; paid listings/verification services possible; banner ads forbidden until 100K users; mission-sustainability not loss). Present clear options (incl. a free/founding-pilot path) for DI to approve. Pricing is DI's call. *Outcome: an owner-approved pilot price (or free-pilot decision).*

### Slice 3.5 — One real client test (BUSINESS + ENGINEERING converge · DI leads, both support)
Get one real company onboarded and walking the loop. Whatever small real gaps surface for *their* actual scenario become quick slices. *Outcome: a live pilot — real workers, real confirmations, real verified proofs for a real company.*

### Slice 3.6 — Fast feedback fixes (ENGINEERING · Claude Code · continuous)
Turn the client's reactions into fast GREEN slices through the envelope (UI/UX, clarity, the Phase-2 polish backlog: worker-lookup picker, verified badge across all skill views). Honest, quick, no scattering. *Outcome: the pilot improves under real use; trust compounds.*

## GUARDRAILS (firm — never cross)
- One line, no parallels: ONE demand intake (no third path), canonical model only, name always labourmarket.ai.
- One slice at a time toward the whole; no parallel fronts.
- Safety tiers: GREEN self-merges; RED (schema-destructive/RLS/auth) stops for review; migrations additive+reversible via MCP after approval, never db push.
- Honesty above polish: real data or honest empty states; the value story claims only what is actually live (Phases 1–2); AI/marketing never overpromises; agreement makes no false guarantees.
- Privacy/proof spine sacred: default-closed, append-only, hash-chained, GDPR-mindful data handling in any client-facing agreement.

## HOW WE MARCH
Chat Claude issues each ENGINEERING slice as its own `TASK_NN` goal-forward handoff (next: TASK 05 = Slice 3.1 demand intake) and drafts each BUSINESS artifact directly for DI. One slice lands clean before the next opens. DI decides all business/pricing/client matters; Chat Claude drafts and structures; Claude Code builds.

## DEFINITION OF DONE (Phase 3)
- One real company is running a live pilot on the canonical platform, producing real verified proofs.
- A true value story, sales material, and a reviewed pilot agreement exist; an owner-approved price (or free-pilot) is set.
- The client's feedback is flowing into fast GREEN fixes.
- Everything stayed one clean line — no parallels, proof spine intact, honesty preserved.
