/**
 * OPERATOR-RUN EXIT CODE — the failure-surface contract.
 *
 * The load-bearing claim: a session that did not complete its work exits
 * non-zero, so the sweden-supply-cadence check goes red. Regression under
 * test: run 31826082813 (2026-08-14) ended `runner_exception` with
 * `vacancy_persist_insert_failed:57014` yet showed a green check, and the
 * untouched cursor left `consecutive_failures` at 0 — no surface anywhere.
 */
import { describe, expect, it } from "vitest";

import { operatorRunExitCode } from "./operator-run-exit";

describe("operatorRunExitCode", () => {
  it("exits 0 for the two completed outcomes", () => {
    expect(operatorRunExitCode("imported")).toBe(0);
    expect(operatorRunExitCode("dry_run_complete")).toBe(0);
  });

  it("exits 1 for runner_exception — the cursor is untouched on this path, so the exit code is the only failure surface", () => {
    expect(operatorRunExitCode("runner_exception")).toBe(1);
  });

  it("exits 1 for fetch_failed", () => {
    expect(operatorRunExitCode("fetch_failed")).toBe(1);
  });

  it("exits 1 for blocked — the workflow's configuration gate already no-ops unconfigured runs, so blocked in CI means real misconfiguration", () => {
    expect(operatorRunExitCode("blocked")).toBe(1);
  });
});
