import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { invitationImpliesWorkerContext, pickAddressedJoinPlatform } from "./model";

/**
 * NO TOKEN, STILL INVITED (2026-10-27). The first real invited person
 * registered through Google and finished onboarding, yet the invitation stayed
 * pending: onboarding only used it when `?next=/invite/<token>` survived.
 */
const row = (over: Partial<{ id: string; invitationType: string; externalSourceSlug: string | null }> = {}) => ({
  id: "inv-1",
  invitationType: "join_platform",
  externalSourceSlug: null as string | null,
  ...over,
});

describe("pickAddressedJoinPlatform", () => {
  it("picks the pending join_platform invitation addressed to me", () => {
    expect(pickAddressedJoinPlatform([row()])?.id).toBe("inv-1");
  });

  it("never picks an invitation that names an actor (company, team, project, employee)", () => {
    for (const t of ["join_organization", "join_team", "join_as_employee", "join_project", "invite_company", "collaborate_partner"]) {
      expect(pickAddressedJoinPlatform([row({ invitationType: t })]), t).toBeNull();
    }
  });

  it("nothing addressed to me → nothing picked", () => {
    expect(pickAddressedJoinPlatform([])).toBeNull();
  });

  it("two or more join_platform invitations → the platform does not choose", () => {
    expect(pickAddressedJoinPlatform([row({ id: "a" }), row({ id: "b", externalSourceSlug: "nonstop" })])).toBeNull();
  });

  it("one join_platform among actor-naming invitations is still exactly one", () => {
    expect(pickAddressedJoinPlatform([row({ id: "t", invitationType: "join_team" }), row({ id: "p" })])?.id).toBe("p");
  });

  it("only a PARTNER referral lets onboarding skip the role question", () => {
    const partner = pickAddressedJoinPlatform([row({ externalSourceSlug: "nonstop" })])!;
    const person = pickAddressedJoinPlatform([row()])!;
    expect(invitationImpliesWorkerContext(partner)).toBe(true);
    expect(invitationImpliesWorkerContext(person)).toBe(false);
  });
});

describe("onboarding wiring", () => {
  const APP = join(__dirname, "..", "..");
  const page = readFileSync(join(APP, "app/[locale]/onboarding/page.tsx"), "utf8");
  const wizard = readFileSync(join(APP, "components/app/onboarding-wizard.tsx"), "utf8");

  it("looks the invitation up ONLY when no token came in ?next=", () => {
    expect(page).toMatch(/if \(!inviteToken\) \{\s*const mine = await listInvitationsForMe\(\);/);
    expect(page).toMatch(/addressedInvitationId=\{addressedInvitationId\}/);
  });

  it("accepts it at the finish through the canonical by-id door, never a new path", () => {
    expect(wizard).toMatch(/else if \(addressedInvitationId\) \{[\s\S]{0,200}acceptInvitationByIdAction\(\{/);
    expect(wizard).toMatch(/noticeSurface: "onboarding"/);
  });

  it("the token path keeps precedence", () => {
    const at = wizard.indexOf("if (invitationToken) {");
    const by = wizard.indexOf("else if (addressedInvitationId)");
    expect(at).toBeGreaterThan(-1);
    expect(by).toBeGreaterThan(at);
  });
});
