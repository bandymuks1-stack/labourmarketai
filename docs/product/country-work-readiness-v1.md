# Country Work Readiness v1

> Canonical model + official-source policy for the per-country document /
> readiness matrix. Implementation: `apps/web/lib/country-readiness/`. Enforced
> by `apps/web/lib/guards/country-readiness-provenance.test.ts` and
> `no-legal-guarantee-copy.test.ts`. Subordinate to
> [`pre-payment-product-readiness.md`](./pre-payment-product-readiness.md) §6.

## Why app-layer, not a DB seed

The matrix is **version-controlled, reviewable, and guard-enforced** in the app
layer — the same pattern as `lib/labour-market/evidence.ts`. The DB table
`country_document_requirements` stays the **admin runtime-override** surface
(empty until an admin curates a country). This keeps every requirement statement
in git history with a diffable source + review date, and lets CI block any
unsourced claim before it ships.

## Coverage

- **Countries (10):** LT, LV, EE, PL, DE, NL, DK, NO, SE, FI.
- **Scopes (4):** `worker_solo`, `worker_posted`, `team_subcontracting`,
  `company_hiring`.

## What v1 asserts (and what it deliberately doesn't)

v1 encodes the **genuinely-official EU framework** that applies across these
markets, with stable europa.eu / European Labour Authority sources:

- free movement of workers (valid ID; EU/EEA need no work permit, non-EU do);
- the **A1 portable document** (social-security coordination) for posted workers;
- the **prior posting notification** to the host country (Posting of Workers
  Directive 96/71/EC + enforcement 2014/67/EU);
- host-country minimum pay / core working conditions for posted workers;
- the company posting-registration obligation.

Everything **country-specific** beyond that framework (exact national portals,
sector/construction cards, local tax/social-security registration, subcontractor
chain liability) is **not invented** — it is encoded as a `needs_legal_review`
pointer to the official national site (via the ELA hub). Each country therefore
always surfaces at least one explicit "confirm the national specifics" item.

## Per-requirement provenance (all mandatory, guard-enforced)

| Field | Meaning |
|-------|---------|
| `sourceId` + `sourceUrl` + `sourceTitle` | a named official source (https, europa.eu / ela / eures only) |
| `lastReviewedAt` | ISO date the statement was last checked against the source |
| `reviewedBySystem` | always `true` — system-curated, never user-authored |
| `confidence` | `official` · `strong` · `needs_legal_review` |
| `level` | `required` · `recommended` · `conditional` |
| `riskLevel` | `high` · `medium` · `low` (UI emphasis only, not legal force) |

## Official source registry

| id | publisher | page |
|----|-----------|------|
| `eu_your_europe_citizens` | EU — Your Europe | Citizens: working abroad |
| `eu_your_europe_business` | EU — Your Europe | Business: posting staff abroad |
| `eu_posting_ela` | European Labour Authority | Posting of workers — national sites |
| `eu_social_security_a1` | EU — Your Europe | Social-security forms (A1) |
| `eu_eures` | EURES | European job-mobility portal |

## Safety contract (binding)

- Nothing here is legal advice or a guarantee of legal work.
- No requirement is presented as final while `confidence = needs_legal_review`;
  the UI shows that state explicitly.
- The user is always directed to confirm with the competent national authority /
  an accountant / a legal advisor.
- The `no-legal-guarantee` guard blocks any "guaranteed legal / legally approved
  / compliance guaranteed" wording (EN + LT) from message copy.

## How later slices use it

- **PR4 (worker readiness UI):** per-country status = required-docs from this
  matrix vs the worker's `worker_documents`.
- **PR5 (company need):** flags whether a country has a curated checklist.
- **PR9 (admin):** the admin curation surface edits the DB override table; rows
  flagged `needs_legal_review` appear in the "country rules needing review" queue.
