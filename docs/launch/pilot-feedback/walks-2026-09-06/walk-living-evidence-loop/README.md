# Walk — living evidence → profile → opportunity (Lane D, window 6)

Production build `ca96605b`, 2026-09-06 06:45–07:05 UTC. Bounded E2E identities only
(WORKER `e2e-worker2-…`, COMPANY `e2e-walker-…` = owner of "E2E Walker UAB").
Script: `walk-living-evidence-loop-prod.cjs` (run 1 = BEFORE + ACTION + AFTER without
confirm; run 2 = `PHASE=confirm`; run 3 = `PHASE=after`). Logs: `walk-run-*.log`.
Screenshots `01`–`08`. Every DB fact below is an `execute_sql` readback (the in-run
service-role mirror is denied table grants in production — logged, never trusted).

## The controlled action (natural product path only)

WORKER on `/lt/dashboard`: "Užpildyk darbo žurnalą" → work-log form → date, site
"Vilnius, gamybos cechas", context "E2E Walker UAB", notes
`Suvirinau metalo konstrukcijas pusautomačiu. LANE-D-mtpg9xuq` → Išsaugoti → Patvirtinti.
COMPANY on `/lt/dashboard/inbox/quick`: one tap "Patvirtinti įrašą ir įgūdžius (2)".

## BEFORE / AFTER

| Readback | BEFORE | AFTER entry (no confirm) | AFTER company confirm |
|---|---|---|---|
| `journal_entries` (worker2) | 1 | 2 (`fa0747b7`, hash chained to prev) | 2 |
| `worker_skills` (worker2) | **0 rows** | `welding-blueprint`, `structural-steel` · `source=work_journal` · `verified=false` · bin yellow | both `verified=true` · `source=manager_confirmed` · bin green · `verified_by`=company owner |
| `journal_entry_skills` | 0 | 2 links · `provenance='recognized'` | 2 |
| `journal_entry_confirmations` (entry) | — | 0 | 1 · `confirmer_role=owner` · `scope.action=confirm` · `skills_confirmed=[2 ids]` |
| `audit_logs` (entry) | — | 0 | 1 · `confirm_entry_and_verify_skills` · `skills_newly_verified=2` |
| Save outcome (chat) | — | "Pridėtas įgūdis: Metalo konstrukcijų montavimas / Suvirinimo brėžinių skaitymas" + CV papildytas + matching note | — |
| COMPANY candidates for own need "Suvirintojas" (`?result=candidates&demand=b0a48f65…`) | worker2 present: **PER MAŽAI DUOMENŲ · 0 % REIKALINGŲ ĮGŪDŽIŲ**, vadovo patvirtinti 0 | **STIPRUS ATITIKIMAS · 100 %**, vadovo patvirtinti 0 | **STIPRUS ATITIKIMAS · 100 %**, vadovo patvirtinti **1** |
| WORKER `/lt/dashboard/journal` card | chart empty, no provenance | (not re-read) | "Patvirtino E2E Walker UAB, 2026-09-06"; VADOVO PATVIRTINTI ĮGŪDŽIAI: both; chart "1 ĮRAŠAS" per skill |
| WORKER entry row | — | ✓ chips ×2, "Laukia žmogaus peržiūros" | "Peržiūrėta · Peržiūrėjo Savininkas" — but helper still "Dar neperžiūrėta." (fixed in branch) |

Worker board (`list_open_demand_for_workers`) cannot show this need: the RPC joins
`companies.verification_status = 'verified'` and E2E Walker UAB is unverified — by design.

## Rollback (execute_sql, committed)

Deleted: audit_logs 1, journal_entry_confirmations 1, journal_entry_skills 2,
journal_entry_metrics 4, journal_entries 1, worker_skills 2. Absolute totals
(before walk → before rollback → after): journal_entries 40 → 42 → 41,
journal_entry_metrics 129 → 136 → 132, journal_entry_skills 48 → 50 → 48,
journal_entry_confirmations 13 → 14 → 13, worker_skills 50 → 52 → 50, audit_logs 64 → 65 → 64,
skill_candidate_clarifications 7 → 7 → 7, pilot_events 2902 (count-only funnel rows, no worker id).
The +1 entry / +3 metrics remaining belong to another lane's worker `ec7107bc…`
("Užpildyk darbo žurnalą", 06:56 UTC), not this walk. Worker2 residue: identical to BEFORE.
