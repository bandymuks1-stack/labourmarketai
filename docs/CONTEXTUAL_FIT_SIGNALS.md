# Contextual Fit Signals — Score Doctrine

> **Status:** Binding. Operationalises `docs/PRODUCT_CONSTITUTION.md` §10
> ("No universal value — contextual fit signals only"), and extends §5 (No fake)
> and §9 (Demo-to-Real). Where this doctrine and a UX/spec request conflict, this
> doctrine wins — flag the conflict in the PR.
>
> **Scope of this sprint:** doctrine only. **No scoring UI, no DB fields, no
> matching/scoring/verification logic, no fake scores are introduced here.** This
> document defines the rules any future fit/coverage signal must obey.

---

## 0. The one rule

> labourmarket.ai **never** assigns a person, worker, company, team, or agency a
> single universal value. There is no "overall human rating", no global rank of
> worth, no league table of people. Every number the product shows is a
> **contextual, explainable signal** — tied to a specific question and traceable
> to evidence.

A signal that cannot answer **"measured against what, and from which evidence?"**
must not ship — not as real, not as concept, not as preview.

This is a dignity rule first and a correctness rule second. People are
participants, not commodities to be ranked (PRODUCT_CONSTITUTION §1, §10).

---

## 1. Why (the harm we are designing out)

A single "overall score" on a human:

- flattens a person to one number and invites a worth ranking of human beings;
- is never explainable (what is a "7/10 person"?);
- hides the context that actually matters (fit for *this* job, coverage of
  *this* skill set);
- becomes a discrimination and dignity hazard the moment it is shown or sold.

The same applies to companies, teams, and agencies — no universal "business
value" badge. Context is the product; the universal number is the anti-pattern.

---

## 2. Allowed signal types

Each allowed signal is **bound to a context** and **derived from traceable
evidence**. The five canonical types:

| # | Signal | What it answers | Bound to | Evidence source |
| - | ------ | --------------- | -------- | --------------- |
| 1 | **Capability coverage** | "How much of a *defined* skill set is covered?" | A named skill set / requirement list | Worker's recorded skills + proof status |
| 2 | **Fit signal** | "How well does this fit *this specific* search/project/role/need/opportunity?" | One specific opportunity context | Coverage + readiness against that context's stated criteria |
| 3 | **Extra strengths** | "What is held *beyond* the required criteria here?" | The same specific context | Additional skills/evidence not required by that context |
| 4 | **Readiness / proof status** | "Is the underlying evidence present and traceable?" | The participant's own records | Confirmed journal entries, documents, employer/manager confirmations |
| 5 | **Future comparison types** | (reserved) | Must declare its context | Must declare its evidence |

### Type 5 — admission test for any new signal

A new comparison/signal type may be added **only if it passes all four**:

- **Contextual** — it is explicitly *against* a named thing (a skill set, a
  project, a role, a need), never a free-floating label on the person/org.
- **Traceable** — every input resolves to a real record or a clear data source.
- **Explainable** — the viewer can see *what it is measured against* and *why* it
  has the value it has (the inputs are inspectable).
- **Human-dignity safe** — it does not rank human worth, does not enable a worth
  league table, and respects §1/§10.

If any check fails, the signal is forbidden.

---

## 3. Forbidden patterns

- ❌ A single "overall" / "universal" score, rating, grade, or OVR on a person or
  organisation (e.g. "OVR 87", "Profile strength 92/100", "A-tier worker").
- ❌ Any global ranking / leaderboard of people or companies by total worth.
- ❌ A score shown **detached from its context** ("she's a 78") — even if computed
  contextually, it must be presented *with* its context.
- ❌ A fit/coverage number **not** traceable to evidence (a guessed or seeded
  percentage), including as a concept/preview visual framed as real.
- ❌ "Verified" / "matched" / "ranked" labels when the verification/matching/
  ranking logic does not exist and the output is not traceable (see §5, §9).
- ❌ Decorative numbers that *look* like a personal score (avoid implying a rating
  even in concept art).

---

## 4. Required framing rules (when signals do ship)

When a contextual signal is eventually built and promoted to real:

1. **Always paired with its context.** Render the signal and the thing it is
   measured against together ("8/10 skills for *Site Electrician — Project X*"),
   never the number alone.
2. **Always explainable on demand.** The inputs (which skills, which evidence,
   which criteria) must be inspectable by the person it concerns.
3. **Coverage, not verdict.** Prefer "covers N of M required" / "fit for this
   need" over a judgement word about the person.
4. **Additive extras, not bonus worth.** Extra strengths are shown as "also
   brings…", not folded into a higher universal grade.
5. **Evidence-gated.** Readiness/proof reflects only traceable evidence; absence
   of evidence shows as "not yet shown", never as a low worth score.
6. **Human-first language** (PRODUCT_CONSTITUTION §10, demo-to-real §4): fit,
   coverage, readiness, proof, strengths, needs — never commodity framing.

---

## 5. Demo-to-real interaction

Per `docs/DEMO_TO_REAL_DATA_POLICY.md`, a fit/coverage signal is classified
`concept · sample · preview · real`:

- It may exist as **concept/preview** to communicate direction **only if** it is
  already shown *with* its context and never as a universal personal rating.
- It becomes **real** only when (a) the context is defined, (b) the inputs are
  traceable to real records, and (c) the coverage/fit logic actually exists.
- A signal is **never** promoted to real by relabeling. No fake scores, ever.

---

## 6. Standing conflict — concept "OVR" copy

Current marketing concept copy (worker/company/agency pages, player-card
showcase) describes a single **"OVR — one 0–99 rating"** and **"profile
strength"** for a worker, plus "Verified skills + OVR" for companies. **This is a
universal-value score and violates §10.**

- It is **not changed in this docs-only sprint** (no app/code changes here).
- It **must be reframed** to contextual coverage/fit signals — or retired —
  **before** any scoring is implemented or any such signal is promoted to real.
- Recommended reframe direction: replace the single OVR with **per-context
  coverage + fit** (Types 1–2) plus **readiness/proof** (Type 4), each shown with
  its context. "Profile strength" → "readiness for *this* opportunity".
- Tracked in `TASKS.md` as the OVR → contextual-signals reframe.

Until reframed, the OVR concept stays governed as PRE-ALPHA **concept** and must
not be presented as a real production rating.

---

## 7. Change control

This doctrine is amended only by explicit owner/DI decision (same rule as the
Product Constitution). Any sprint that designs or builds a fit/coverage signal
must check its design against §0–§5 here and PRODUCT_CONSTITUTION §10, and record
the context + evidence source for every signal it introduces.
