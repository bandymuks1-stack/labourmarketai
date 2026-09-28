import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Owner 2026-09-28 "COMPLETE THE PLACEMENT LIFECYCLE": ending an assignment
 * ends that assignment; only when it was the placed worker's LAST active
 * assignment with the client does the relationship THE PLACEMENT OPENED close
 * — truthfully (ended, never deleted), with the placement's booking
 * engagement. A pre-existing relationship is never closed here. History
 * (entries, project, confirmations, skills) references the context and stays.
 */
const MIG = readFileSync(
  join(__dirname, "..", "..", "..", "..", "supabase", "migrations", "20260928230000_placement_end_closes_client_collaboration_v1.sql"),
  "utf8",
);
const fn = MIG.slice(MIG.indexOf("create or replace function public.end_worker_project_assignment"));

describe("placement end closes the client collaboration — only the last one, only the one it opened", () => {
  it("returns early while another active assignment on the same organization remains", () => {
    expect(fn).toMatch(/where pa\.worker_id = w_id\s+and pa\.status = 'active'/);
    expect(fn.indexOf("pa.status = 'active'")).toBeLessThan(fn.indexOf("update public.engagement_contexts"));
  });
  it("closes only a collaborator context the placement opened (its audit row)", () => {
    expect(fn).toMatch(/ec\.relationship_slug = 'collaborator'/);
    expect(fn).toMatch(/al\.action = 'placement_collaboration_opened'/);
  });
  it("ends — never deletes — and records why", () => {
    expect(fn).toMatch(/set status\s+= 'ended'/);
    expect(fn).toMatch(/lifecycle_stage\s+= 'ended'/);
    expect(fn).not.toMatch(/delete from/i);
    expect(fn).toMatch(/'placement_collaboration_ended'/);
  });
  it("the placement's booking engagement ends with it — only one sourced from an accepted agency offer", () => {
    expect(fn).toMatch(/update public\.company_worker_engagements ce\s+set status = 'ended'/);
    expect(fn).toMatch(/ao\.booking_id = ce\.source_booking_id\s+and ao\.status = 'accepted'/);
  });
});
