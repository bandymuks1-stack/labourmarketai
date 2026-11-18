import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

  it("a placement at a named organization is not listed like a job there", () => {
    expect(
      ownEngagementHeading({ orgName: "Alfa", title: "Virėjas", relationshipLabel: "Praktikantas", practice: true }),
    ).toEqual({ title: "Virėjas", subtitle: "Alfa · Praktikantas" });
  });

  it("a learner's link to a school with no title still says what the link is", () => {
    expect(
      ownEngagementHeading({ orgName: "Kolegija", title: null, relationshipLabel: "Studentas", practice: true }),
    ).toEqual({ title: "Kolegija", subtitle: "Studentas" });
  });

  it("employment at a named organization reads exactly as before", () => {
    expect(
      ownEngagementHeading({ orgName: "Alfa", title: "Meistras", relationshipLabel: "Darbuotojas", practice: false }),
    ).toEqual({ title: "Meistras", subtitle: "Alfa" });
  });

  it("every caller says whether the engagement is practice", () => {
    for (const f of ["app/[locale]/cv/page.tsx", "lib/cv/athlete-profile.ts"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      const calls = src.split("ownEngagementHeading({").length - 1;
      const told = src.match(/ownEngagementHeading\(\{[^}]*practice: e\.kind === "practice",/g)?.length ?? 0;
      expect(told, f).toBe(calls);
      expect(calls, f).toBeGreaterThan(0);
    }
  });
});
