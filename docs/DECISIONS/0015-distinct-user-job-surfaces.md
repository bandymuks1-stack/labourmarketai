# 0015 — Distinct user-job surfaces (Product Constitution A-14)

Date: 2026-09-13 · Status: **OWNER DECISION, recorded 1:1** · Scope: `docs/PRODUCT_CONSTITUTION.md` §12 / §13, `apps/web/lib/product-gate/*`, `.github/scripts/product-gate.mjs`

## 1. Owner text (verbatim)

> OWNER DECISION / CONSTITUTION CLARIFICATION
>
> Do not force the new Numbers capability into the existing Journal route merely because the current constitution blocks new top-level pages, and do not use a redirect alias as a workaround for a product-architecture decision.
>
> First determine from the actual product architecture, user journeys, existing routes/components/data models, and the full-product audit what Numbers really is:
>
> A) If Numbers is only a different representation of Journal data and belongs to the same user job, keep it as a view inside the existing Journal experience. Do not create a new product surface.
>
> B) If Numbers represents a distinct user job / decision space — for example operational state, hours, money, capacity, workload, progress, forecasts, economics, or organization/project/team performance — and forcing it into Journal would make the product architecture or UX worse, treat it as a legitimate independent product surface.
>
> OWNER WAIVER:
> I authorize a constitution change only if case B is demonstrated by evidence. This is not permission to proliferate pages.
>
> Update the constitution additively so that:
> - existing structures must be reused when the capability naturally belongs to them;
> - duplicate or convenience-only top-level pages remain prohibited;
> - a new first-class product surface is allowed when it represents a genuinely distinct user job/domain and reuse would materially damage UX, information architecture, or extensibility;
> - such structural changes remain owner-gated.
>
> Do not preserve an obsolete UX merely to satisfy an older implementation constraint. The constitution protects the product vision; it must not freeze old product implementations.

## 2. Determination for "Mano veikla skaičiais" (Work in Numbers)

**What Numbers is.** The person's DERIVED reading of their own recorded work over a chosen period: hours per period, hours · share · entries · first/last day · contexts · outputs · approved share · trend per skill, the hours no skill can claim and their provenance, the organization's own hour ledger beside (never summed), plausibility checks, and the growth kinds with their WHY. It is the model `WorkIntelligence` (`lib/journal/work-intelligence.ts`) read through the ONE reader `loadWorkIntelligence`. It is SEP-1 DERIVED, never FACT; the journal's rows are the fact.

**Case B applies. Evidence:**

1. **Distinct graph edge.** §14 names REAL WORK and TIME / CAPACITY as separate nodes of the product graph, and the value chain reads REAL WORK → EVIDENCE → CAPABILITY → CAPACITY. The journal is the REAL WORK edge; Numbers is the TIME → CAPABILITY reading over it (`product-graph.ts` node `time`, domain `time_capacity`).
2. **Distinct lens in the design authority.** `00-GALUTINE-DIZAINO-SISTEMA.md` lists **Time** ("kas buvo / yra / bus", the scrubber) as its own lens beside Conversation · World · Field · Context · Attention · Marketplace · My Space; §P prescribes a distinct visual language for fact / derived / forecast. The frozen contract §1.9 and §2.11: time is shown only where canonical evidence exists.
3. **Distinct user job and decision.** The journal's job is *record → see it saved → correct → submit for confirmation* (one entry, one day, one context, a write path). Numbers' job is *understand what dominates, over which window, how it moves, what to deepen or present* — the owner's loop names SKILL PRACTICE STATISTICS as its own station between SKILL ATTRIBUTION and LIVING CV, and the walk questions ("Kam skyriau daugiausia laiko?", "Kokius įgūdžius naudoju daugiausiai?", "Kur mano veikla auga?") are period questions no entry answers. Numbers owns no write; the journal owns them all (A-08 stays intact).
4. **Distinct audiences already read it apart from the journal.** The register (`EVID-7`) lists the reading's surfaces as the journal, the CV, the organization's person page and the organization report; the organization side composes the reading WITHOUT the recording surface (`/dashboard/people/[workerId]`, lane H roster block), and mobile exposes it as its own capability `journal.work_intelligence.get` beside `journal.list`.
5. **Reuse demonstrably damaged UX.** Before this train the journal page was 1,662 lines composing recorder, entry list, the full figures block, gallery and corrections in one scroll; the owner's production walk returned defects A ("does not visibly behave as a serious hour-based record"), B ("hours/share per skill absent") and K ("not one product"); the audit's UX findings and the target IA (`01-WORKER-MOBILE-IA-2026-09-13.md` §4) classify the journal page REDESIGN → split. A period-driven analytical station inside a day-driven recording page also breaks the §T 1M rule (server-side scoping by period vs. by day) and the mobile density rule (≤ 3 first-level blocks).

**What stays shared (no duplicate module, no parallel data model):** the rows (`journal_entries`, `journal_entry_metrics`, `journal_entry_skills`, `work_hour_allocations`), the ONE model and reader, the shared components `components/app/work-in-numbers/*` (the journal page's compact card and the organization pages render the same pieces), the checks acknowledgement flow, the skill and day links back into the journal, the i18n namespace `journal.intelligence`, the capability `journal.work_intelligence.get`.

**What becomes a separate surface:** exactly one worker station, `/dashboard/work-in-numbers` (read-only; owns no action), declared in `surface-registry.ts` under A-14 with all readiness answers stated honestly. The journal keeps a one-card summary with a link. No redirect alias; no `?view=` branch.

## 3. The clause that blocked the correct architecture

`WORLD_STATE_UX_ARCHITECTURE_V1` (axiom A-01 in `axioms.ts`, gate rule 6c): "Jeigu bent vienas atsakymas yra 'ne', sprendimas laikomas neatitinkančiu PRODUCT_VISION_LOCK" over the five answers `changesWorldState · reflectedOnMap · aiControlled · usableWithoutLeavingWorkspace · needsNoNewPage`, plus `ENTITY_BEHAVIOR_MODEL_V1` `worldStateCanControlIt` (rule 6d) — every new page in the authenticated workspace answers at least `needsNoNewPage` "no", so the rule blocks any first-class surface regardless of its user job. Scoped owner waivers (`.github/scripts/owner-waivers.mjs`) were the only exit, per PR and expiring.

## 4. Minimal amendment (additive)

- **A-14 (new axiom, machine-held):** existing structures are reused when a capability naturally belongs to them; duplicate or convenience-only top-level pages stay prohibited; a first-class surface for a genuinely distinct user job / graph edge is allowed when reuse would materially damage UX, IA or extensibility — demonstrated by evidence and recorded as an owner ruling in the surface declaration. Structural changes stay owner-gated: a declaration without the ruling is RED.
- **Declaration block `distinctSurface`** (five answers: `userJob`, `graphEdge`, `whyReuseDamages`, `evidence[]`, `ownerRuling`) on `SurfaceDeclaration`.
- **Gate:** with a complete A-14 block, the readiness answers `changesWorldState`, `reflectedOnMap`, `usableWithoutLeavingWorkspace`, `needsNoNewPage` and `worldStateCanControlIt` are reported as notices in the architecture diff instead of RED findings. `aiControlled`, `usesEntity`, `registrationIsEnough`, `aiCanWorkWithIt`, `second_dashboard`, `new_journal_module`, `duplicate_action` and `undeclared_surface` are unchanged — a distinct surface must still be AI-operable, entity-based, declared, and neither a second dashboard nor a journal module nor a second home for an action. An A-14 block without its ruling or evidence is `distinct_surface_unruled` (RED).

Nothing in A-01 is deleted; A-14 names the one condition under which its readiness answers may honestly be "no".
