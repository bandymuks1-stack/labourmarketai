/**
 * GUARD — owner P0 2026-11-22:
 *   (2) signing up from a company invitation says who invited, to which
 *       organization (and as what), and what happens next;
 *   (3) a person who should join an existing organization is never routed to
 *       set one up: onboarding asks no "what did you come for" question for
 *       such an invitation, and the server fixes the role to the person's
 *       own (no company shell is created), whatever a form submits.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { invitationJoinsExistingOrganization, JOINS_EXISTING_ORGANIZATION_TYPES } from "@/lib/invitations/model";

const WEB = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(WEB, p), "utf8");
const LOCALES = ["en", "lt", "ru", "nl", "de", "pl", "sv", "da", "et", "lv", "no"] as const;

describe("an invitation into an existing organization", () => {
  it("joins only for the person-into-organization kinds with a named organization", () => {
    expect([...JOINS_EXISTING_ORGANIZATION_TYPES].sort()).toEqual(
      ["join_as_employee", "join_organization", "join_project", "join_team"].sort(),
    );
    expect(invitationJoinsExistingOrganization({ invitationType: "join_organization", organizationName: "Acme" })).toBe(true);
    expect(invitationJoinsExistingOrganization({ invitationType: "join_organization", organizationName: " " })).toBe(false);
    for (const t of ["invite_company", "collaborate_partner", "join_platform", "invite_to_demand"]) {
      expect(invitationJoinsExistingOrganization({ invitationType: t, organizationName: "Acme" }), t).toBe(false);
    }
  });

  it("the server action and the onboarding page use the same rule", () => {
    expect(read("lib/onboarding/invited-worker-context.ts")).toContain("invitationJoinsExistingOrganization({");
    expect(read("lib/auth/actions.ts")).toContain("if (invited.workerImplied) roles = [\"worker\"];");
    expect(read("app/[locale]/onboarding/page.tsx")).toContain("invitationJoinsExistingOrganization({");
  });

  it("the sign-up form shows who invited and what happens next", () => {
    const page = read("app/[locale]/auth/signup/page.tsx");
    expect(page).toContain('tSignup("inviteFrom"');
    expect(page).toContain('tSignup("inviteNext"');
    expect(read("components/app/signup-form.tsx")).toContain('data-testid="signup-invite-context"');
    for (const l of LOCALES) {
      const s = JSON.parse(read(`messages/${l}.json`)).auth.signup;
      for (const k of ["inviteFrom", "inviteTo", "inviteNext"]) expect(typeof s[k], `${l} ${k}`).toBe("string");
      expect(s.inviteFrom, l).toContain("{inviter}");
      expect(s.inviteNext, l).toContain("{organization}");
    }
  });
});
