# Answer Engine — High-Risk Content Policy v1

**Status:** Binding for the multilingual answer engine. **Date:** 2026-07-18.
Mirrors the guard-enforced honesty of `lib/country-readiness/*` (official EU
sources, review dates, `needs_legal_review`, never invent a national specific).

## High-risk topics
A question is **HIGH risk** when it touches any of: **labour law, migration,
visas, taxes, salaries, social security, safety, discrimination, licensed
professions, personal data** (`HIGH_RISK_TOPICS` in
`lib/answer-engine/contract.ts`).

## The hard gate (a HIGH-risk answer may NOT be indexed without ALL of):
1. **Real sources** — `sourceReferences` cite genuinely-official material (EU
   framework via `europa.eu` / the European Labour Authority hub / the
   `country-readiness` sources registry). No fabricated citation, ever.
2. **Country scope** — the answer states which country/countries it applies to;
   it never transfers one country's rules to another.
3. **A date** — a `lastReviewedAt` review date is shown.
4. **A review status** — the content passed `LOCAL_REVIEW_REQUIRED` → human
   confirmation before `READY_FOR_INDEX`.
5. **Human confirmation** — a human (editorial + legal where relevant) approved it.

Until all five hold, a HIGH-risk question stays `EVIDENCE_REQUIRED` /
`LOCAL_REVIEW_REQUIRED` and is **`noindex`, excluded from the sitemap**.

## Honesty rules (always)
- **Not legal/tax advice.** HIGH-risk answers carry an explicit "informational,
  not legal advice — confirm with the competent national authority" line, exactly
  as the existing country-readiness surfaces do.
- **Never invent a national specific** the product has not sourced; uncertain
  items point to the competent authority (ELA hub / Your Europe).
- **No fabricated numbers** (salaries, quotas, deadlines). Salary answers reuse
  the sourced/dated benchmark model and show figures only with their basis.
- **Personal-data answers** reflect the real product physics (default-closed
  visibility, consent-gated exposure, anonymised research) — never a promise the
  product does not keep.

## Registry enforcement (Wave 0)
The generator sets `riskLevel=HIGH` → `evidenceStatus=EVIDENCE_REQUIRED` and
requires ≥ 1 `sourceReferences` entry. The guard
(`lib/guards/answer-engine-registry.test.ts`) fails if any HIGH-risk question
lacks an evidence requirement or a source, or if any question is in an indexable
content state while any active locale is not `PUBLISHED`.
