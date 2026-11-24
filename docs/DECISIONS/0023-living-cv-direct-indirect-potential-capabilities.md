# 0023 — Living CV: direct, indirect and potential capabilities (owner constitution, 2026-10-11)

## Scope and authority
This is an owner-approved, cross-sector, cross-language product invariant for LabourMarket.ai. Agents, implementers, reviewers and tests must preserve it. This document supplements existing constitutions and architectural decisions; it does not replace or weaken them. If an existing rule appears contradictory, escalate the conflict instead of silently narrowing this vision.

## Non-negotiable product behavior
Living CV is a continuously evolving model of a person's real work, education, practice, projects, collaboration, results and demonstrated development — not a manually entered resume or a list of self-declared skills.

1. Infer **direct and indirect skills**, related capabilities, emerging professional roles, transferable experience, growth trajectories and new work/learning opportunities from the totality of authorized activity and evidence, across all sectors.
2. A person does **not** need to explicitly enumerate every skill in every worklog. A completed, manager-confirmed welding job is evidence of welding work and can generate a **potential** technical-drawing-reading signal and other related skills even when they were not stated. Do not suppress such hypotheses simply because the skill was not explicitly named.
3. Differentiate recorded actions, inferred/potential capabilities, corroborated capabilities and formally certified qualifications. These are **different evidence states**, not reasons to discard inference. A manager's confirmation of work supports the performed work; it does not automatically certify every inferred skill. Let managers optionally attest to specific related capabilities, and let people clarify naturally through Chat First.
4. Accumulate signals across repeated activities, contexts, projects, education, peer/manager attestations and time. Update confidence and evidence lineage as evidence grows. Surface new possible occupations, advancement or reskilling paths and useful matches, including when the person has never named that profession.
5. Notice professional stagnation or development gaps where evidence supports it, and suggest constructive next steps without falsely labeling the person.
6. Apply this to every sector: construction, hospitality/restaurants, accounting, warehousing, manufacturing, healthcare, education and others. The universal shared core must not be reduced to construction/recruitment-only flows.
7. Preserve privacy, consent, role-scoped visibility, correction/dispute and historical provenance. Never turn an AI hypothesis into an official license, qualification or blanket manager certification. Do not silently rewrite old approved history.

## Engineering and QA guardrails
- Fix misclassified labels, incorrect mappings, false certainty and unrelated approvals **without disabling indirect inference, potential skill discovery, professional growth or cross-role matching**.
- In particular, renaming a mistaken `Reading welding blueprints` category to `Welding` must not remove the ability to infer **potential** blueprint-reading from corroborating welding/project context and later refine it.
- Include regression tests for inferred-but-unconfirmed skills, confirmation scoped to the reviewed evidence, subsequent corroboration, emerging roles, multiple languages, multiple sectors, and persistence into Living CV and matching.
- Changes to classifiers, skill taxonomy, evidence model, CV display, review, and matching must explicitly demonstrate that this invariant is preserved. Do not claim compliance on the basis of unit tests alone: prove representative real-browser end-to-end flows.
- Prioritize reliable core journeys now. Advanced forecasting, LMC and Stripe can follow later; their absence must not narrow the Living CV model.

## Definition of done
An implementation is not done if it merely records the person's declared occupation or literal skill keywords. It must preserve evidence-grounded discovery of unstated potential, transparent confidence/provenance, clarification and growth pathways, while avoiding unsupported claims of certification.

## Implementation status (2026-10-11, integrated from PR #2279)
- **Potential capabilities** — `apps/web/lib/skills/potential-skills.ts`: a cross-sector map from an
  evidenced skill to related capabilities (welding/steel/rebar/formwork → technical-drawing reading,
  bookkeeping → data entry, waiting tables → customer service, teaching → presenting, …). Computed at
  read time in `deriveGrowthReading` (`potential`), from ONE evidenced skill upward; shown on the
  worker's growth surfaces as its own evidence state ("possible · from …"); never written to
  `worker_skills`; disappears once the person holds the skill in any state.
- **Evidence states kept apart** — recorded (`work_journal`), declared (`self_declared`), confirmed
  (`manager_confirmed`) and now *potential*; a manager confirms only the skills linked to the reviewed
  entry, unticked by default (#2271).
- **Label fixes keep inference** — `welding-blueprint` reads "Welding" (#2269); the potential
  blueprint-reading signal from welding is pinned by `lib/guards/living-cv-potential-inference.test.ts`.
- **Not yet** — potential capabilities as a weak signal in `match-v1` and team formation; a chat
  door to confirm/refine a potential capability in one sentence; manager attestation of a specific
  related capability. These extend this decision; none may narrow it.
