# Train E3 — historical timesheet (XLSX) import, production proof (2026-09-02)

Bounded company `E2E Walker UAB` (company `b16e3a86…`, organization `a996113c…`, owner = walker identity), one
rostered worker (`e2e-worker2-…`, invited through `invite_company_worker` and accepted through
`accept_company_worker_invitation` on the worker's own session) and one work object (`Objektas A`,
`create_work_object_v1`). A synthetic **monthly-grid** sheet in the owner's real-world shape (sheet
"Rugsėjis 2026", title cell "Darbo laiko apskaita 2026-09", header `Darbuotojas | Objektas | 1..30 | Iš viso`,
one row: worker, object, hours on days 1, 2, 3, 4, 7 = 8, 8, 6, 8, 8; total 38) was uploaded through the REAL
UI (`/lt/dashboard/hours?import=1`, headless Chromium, the walker's session injected, workspace pointer =
the organization).

| Step | Result |
|---|---|
| upload → "Perskaityti" | preview: **5 rows** read from sheet "Rugsėjis 2026"; month detected from the title cell (no manual month control shown); 0 skipped cells; worker + object resolved by exact label; "Nothing is saved until you confirm" — `e3-import-preview-1440.png` |
| confirm ("Patvirtinti pasirinktas eilutes (5)") | receipt: **"Atlikta — įrašyta įrašų: 5. Jie jau yra darbo valandose."** — `e3-import-receipt-1440.png` |
| database after confirm | `work_hour_allocations` for the worker: 5 rows, dates 09-01/02/03/04/07, `hours_numeric` 8/8/6/8/8 (= 38 h), `source = import`, `status = recorded`, object set, `entered_by` set (the manager) |
| same file again → preview | 5 rows again, **duplicates block before confirm**: "Identiški įrašai jau egzistuoja 5 eilutėms (tas pats darbuotojas, data, objektas ir valandos). Norint juos įrašyti dar kartą, reikia patvirtinimo žemiau." |
| same file again → confirm | **no receipt, no new rows** (still 5) — the write is refused until the person explicitly acknowledges the duplicates — `e3-import-duplicates-1440.png` |

Verdict: **E3 pipeline PRODUCTION_PROVEN on a synthetic file** — upload → dry run (preview) → schema detection
(monthly grid, month from the sheet) → mapping (labels → roster worker / object) → validation → duplicate
detection → idempotency (re-import refused without explicit acknowledgement) → user confirmation → canonical
allocation rows with provenance (`source = import`, `entered_by`) → receipt. Not yet proven: the owner's REAL
multi-year files (other layouts, split cells "8+2", long format, unknown labels → the human mapping step),
rollback of an import session, and the export in the company's own format. Those need the owner's file
(register: OWNER input, not a gate on code).

UI finding for Train I (recorded, not fixed here): on `/dashboard/hours` the primary "Išsaugoti" button renders
with no visible background/border in its disabled state (white on white) — `e3-import-hours-page-1440.png`.

Residue (gate G-9): company `E2E Walker UAB` (+ a second empty organization created by `add_role`), work object
`Objektas A`, roster link, 5 allocation rows, identities `e2e-walker-202609021438`, `e2e-worker2-202609021527`,
`e2e-outsider-202609021532` — TEST, never metrics.
