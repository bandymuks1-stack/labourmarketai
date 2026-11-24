# Universal Human Capability Flow — Audit v1

**Date:** 2026-06-02
**Scope:** login / register / onboarding → profile → activity & work journal → skill
evidence → human confirmation, including LT/EN message files.
**Question:** does the product assume the user is a construction worker, a formal
employee, or a classic CV candidate — and where does that assumption block a
student, abiturient, crafter/older person, hobbyist, volunteer, seller/creator,
or service provider?

## Verdict

The **architecture is already universal-friendly** — onboarding is person-first
and multi-role (`worker / company / agency / customer`, choose one *or more*),
the journal is free-text, and PR #236 added honest provenance labels
(self-declared · suggested from entry · not verified). The blockers are almost
entirely **copy/wording** that *psychologically* narrow the audience to
construction workers and job-seekers, plus **two schema-level limits** (confirmer
roles, profession taxonomy) that need a migration and are therefore out of scope
for this safe slice.

## Findings

### A. Soft blockers — copy/wording (fixed in this PR)

| # | Surface | Key | Before | Impact |
|---|---------|-----|--------|--------|
| A1 | Journal composer label | `journal.whatDidYouDo` | "What did you work on today?" / "Ką šiandien dirbote?" | MED — frames entry as *work* only |
| A2 | Journal composer placeholder | `journal.textPlaceholder` | work-only example | HIGH — first concrete hint of *what to write* |
| A3 | Journal composer examples | `journal.example3` | "Assembled furniture…" | MED — examples skew to manual work |
| A4 | Journal review tip | `journal.inbox.writeConcreteWorks` | "painted walls, fitted rafters, dug sand, assembled formwork" / "dažiau sienas, montavau gegnes, kasiau smėlį, rinkau klojinius" | HIGH — **pure construction**, the only concrete "how to describe" guidance |
| A5 | Onboarding worker role | `auth.onboarding.rolePicker.worker.desc` | "Seek work, build your CV, get verified." / "Ieškoti darbo…" | MED-HIGH — job-seeking-only, and "get verified" over-claims |
| A6 | Profile hub lead | `profileHub.lead` | "CV, skills and **work** evidence…" | MED — CV/employment-centric |
| A7 | Profile evidence intro | `profileHub.evidence.intro` | "…backed by real **work** entries." | MED — narrows evidence to work |

**Fix applied:** broadened each string so it spans **learning / activity / work /
product** domains in both LT and EN, while keeping every honesty invariant
(nothing claims automatic verification or matching; "earn confirmations" /
"gauk patvirtinimų" stays human-and-honest). The existing `product-readiness`
guard tokens (customer + project/proposal + team in the example set; a
customer/report/request signal in the placeholder) are preserved.

### B. Already-honest surfaces (no change needed)

- `structuring.ruleBasedNotice` — "small dictionary and rules — no AI."
- `structuring.provenance.*` + `journal.skillProvenanceNote` (PR #236) — the
  self-declared / suggested-from-entry / not-verified triad.
- `workerEvidence.footnote` — "Nothing is confirmed automatically."
- `profileHub.notVerified` — "Not yet human-verified or document-verified."

### C. Hard blockers — schema, **deferred** (need a migration; out of scope here)

| # | Limit | Where | Why deferred |
|---|-------|-------|--------------|
| C1 | Confirmer roles are employment-only (`manager`, `owner`, `external_manager`) | `journal/page.tsx` `relationship_slug` filter + `journal.entry.confirmerRole` | Adding teacher / guardian / buyer / family / peer confirmers is a DB enum + RLS change. The goal forbids migrations in this slice. **Do not** add UI labels for confirmers the backend cannot record — that would be a dishonest promise. |
| C2 | Profession taxonomy is 18 construction trades | `messages/{lt,en}/professions.json` | A teacher/student/crafter/seller has no honest option. Expanding the taxonomy safely (without forcing a construction self-label) is its own slice; some surfaces also persist a `profession` slug. |
| C3 | Productivity units skew construction (`square_meters`) | `productivity-units.json` | Adding `items / pages / customers / students` etc. is low-risk copy, but pairs naturally with C2; deferred to keep this slice focused. |

`journal.composeTiler` ("Laid {area} {unit} of tiling…") is **dead** — no
component references it — so it is not a live blocker. Flagged for removal in a
later cleanup, left untouched here to keep the diff minimal.

## Honesty & safety guarantees (unchanged)

- No automatic verification, no automatic matching, no fake AI claims.
- No payments, public marketplace, external APIs, outbound messages, or
  migrations in this slice.
- No public exposure of minors: this PR only broadens private-by-default entry
  copy; it does not change visibility or add public surfaces.

## Next safe slices (recommended order)

1. **Confirmer-role breadth (C1)** — migration adding honest confirmer
   relationships (guardian/teacher, family, buyer/customer, peer/team) + RLS +
   role-appropriate labels. RED class (migration) → human-gated.
2. **Capability taxonomy beyond trades (C2)** — student subjects, hobbies,
   handmade products, volunteering, services; keep self-declared honesty.
3. **Units for non-construction output (C3)** — items, pages, customers,
   students, orders.

This PR delivers step 0: remove the highest-impact *copy* blockers so the entry
flow already reads as universal while the schema slices land safely behind it.
