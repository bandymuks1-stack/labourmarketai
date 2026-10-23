import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A MANAGER RECORDS HOURS ONLY FOR THEIR OWN CREW, ON THEIR OWN SITES
 * (audit 2026-10-20). The insert policy checks only manages_organization, so
 * a forged worker id put hours on an unrelated person's record. The manual
 * action now checks the same crew and site lists the page offers and the
 * import already checked.
 */
const src = readFileSync(resolve(__dirname, "..", "work-hours", "allocations-actions.ts"), "utf8");

describe("manual hours are recorded only for this company's crew and active sites", () => {
  const fn = src.slice(src.indexOf("export async function recordAllocationAction"));
  it("reads the crew and the sites before the insert", () => {
    const check = fn.indexOf("listActiveCompanyWorkers(ctx.companyId)");
    expect(check).toBeGreaterThan(-1);
    expect(fn.indexOf('.from("work_hour_allocations")')).toBeGreaterThan(check);
  });
  it("refuses a worker not on the crew, a site not active, and an unreadable list", () => {
    expect(fn).toMatch(/if \(crew\.kind !== "ok" \|\| objects\.kind !== "ok"\) return \{ status: "error" \};/);
    expect(fn).toMatch(/crew\.rows\.some\(\(w\) => w\.workerId === workerId\)\) return \{ status: "invalid", field: "worker" \}/);
    expect(fn).toMatch(/o\.id === workObjectId && o\.status === "active"/);
  });
});
