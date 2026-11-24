# Eurostat legal / reuse evidence — recorded for activation

- **Reviewer:** ChiefOperator session (agantai), on owner authorization.
- **Review timestamp:** 2026-07-15 (re-verified against the live official
  copyright notice + the four dataset endpoints).
- **Evidence source:** Eurostat copyright/reuse notice,
  `ec.europa.eu/eurostat/web/main/help/copyright-notice`, and the live
  official dissemination API responses for the four datasets.

## Reuse basis (verbatim substance)
"Reuse of statistical data, metadata, publications, and other dissemination
tools published on this website for commercial or non-commercial purposes is
authorised provided the source is acknowledged." The Commission reuse policy
is implemented by the **Decision of 12 December 2011 (2011/833/EU)**.

## How each condition is satisfied
- **Commercial reuse authorised** → yes, with source acknowledgement.
- **Attribution** → every card shows "Source: Eurostat"
  (`intelligence.eurostat.attribution`); every observation carries the exact
  official request URL (`source_url`, which encodes the dataset code + query)
  and the official publication timestamp (`captured_at`); each import session
  records the retrieval timestamp — so the source, dataset and access date are
  traceable per row (the notice's DOI/access-date citation guidance is met in
  substance).
- **No endorsement** → the attribution states "not an endorsement by Eurostat
  or the European Commission".
- **No modification of values** → values are imported as published (no unit
  conversion, no re-aggregation, status flags preserved) — so the
  modification-disclosure clause does not apply.
- **Third-party content exception** → avoided: the four datasets are
  Eurostat's OWN official statistics (source `ESTAT`), not third-party
  embedded content.
- **Non-EU/EFTA third-country exception** (commercial reuse prohibited for
  e.g. US/JP/CN aggregates) → avoided entirely by the **EU/EFTA-only geography
  allowlist** (`EUROSTAT_GEO_ALLOWLIST`).
- **Trade-data exceptions** (Liechtenstein/Switzerland/Austria trade data) →
  not applicable: the four datasets are LABOUR statistics
  (employment/unemployment/vacancy/labour-cost), not Comext trade data.

## Dataset ownership + existence (re-verified live 2026-07-15)
| Dataset | HTTP | Owner | Latest period | Published |
|---|---|---|---|---|
| `lfsi_emp_q` | 200 | ESTAT | 2026-Q1 | 2026-06-11 |
| `une_rt_m` | 200 | ESTAT | 2026-05 | 2026-07-02 |
| `ei_lmjv_q_r2` | 200 | ESTAT | 2025-Q4 | 2026-03-20 |
| `lc_lci_r2_q` | 200 | ESTAT | 2026-Q1 | 2026-06-16 |

## Conclusion
`legal_approval` gate is **legitimately GREEN**: Eurostat's own official
labour statistics, EU/EFTA scope only, commercial reuse authorised with
source acknowledgement, source acknowledged and traceable per observation,
no value modification, no third-party or excepted data. No material
reuse/attribution uncertainty remains.
