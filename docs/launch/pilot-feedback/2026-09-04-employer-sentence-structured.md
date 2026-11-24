# Employer sentence → structured demand (2026-09-04)

> Owner Master Execution Contract §9: "I need 12 scaffolders in Rotterdam
> from 5 October" must progressively become canonical structured demand.
> Verification used the bounded E2E company identity on production; the
> E2E row was closed afterwards (labelled residue, off the worker board).

## Measured before (#1468)

| Fact in the sentence | What the intake did |
|---|---|
| "pastolininkų" (scaffolders) | no work type → the sentence classified **unknown**; generic fallback |
| "Roterdame" | collapsed into "Nyderlandai" (country only) |
| "nuo spalio 5" | not a date — the window knew only next/this week, next month |
| 12 | read, but the recognised slug and market never reached the canonical columns (only the free-text label was stored) |

## The fix (#1468, GREEN, prod `c448cff7`)

Five construction trades in the taxonomy + structurer; the trades reach
`need-workers` with a seek verb; `from_date` in six locales + ISO (next
occurrence, never the past, honest null); `city` beside `country`; the
inline form prefilled with the trade, "Rotterdam, Nyderlandai", 12 and the
start day; `workType` / `country` ride the form state; `startDate` →
`structured_v2.time.start_earliest`.

## Production verification (E2E company identity, 390 px, `c448cff7`)

| Step | Observed |
|---|---|
| typed "Reikia 12 pastolininkų Roterdame nuo spalio 5." | the ONE demand form opened, prefilled: **Pastolininkas · Rotterdam, Nyderlandai · 12 · 2026-10-05 · Lankstu** (screenshot `walk-employer/30-prefilled-form.png`) |
| Tęsti → Išsaugoti | "done" state in 17 s from the sentence |
| DB row `bda1abdb…` | `title=Pastolininkas`, `role_or_work_type=scaffolder`, `country=NL`, `team_size=12`, `start_period=flexible`, `payload.location="Rotterdam, Nyderlandai"`, `payload.structured_v2.time.start_earliest="2026-10-05"`, `status=submitted` → closed afterwards (E2E residue) |

Every fact the sentence carried is now canonical state the matching engine
and the worker board can read. Not yet: an absolute END date, "for three
weeks" durations, and the site as a first-class object (a project) — the
form still holds the site as a location label.

## Matching → people/team, in the chat (prod `f49cc972`, read-only walk)

`walk-candidates-prod.cjs`, E2E Walker UAB, 12.1 s: "parodyk kandidatus" → "Štai jūsų
poreikiai ir žmonės už jų." → the panel opens the company's ONE open demand directly
("Suvirintojas · PATEIKTAS" with "Patvirtinti reikalavimus" / "Uždaryti poreikį") and
lists 19 anonymised candidate cards ("Kandidatas 7F3349 — silpnas atitikimas · 0 %
reikalingų įgūdžių · Naujas", … "Kandidatas 0DBD5E … · Pasiūlymas" — the worker the
agency proposed). The contact / shortlist / booking controls live on the card (the
canonical `company.contact-worker` / `company.shortlist-candidate` /
`company.propose-booking` dispatch); not clicked tonight to avoid booking residue —
that chain was proven on 2026-09-01 (#857 / G-04).
