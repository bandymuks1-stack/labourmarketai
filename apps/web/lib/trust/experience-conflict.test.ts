import { describe, expect, it } from "vitest";

import { partyConflict } from "./experience-conflict";

const ADMIN = "admin-1";
const none = new Set<string>();

describe("an administrator who is a party does not decide (owner rule 2026-11-13)", () => {
  it("is clear for an administrator with no tie to the record", () => {
    expect(
      partyConflict(
        { author_profile_id: "a", subject_profile_id: "s", subject_organization_id: null },
        ADMIN,
        none,
      ),
    ).toBe(false);
  });
  it("conflicts when the administrator wrote the experience", () => {
    expect(partyConflict({ author_profile_id: ADMIN, subject_profile_id: "s" }, ADMIN, none)).toBe(true);
  });
  it("conflicts when the experience is about the administrator", () => {
    expect(partyConflict({ author_profile_id: "a", subject_profile_id: ADMIN }, ADMIN, none)).toBe(true);
  });
  it("conflicts when the administrator manages the organization it is about", () => {
    expect(
      partyConflict({ author_profile_id: "a", subject_organization_id: "org-1" }, ADMIN, new Set(["org-1"])),
    ).toBe(true);
  });
  it("conflicts when the administrator manages the organization it was written for", () => {
    expect(
      partyConflict(
        { author_profile_id: "a", subject_profile_id: "s", author_organization_id: "org-2" },
        ADMIN,
        new Set(["org-2"]),
      ),
    ).toBe(true);
  });
  it("managing an unrelated organization is not a conflict", () => {
    expect(
      partyConflict({ author_profile_id: "a", subject_organization_id: "org-1" }, ADMIN, new Set(["org-9"])),
    ).toBe(false);
  });
  it("missing party ids never match (null is not the viewer)", () => {
    expect(partyConflict({}, ADMIN, none)).toBe(false);
  });
});
