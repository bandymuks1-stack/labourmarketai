import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DSR_RESPONSE_DAYS, dsrDueAtIso, dsrOverdue } from "./dsr-deadline";

describe("data-subject request deadline (Art. 12(3)) — audit 2026-10-16, G-5", () => {
  it("the due date is one month (30 days) after receipt", () => {
    expect(DSR_RESPONSE_DAYS).toBe(30);
    expect(dsrDueAtIso("2026-10-14T09:00:00.000Z")).toBe("2026-11-13T09:00:00.000Z");
  });
  it("an open request past its due date is overdue; a closed one never is", () => {
    const created = "2026-10-14T09:00:00.000Z";
    expect(dsrOverdue(created, "in_review", new Date("2026-11-01T00:00:00Z"))).toBe(false);
    expect(dsrOverdue(created, "in_review", new Date("2026-11-14T00:00:00Z"))).toBe(true);
    expect(dsrOverdue(created, "approved", new Date("2026-11-14T00:00:00Z"))).toBe(true);
    expect(dsrOverdue(created, "closed", new Date("2026-12-01T00:00:00Z"))).toBe(false);
  });
  it("an unparseable timestamp is never reported as overdue", () => {
    expect(dsrOverdue("garbage", "in_review")).toBe(false);
    expect(dsrDueAtIso("garbage")).toBe("garbage");
  });
  it("the admin queue carries the due date and the overdue flag", () => {
    const src = readFileSync(join(__dirname, "../admin/privacy-requests.ts"), "utf8");
    expect(src).toContain("dueAtIso: dsrDueAtIso(r.created_at)");
    expect(src).toContain("overdue: dsrOverdue(r.created_at, r.status)");
  });
});
