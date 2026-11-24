/**
 * OPERATOR-RUN EXIT CODE — the one mapping from a session's terminal status to
 * the process exit code of `scripts/vacancy-operator-run.ts`.
 *
 * Why this exists: the runner never throws — every failure is a classified
 * result — so the script used to exit 0 for ALL outcomes and the
 * sweden-supply-cadence workflow showed a green check on failed sessions
 * (observed 2026-08-14, run 31826082813: status `runner_exception`,
 * `vacancy_persist_insert_failed:57014`, green check). Worse, a
 * `runner_exception` leaves the cursor row untouched, so
 * `consecutive_failures` stays 0 — the exit code is the ONLY failure surface
 * for that path.
 *
 * The mapping:
 *   - `imported` / `dry_run_complete` — the session did its job → 0;
 *   - `fetch_failed`     — the session failed; the cursor failure streak also
 *                          records it, but the run itself must be red → 1;
 *   - `runner_exception` — something threw; NO other surface exists → 1;
 *   - `blocked`          — deliberate: in CI the workflow's configuration gate
 *                          already no-ops unconfigured runs, so a session that
 *                          still reports blocked means the environment is
 *                          genuinely misconfigured (e.g. provider env flag
 *                          lost) — that must be red, not green. For a human
 *                          operator the non-zero exit is equally honest → 1.
 *
 * The JSON accounting document is always printed BEFORE the exit code is
 * applied — a red run still carries its full accounting artifact.
 */
import type { VacancyIngestionSessionResultV1 } from "./vacancy-ingestion";

export function operatorRunExitCode(
  status: VacancyIngestionSessionResultV1["status"],
): 0 | 1 {
  return status === "imported" || status === "dry_run_complete" ? 0 : 1;
}
