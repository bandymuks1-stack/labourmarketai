import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE PREMIUM LIVING CV SHOWS EACH LEADERSHIP ROLE ITS BLOCK CANNOT SHOW —
 * one entry per role, with that role's own dates and provenance (decision
 * 0025). An aggregate organization stop would print an ended 2020–2022
 * manager role and a current ownership both as "2020 – now", duplicate the
 * current ownership the leadership block already shows, and label an
 * engagement (the person's own entry) as an organization record.
 */
const page = readFileSync(join(__dirname, "..", "..", "app", "[locale]", "cv", "page.tsx"), "utf8");

describe("premium leadership entries", () => {
  it("one entry per uncovered role; a current membership stays in the leadership block", () => {
    expect(page).toMatch(/\.filter\(\(r\) => !\(r\.source === "membership" && r\.current\)\)/);
    expect(page).toMatch(/\.\.\.uncoveredRoles\.map\(roleEntry\)/);
  });
  it("each entry is dated by its own role", () => {
    expect(page).toMatch(/const from = monthYear\(r\.startedAt\);/);
    expect(page).toMatch(/r\.current \? tPremium\("present"\) : monthYear\(r\.endedAt\)/);
  });
  it("an engagement role's journey station carries its context, so its journal skills connect", () => {
    expect(page).toMatch(/contextId: role.engagementContextId,/);
  });

  it("provenance follows the role: engagement = own (declared), membership = organization record", () => {
    expect(page).toMatch(/role\.source === "membership" \? tPremium\("source\.organization"\) : tPremium\("source\.own"\)/);
    expect(page).toMatch(/level: role\.source === "membership" \? "recorded" : "declared"/);
  });
});
