# Train G — institution ↔ learner chain in a real browser on production (2026-09-02)

Two bounded identities, both created through the public signup API with known passwords held only in the
agent's scratchpad: the **walker** (owner of `E2E Walker UAB`, organisation `a996113c-…`) acting as the
institution, and a fresh **learner** (`e2e-learner-202609021634@labourmarket.ai`, confirmed cross-device with
its `token_hash`, onboarded through the canonical `complete_onboarding` RPC). Chromium 1440 px (institution)
and 390 px (learner). Screenshots `g-*.png` beside this file. Residue: the learner account, one accepted
invitation, one `student` engagement context and the `training_provider` capability on the walker's
organisation — all on test identities (gate G-9).

| # | actor | step | observed |
|---|---|---|---|
| 1a | institution | `/lt/dashboard/company` (workspace = the company) | the education capability checkbox is offered; not yet settled |
| 1b | institution | tick "Mokome ir rengiame žmones" → save | `org-capability-settled-training_provider` after reload — invariant I-2 (one organisation, many capabilities) again, through the real UI |
| 1c | institution | `/lt/dashboard/network?type=join_organization&org=…` | the capacity control offers human names only: Darbuotojas / **Studentas** / Savanoris / Bendradarbis / Laisvai samdomas / Konsultantas — no database word |
| 1d | institution | select Studentas | nothing blocked (the organisation declared education) |
| 1e | institution | enter the learner's e-mail → send | honest result: "El. laiškų siuntimas dar neaktyvuotas — pasidalinkite kvietimo nuoroda tiesiogiai" + a ready link. Delivery is gate **G-1**; the invitation itself is stored and reaches the learner IN-APP (next row), so G-1 does not block the chain |
| 2a | learner | `/lt/dashboard/network` | the incoming panel shows the invitation **named by relationship** ("Studentas") |
| 2b | learner | Accept | accepted in the browser |
| 3 | learner | own `engagement_contexts` via RLS | `employee` (personal, `organization_id` null, primary — untouched) **and** `student` at `a996113c-…` (active, not primary) — the relationship is DATA, and it is NOT employment |
| 4 | learner | `/lt/dashboard` | the home brief carries the learning vocabulary (G2 / #1428 learner brief) |

Result: **G3 PRODUCTION_PROVEN** — the browser chain with two bounded identities that gate G-11 was waiting
for; the owner's 2026-09-02 execution directive ("bounded TEST identities") is the authority used, so **G-11 is
closed by directive**, not by a new decision.

Not covered here (unchanged from the register): the `can_view_worker` disclosure question for learners
(institution-learner link memo), courses/certification and the skills-gap feedback loop — server-proven
locally (#1301), not re-run on prod.
