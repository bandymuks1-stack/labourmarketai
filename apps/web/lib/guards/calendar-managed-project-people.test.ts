import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(join(__dirname, "..", "planning", "planning.ts"), "utf8");

describe("the calendar names who is on a managed project (same calendar, more for the manager)", () => {
  it("reads only ACTIVE, un-ended assignments under the caller's own session", () => {
    const fn = SRC.slice(SRC.indexOf("async function readActiveAssigneeNames"), SRC.indexOf("async function readProjectItems"));
    expect(fn).toMatch(/from\("project_worker_assignments"\)/);
    expect(fn).toMatch(/\.eq\("status", "active"\)/);
    expect(fn).toMatch(/\.is\("ended_at", null\)/);
    expect(fn).not.toMatch(/service_role|createAdminClient/);
  });

  it("takes names from workers.display_name — the same source the roster surfaces use", () => {
    expect(SRC).toMatch(/from\("workers"\)[\s\S]{0,80}display_name/);
  });

  it("a failed read names nobody and never removes the dated project", () => {
    const fn = SRC.slice(SRC.indexOf("async function readActiveAssigneeNames"), SRC.indexOf("async function readProjectItems"));
    expect(fn).toMatch(/catch/);
    expect(SRC).toMatch(/counterpart: assignees\.get\(p\.id\) \?\? null/);
  });
});
