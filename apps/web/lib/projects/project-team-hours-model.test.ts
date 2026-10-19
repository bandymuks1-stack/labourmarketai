import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { countedOnce } from "@/lib/journal/counted-once";
import { deriveWindowWorkTime } from "@/lib/journal/journal-window-report";
import { teamHourRowsToWindowRows, type TeamHourRow } from "@/lib/projects/project-team-hours-model";

/**
 * B2B-9 — the buyer sees the hours a brigade worked on the buyer's project.
 * The opaque rows of `project_team_journal_hour_rows_v1` must go through the
 * SAME work-time rule as every other hour: no second hour model.
 */
const TODAY = "2026-10-19";

function teamRow(over: Partial<TeamHourRow> = {}): TeamHourRow {
  return {
    entry_key: "k1",
    correction_of_key: null,
    created_at: "2026-10-19T19:41:10Z",
    context_key: "c1",
    metrics: [
      { metric_slug: "work_date", value_text: "2026-10-19", value_numeric: null, unit_slug: null, source: "worker_input" },
      { metric_slug: "fragment_time", value_text: "1", value_numeric: 6, unit_slug: "hours", source: "ai_extracted" },
    ],
    confirmations: [],
    ...over,
  };
}

const work = (rows: readonly TeamHourRow[]) =>
  deriveWindowWorkTime(countedOnce(teamHourRowsToWindowRows(rows)), TODAY);

describe("brigade hours on the buyer's project", () => {
  it("a member's 6 h reach the buyer's figure through the one work-time rule", () => {
    expect(work([teamRow()]).hours).toBe(6);
  });

  it("a review by someone else confirms them; the worker's own decision never does", () => {
    const approved = { confirmation_scope: { decision: "approved" }, created_at: "2026-10-19T20:00:00Z", confirmer_role: "manager" };
    expect(work([teamRow({ confirmations: [{ ...approved, by_subject: false }] })]).confirmedHours).toBe(6);
    expect(work([teamRow({ confirmations: [{ ...approved, by_subject: true }] })]).confirmedHours).toBe(0);
  });

  it("a correction chain counts once, keyed on the opaque keys", () => {
    const original = teamRow({ entry_key: "orig" });
    const correction = teamRow({ entry_key: "fix", correction_of_key: "orig" });
    expect(work([original, correction]).hours).toBe(6);
  });

  it("the mapped rows carry no worker, name or profile", () => {
    const [mapped] = teamHourRowsToWindowRows([teamRow()]);
    expect(mapped.worker_id).toBeNull();
    expect(mapped.workers).toBeNull();
    expect(mapped.subject?.profile_id).toBe("subject");
  });
});

describe("the database door is hours-only and project-bound", () => {
  // The CURRENT body is the latest migration that replaces the function (v2).
  const sql = readFileSync(
    join(__dirname, "..", "..", "..", "..", "supabase", "migrations", "20261019220000_project_team_journal_hours_v2.sql"),
    "utf8",
  );
  it("review notes never leave: the scope is rebuilt from decision / action / authority.basis", () => {
    expect(sql).not.toMatch(/'confirmation_scope', c\.confirmation_scope,/);
    expect(sql).toMatch(/jsonb_strip_nulls\(jsonb_build_object\(/);
    expect(sql).toMatch(/'decision', case when jsonb_typeof/);
    expect(sql).not.toMatch(/'note'/);
  });
  it("a late correction stays in: eligibility is anchored to the chain root", () => {
    expect(sql).toMatch(/with recursive up as/);
    expect(sql).toMatch(/ta\.assigned_at <= a\.anchor_at/);
  });
  it("an admin gets nothing here (they already read everything through RLS)", () => {
    expect(sql).toMatch(/or public\.is_admin\(\)/);
  });
  it("only a manager of THIS project gets rows", () => {
    expect(sql).toMatch(/not public\.can_manage_project\(p_project_id\)/);
  });
  it("only legitimately assigned team work: a team context, inside the assignment window", () => {
    expect(sql).toMatch(/organization_type = 'team'/);
    expect(sql).toMatch(/ta\.ended_at is null or ta\.ended_at >= a\.anchor_at/);
  });
  it("disjoint from what the caller already reads (never counted twice)", () => {
    expect(sql).toMatch(/and not public\.owns_worker\(je\.worker_id\)/);
    expect(sql).toMatch(/and not public\.manages_organization\(ec\.organization_id\)/);
  });
  it("never returns the entry text, real ids or free metric text", () => {
    expect(sql).not.toMatch(/original_text/);
    expect(sql).not.toMatch(/'value_text', m\.value_text/);
    expect(sql).toMatch(/md5\('je:' \|\| je\.id::text\)/);
  });
  it("no RLS policy is touched", () => {
    expect(sql).not.toMatch(/create policy|alter policy|drop policy/i);
  });
});
