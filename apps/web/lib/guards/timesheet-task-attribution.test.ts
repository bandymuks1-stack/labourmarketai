import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildTimesheetCsv,
  deriveTimesheetTotals,
  parseTimesheetSnapshot,
  TIMESHEET_CSV_COLUMNS,
  type TimesheetLine,
} from "@/lib/timesheets/timesheets-model";

/**
 * GUARD — task attribution of canonical work-time (field-work audit, step A).
 *
 * 20260818150000 made `journal_entry_metrics` the canonical hours truth after
 * three computations disagreed on a real production entry (0 h / 5 h / 9 h),
 * and wrote the invariant that double counting must be STRUCTURALLY
 * impossible. This slice attributes those hours to the task they evidence.
 *
 * The danger is precise and worth naming: a journal entry may carry up to 20
 * live task links, so a naive join multiplies every hours line by the number
 * of linked tasks. This guard exists to keep that from ever being introduced.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const MIGRATION = join(
  REPO,
  "supabase/migrations/20260819220000_timesheet_task_attribution_v1.sql",
);
const ROLLBACK = join(
  REPO,
  "supabase/rollbacks/20260819220000_timesheet_task_attribution_v1.down.sql",
);

const sql = readFileSync(MIGRATION, "utf8");
const rollback = readFileSync(ROLLBACK, "utf8");
/** Executable SQL only — prose about what it does NOT do must never satisfy
 *  or break an assertion about what it DOES. */
const code = sql
  .split(/\r?\n/)
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");
const rollbackCode = rollback
  .split(/\r?\n/)
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

function line(p: Partial<TimesheetLine>): TimesheetLine {
  return {
    lineKey: "e#f1",
    journalEntryId: "e",
    fragmentIndex: 1,
    day: "2026-08-10",
    title: "t",
    evidencePhrase: null,
    workTypeKey: null,
    value: 8,
    unit: "hours",
    derivedFrom: "fragment_time",
    metricSource: "worker_input",
    projectId: null,
    projectTitle: null,
    taskId: null,
    taskTitle: null,
    taskLinkCount: 0,
    ...p,
  };
}

describe("attribution never changes an hour", () => {
  it("totals ignore attribution entirely", () => {
    const unattributed = [line({ value: 8 }), line({ value: 4 })];
    const attributed = [
      line({ value: 8, taskId: "t1", taskTitle: "A", taskLinkCount: 1 }),
      line({ value: 4, taskId: "t2", taskTitle: "B", taskLinkCount: 1 }),
    ];
    expect(deriveTimesheetTotals(attributed)).toEqual(
      deriveTimesheetTotals(unattributed),
    );
    expect(deriveTimesheetTotals(attributed).totalHours).toBe(12);
  });

  it("an entry linked to many tasks contributes its hours ONCE", () => {
    // The shape a fan-out bug would produce is N lines for one entry. The SQL
    // prevents it; this pins the arithmetic side of the same promise.
    const many = [line({ value: 8, taskId: null, taskLinkCount: 5 })];
    expect(deriveTimesheetTotals(many).totalHours).toBe(8);
    expect(deriveTimesheetTotals(many).lineCount).toBe(1);
  });
});

describe("the parser is honest about missing attribution", () => {
  it("a snapshot frozen BEFORE this slice still parses, unattributed", () => {
    const legacy = {
      lines: [
        {
          lineKey: "e#entry",
          journalEntryId: "e",
          day: "2026-08-10",
          title: "t",
          value: 8,
          unit: "hours",
          derivedFrom: "entry_quantity",
        },
      ],
    };
    const snap = parseTimesheetSnapshot(legacy);
    expect(snap.lines).toHaveLength(1);
    expect(snap.lines[0].taskId).toBeNull();
    expect(snap.lines[0].taskTitle).toBeNull();
    expect(snap.lines[0].taskLinkCount).toBe(0);
    // And the hours it froze are untouched.
    expect(snap.totals.totalHours).toBe(8);
  });

  it("a non-integer or hostile taskLinkCount degrades to 0, never NaN", () => {
    for (const bad of ["3", 2.5, null, {}, undefined]) {
      const snap = parseTimesheetSnapshot({
        lines: [
          {
            lineKey: "k",
            journalEntryId: "e",
            day: "2026-08-10",
            title: "t",
            value: 1,
            unit: "hours",
            taskLinkCount: bad,
          },
        ],
      });
      expect(snap.lines[0].taskLinkCount).toBe(0);
    }
  });
});

describe("the export carries attribution without inventing it", () => {
  it("has a task column, and leaves it empty when unattributed", () => {
    expect(TIMESHEET_CSV_COLUMNS).toContain("task");
    const csv = buildTimesheetCsv({
      id: "s1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      status: "draft",
      submittedAt: null,
      decidedAt: null,
      snapshot: {
        computedAt: null,
        source: "journal_entry_metrics",
        lines: [
          line({ taskTitle: "Install cable run", taskId: "t1", taskLinkCount: 1 }),
          line({ lineKey: "e#f2", taskTitle: null, taskLinkCount: 3 }),
        ],
        conflicts: [],
        totals: { totalHours: 16, totalDayUnits: 0, lineCount: 2 },
      },
    } as never);
    expect(csv).toContain("Install cable run");
    // The ambiguous line exports an EMPTY task cell — not a joined list, not
    // the first of the three, not a guess.
    const dataRows = csv.split("\n").slice(1).filter(Boolean);
    expect(dataRows[1]).toContain(",,");
    expect(dataRows[1]).not.toContain("Install cable run");
  });
});

describe("the migration keeps the no-double-count invariant", () => {
  it("the task link CTE is GROUPED, so the join cannot fan a line out", () => {
    expect(code).toMatch(/task_link as \(/);
    expect(code).toMatch(/group by jet\.entry_id/);
    // Exactly-one rule, expressed as a count — not a LIMIT 1 pick.
    expect(code).toMatch(/case when count\(\*\) = 1 then min\(jet\.task_id::text\)::uuid end/);
    // Scoped to the CTE itself: the function legitimately uses `limit 1`
    // elsewhere (the work_date lateral), so a whole-file regex would be a
    // false positive. What must never appear is a LIMIT inside task_link —
    // that would silently PICK one of several links instead of declining.
    const cte = code.slice(
      code.indexOf("task_link as ("),
      code.indexOf("frag as ("),
    );
    expect(cte).toContain("group by jet.entry_id");
    expect(cte).not.toMatch(/\blimit\b/i);
    expect(cte).not.toMatch(/\border by\b/i);
  });

  it("only LIVE links are attributed — a withdrawal is not a link", () => {
    expect(code).toMatch(/jet\.unlinked_at is null/);
  });

  it("the arithmetic is untouched: rule A still excludes rule B", () => {
    expect(code).toContain(
      "where not exists (select 1 from frag f where f.entry_id = e.id)",
    );
    // Units unchanged: minutes/60, days never folded into hours.
    expect(code).toContain("when 'minutes' then round(r.value / 60.0, 2)");
    expect(code).toContain("case when r.unit = 'days' then r.value else 0 end");
  });

  it("emits the three attribution fields and nothing that implies a share", () => {
    for (const k of ["'taskId'", "'taskTitle'", "'taskLinkCount'"]) {
      expect(code).toContain(k);
    }
    // Splitting hours across tasks would be fabrication — no arithmetic on
    // the link count may appear.
    expect(code).not.toMatch(/hours\s*\/\s*(link_count|count\()/i);
    expect(code).not.toMatch(/value\s*\/\s*link_count/i);
  });

  it("keeps the exact signature, so grants and the SECDEF allowlist stand", () => {
    expect(code).toMatch(
      /create or replace function public\.timesheet_compute_lines_v1\(\s*p_worker_id\s+uuid,\s*p_organization_id\s+uuid,\s*p_start\s+date,\s*p_end\s+date\s*\)/,
    );
    expect(code).toContain(
      "revoke all on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) from authenticated;",
    );
  });

  it("creates or drops NOTHING — one function body, no DDL, no DML", () => {
    expect(code).not.toMatch(/create\s+table|drop\s+table|alter\s+table/i);
    expect(code).not.toMatch(/create\s+policy|alter\s+policy|drop\s+policy/i);
    expect(code).not.toMatch(/\b(insert\s+into|update\s+public|delete\s+from)\b/i);
  });

  it("does not edit the applied 20260818150000 file — it supersedes it", () => {
    const applied = readFileSync(
      join(REPO, "supabase/migrations/20260818150000_journal_canonical_work_time_v1.sql"),
      "utf8",
    );
    expect(applied).not.toContain("taskId");
    expect(applied).not.toContain("task_link");
  });

  it("the rollback restores the previous body with no attribution left", () => {
    expect(rollbackCode).toContain(
      "create or replace function public.timesheet_compute_lines_v1(",
    );
    expect(rollbackCode).not.toContain("taskId");
    expect(rollbackCode).not.toContain("task_link");
    // It must not need a refusal guard: no data is stored by the forward
    // migration, so there is nothing a rollback could destroy.
    expect(rollbackCode).not.toMatch(/raise\s+exception/i);
  });
});
