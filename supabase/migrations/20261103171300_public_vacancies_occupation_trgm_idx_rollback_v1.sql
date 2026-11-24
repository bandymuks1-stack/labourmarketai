-- @human-gate-approved — RED record of a production rollback, ALREADY APPLIED (ledger 20261103194208, 2026-11-03).
-- Rollback of public_vacancies_occupation_trgm_idx_v1 (2026-11-03). The index was dropped CONCURRENTLY
-- just before this record: under plpgsql generic plans the planner chose it for 1-2 character terms
-- (no trigrams), which took 16-26 s against a 3 s timeout. This statement is a no-op record.
drop index if exists public.public_vacancies_occupation_trgm_idx;
