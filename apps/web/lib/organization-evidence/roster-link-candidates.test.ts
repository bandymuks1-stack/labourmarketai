import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { mergeRosterLinkCandidates } = await import("./roster-link-candidates");

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

/**
 * Roster-link candidates mirror the DATABASE's rule — active engagement or
 * membership plus a worker row — never a name (B1 roster walk, 2026-09-17).
 */
describe("roster-link candidates", () => {
  it("merges the legacy list with the engagement list, one entry per worker, legacy name wins", () => {
    const legacy = [{ workerId: "w1", profileId: "p1", name: "Legacy One" }];
    const engaged = [
      { workerId: "w1", profileId: "p1", name: "Engaged One" },
      { workerId: "w2", profileId: "p2", name: "Bea" },
    ];
    expect(mergeRosterLinkCandidates(legacy, engaged)).toEqual([
      { workerId: "w2", profileId: "p2", name: "Bea" },
      { workerId: "w1", profileId: "p1", name: "Legacy One" },
    ]);
    expect(mergeRosterLinkCandidates()).toEqual([]);
  });

  it("the engagement reader is relationship-based: active engagement_contexts + workers, no name matching, empty on failure", () => {
    // code only — the docblock is allowed to SAY "name similarity plays no part"
    const src = read("lib/organization-evidence/roster-link-candidates.ts").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    expect(src).toContain('.from("engagement_contexts")');
    expect(src).toContain('.eq("status", "active")');
    expect(src).toContain('.from("workers")');
    expect(src).not.toMatch(/ilike|similarity|levenshtein|normalizedName|person_label/);
    expect(src).not.toMatch(/createAdminClient|service_role/);
    expect(src).toMatch(/if \(ec\.error[^\n]*return \[\];/);
    expect(src).toMatch(/if \(w\.error[^\n]*return \[\];/);
  });

  it("the people page offers the merged list — the DB rule, not company_workers alone", () => {
    const page = read("app/[locale]/dashboard/company/people/page.tsx");
    expect(page).toContain("listRosterLinkCandidatesFromEngagements(");
    expect(page).toMatch(/linkCandidates=\{mergeRosterLinkCandidates\(/);
  });
});
