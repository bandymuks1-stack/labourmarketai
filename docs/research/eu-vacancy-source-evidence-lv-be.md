# EU vacancy source evidence — Latvia + Belgium/Wallonia (v1)

Date: 2026-08-10. Status: EVIDENCE ONLY — nothing here is activated; both
sources would follow the same two-gate path as Sweden (governance row +
env switch), each behind its own owner decision.

## Latvia — NVA (Nodarbinātības valsts aģentūra)

| Fact | Evidence |
|---|---|
| Country | LV |
| Official operator | Nodarbinātības valsts aģentūra (State Employment Agency) — the national PES |
| Endpoint/feed | Latvia open data portal dataset "Vakances": https://data.gov.lv/dati/lv/dataset/vakances (CKAN; CSV resource "VakancesCSV" + CKAN Data API on the resource) |
| Licence | **CC0-1.0** (stated on the dataset page) |
| Redistribution / storage / attribution | CC0 ⇒ redistribution and storage permitted without conditions; attribution not legally required — our product policy still renders source attribution (same rule as Sweden) |
| Authentication / price | None / €0 |
| Rate limits | None published; CKAN datastore API default paging applies |
| Pagination | CKAN datastore_search offset/limit |
| Freshness | "katru dienu" (daily) per the dataset page |
| Estimated volume | Thousands (current NVA vacancies country-wide); exact count measurable via one datastore_search total |
| Contact | ithelp@nva.gov.lv |
| legalStatus | confirmed-by-published-licence (CC0 stated on the portal; no provider Q&A needed for CC0) |
| technicalStatus | NOT built — needs a provider descriptor + parser (CSV/CKAN JSON shape differs from JobTech) |
| activationStatus | NOT requested — owner decision pending after a build |

## Belgium (Wallonia) — Le Forem

| Fact | Evidence |
|---|---|
| Country | BE (Wallonia region; some VDAB-sourced offers in French translation) |
| Official operator | Le Forem — Walloon public employment and training service |
| Endpoint/feed | Opendatasoft portal: dataset `offres-d-emploi-forem` at https://leforem-digitalwallonia.opendatasoft.com (Explore API v2.1; also mirrored on odwb.be) |
| Licence | **CC BY-SA 4.0** (dataset metadata, fetched 2026-08-10) |
| Redistribution / storage / attribution | Allowed WITH attribution; **ShareAlike** — adaptations of the dataset must carry the same licence. Displaying rows with attribution is fine; the ShareAlike implication for our stored/derived copies needs an OWNER note before activation |
| Authentication / price | None for open data / €0 (Forem also offers free partner APIs; not needed) |
| Rate limits | Opendatasoft public API default quotas |
| Pagination | Explore API v2.1 offset/limit |
| Freshness | Same-day (`data_processed` timestamp matched the fetch date) |
| Measured volume | **25,535 records** (2026-08-10) |
| Fields | numerooffreforem, titreoffre, lieux (localité/région/NUTS/geo), typecontrat, nomemployeur, regimetravail, nombrepostes, niveauxetudes (ISCED), langues (ISO2), experiencerequise, permisdeconduire, secteurs (NACE), source, referenceexterne, **url**, datedebutdiffusion, datefindiffusion, metier |
| Contact | opendata-offres@forem.be |
| legalStatus | licence published (CC BY-SA 4.0) — legally usable with attribution; ShareAlike note is the one open question for the owner |
| technicalStatus | NOT built |
| activationStatus | NOT requested |

## Priority recommendation

1. **Latvia NVA** first: CC0 (identical legal class to Sweden), daily, CKAN —
   smallest legal surface, near-neighbour market already in ACTIVE_MARKETS.
2. **Le Forem** second: excellent volume and field richness, but CC BY-SA
   needs an explicit owner licence note before storage/display.

No scraping is involved in either: both are official open-data endpoints.
