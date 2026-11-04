import { describe, expect, it } from "vitest";

import { ownEngagementHeading } from "./own-engagement-heading";

describe("ownEngagementHeading", () => {
  it("a job without an organization keeps what the person said it was", () => {
    expect(
      ownEngagementHeading({ orgName: null, title: "Virėjas, UAB Maistas", relationshipLabel: "Darbuotojas" }),
    ).toEqual({ title: "Virėjas, UAB Maistas", subtitle: "Darbuotojas" });
  });

  it("a placement still says it is a placement", () => {
    expect(
      ownEngagementHeading({ orgName: null, title: "Virėjas", relationshipLabel: "Praktikantas" }).subtitle,
    ).toBe("Praktikantas");
  });

  it("an organization stays beside the title", () => {
    expect(
      ownEngagementHeading({ orgName: "Alfa", title: "Meistras", relationshipLabel: "Darbuotojas" }),
    ).toEqual({ title: "Meistras", subtitle: "Alfa" });
  });

  it("nothing but an organization is the organization", () => {
    expect(
      ownEngagementHeading({ orgName: "Alfa", title: null, relationshipLabel: "Darbuotojas" }),
    ).toEqual({ title: "Alfa", subtitle: null });
  });

  it("a blank title is no title, and the relationship word is the last resort", () => {
    expect(
      ownEngagementHeading({ orgName: null, title: "  ", relationshipLabel: "Darbuotojas" }),
    ).toEqual({ title: "Darbuotojas", subtitle: null });
  });
});
