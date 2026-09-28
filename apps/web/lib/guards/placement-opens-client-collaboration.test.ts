import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Owner decision 2026-09-28 (Option A, relationship semantics preserved):
 * a worker an AGENCY placed with a client can record work against that client
 * once the client assigns them — as a `collaborator`, never inferred as the
 * client's `employee`, and never because a booking was merely proposed.
 * The agency's own relationship stays; an existing relationship wins;
 * re-assigning adds nothing. A direct booking is not typed from its channel.
 */
const MIG = readFileSync(
  join(__dirname, "..", "..", "..", "..", "supabase", "migrations", "20260928220000_placement_opens_client_collaboration_v1.sql"),
  "utf8",
);
const read = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8");

describe("an agency placement opens a client collaboration — at assignment, once", () => {
  const fn = MIG.slice(MIG.indexOf("create or replace function public.assign_worker_to_project"));

  it("only for a worker who came through an ACCEPTED agency offer whose booking the worker ACCEPTED", () => {
    expect(fn).toMatch(/from public\.agency_candidate_offers ao\s+join public\.booking_requests b on b\.id = ao\.booking_id/);
    expect(fn).toMatch(/ao\.client_company_id = v_company\s+and ao\.status = 'accepted'\s+and b\.status = 'accepted'/);
  });

  it("reuses ANY active relationship with that organization; otherwise creates collaborator — never employee", () => {
    expect(fn).toMatch(/where profile_id = w_pid and organization_id = v_org and status = 'active'/);
    expect(fn).toMatch(/if v_ctx is null then/);
    expect(fn).toMatch(/'collaborator', 'active', false/);
    expect(fn).not.toMatch(/'employee', 'active'/);
  });

  it("collaborators can carry journal review; the panel offers the toggle by that same data rule", () => {
    expect(MIG).toMatch(/update public\.relationship_types set journal_reviewable = true where slug = 'collaborator';/);
    expect(read("lib/operations/org-members.ts")).toMatch(/\.eq\("journal_reviewable", true\)/);
    expect(read("components/app/org-members-panel.tsx")).toMatch(/\{m\.reviewable && \(/);
    expect(read("components/app/org-members-panel.tsx")).not.toMatch(/m\.role === "employee" && \(/);
  });
});
