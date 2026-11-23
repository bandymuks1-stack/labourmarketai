import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE LIVING CV SHOWS EACH LEADERSHIP ROLE AS ITS OWN ENTRY — one entry per
 * role, with that role's own dates and provenance (decision 0025). An
 * aggregate organization stop would print an ended 2020–2022 manager role and
 * a current ownership both as "2020 – now", and label an engagement (the
 * person's own entry) as an organization record.
 *
 * Since owner P0 2026-11-23 ("CV skills and work experience shown twice") the
 * hero carries no experience list of its own: these entries are the
 * organizations-and-roles SECTION's (screen and print), which therefore lists
 * every role. The career journey keeps drawing only the roles the leadership
 * block cannot show.
 */
const page = readFileSync(join(__dirname, "..", "..", "app", "[locale]", "cv", "page.tsx"), "utf8");

describe("leadership entries", () => {
  it("one entry per role in the organizations-and-roles section, never an aggregate stop", () => {
    expect(page).toMatch(/\.\.\.everyRole\.map\(roleEntry\)/);
    expect(page).toMatch(/\{organizationRoleLines\.map\(\(l\) => \(/);
    expect(page).not.toMatch(/\{stops\.map\(\(s\) => \(/);
  });
  it("the journey draws the roles the leadership block cannot show; a current membership stays in that block", () => {
    expect(page).toMatch(/\.filter\(\(r\) => !\(r\.source === "membership" && r\.current\)\)/);
    expect(page).toMatch(/\.\.\.uncoveredRoles\.map\(\(\{ stop, role, key \}\) => \{/);
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
    // …and the line SAYS it, in words, not only as an attribute.
    expect(page).toMatch(/<span className="text-text-muted"> · \{l\.source\}<\/span>/);
  });
});
