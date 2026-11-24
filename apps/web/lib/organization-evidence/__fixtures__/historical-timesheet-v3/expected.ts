/**
 * FIXTURE v3 §4 — THE NUMBERS.
 *
 * `TARGET` is the design's end state (T1–T18) — what the fixture must show
 * once every PR of the plan has landed. It is written down now so a later PR
 * flips a `todo` into an assertion against the SAME figure, never a figure
 * chosen after the fact.
 *
 * `PR2` is what the shipped code produces TODAY, on the PR-2 pipeline. Every
 * figure that differs from its target names the PR that moves it. A PR that
 * changes one of these must change it here, on purpose, in the same commit.
 *
 * Spec: docs/design/historical-timesheet-fixture-v3.md §4, §5.
 */

export const TARGET = {
  T1: {
    upload1Staged: 10,
    upload2Staged: 26,
    upload2Ignored: 10,
    upload3Staged: 0,
    stagedTotal: 36,
    notStagedPositions: [29],
    sessions: 5,
    importSourceDocuments: 4,
  },
  T2: {
    S1: { staged: 36, committed: 32, skipped: 2, needsReview: 2, records: 32 },
    S2: { staged: 2, committed: 0, skipped: 2, needsReview: 0, records: 0 },
    S3: { staged: 5, committed: 5, skipped: 0, needsReview: 0, records: 5 },
    S4: { staged: 1, committed: 1, skipped: 0, needsReview: 0, records: 1 },
    S5: { staged: 2, committed: 1, skipped: 0, needsReview: 1, records: 1 },
    totalRecords: 39,
    recordsWithProject: 38,
  },
  T3: { projects: 3, keyedCustomers: 3, steps: 6 },
  T5: { verifiedAtEnd: 37, verifiedBeforeStep7: 36 },
  T8: { parties: 38 },
  T11: {
    R1: { recordEvents: 5, sessionEvents: 1, activeAfter: 34, verifiedAfter: 32 },
    R2: { recordEvents: 0, sessionEvents: 0, outcome: "already_withdrawn" },
    R3: { recordEvents: 5, sessionEvents: 1, activeAfter: 39, verifiedAfter: 37 },
    R4: { recordEvents: 0, sessionEvents: 1, activeAfter: 39 },
    R5: { recordEvents: 1, sessionEvents: 1, activeAfter: 38, verifiedAfter: 36 },
  },
} as const;

export const PR2 = {
  T1: {
    upload1Staged: 10,
    /** PR-5: 26 — the two week-total rows parse as periods. */
    upload2Staged: 24,
    upload2Ignored: 10,
    upload3Staged: 0,
    /** PR-5: 36. */
    stagedTotal: 34,
    /** PR-5: [29] — only the undated row stays out. */
    notStagedPositions: [29, 30, 31],
    /** PR-5: 5 — S3 has no date column until periods parse. */
    sessions: 4,
  },
  S1: {
    /** PR-5: 32 — row 35 is held (`ambiguous_customer`) and the two week
     *  totals are subtotals, not records. */
    records: 33,
    needsReview: 1,
    /** Person Bravo (by EMP-002) and Person Charlie; never "P. Delta". */
    createdPeople: 2,
  },
  S2: {
    /** PR-5: 0 — today a conflicting figure commits as a second record;
     *  PR-5 makes it a question that blocks its row (T10). */
    records: 1,
  },
  S4: { records: 1 },
  S5: {
    /** PR-5: 1 — row 1 (a new customer at a new object) is held for the
     *  owner/admin (`project_needs_owner_admin`). */
    records: 2,
  },
  /** S1 33 + S2 1 + S4 1 + S5 2. PR-5: 39 with S3. */
  totalRecords: 37,
  /** Every live record attested once, in its supplier role. */
  attested: 36,
} as const;
