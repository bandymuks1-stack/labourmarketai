import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EXTERNAL_REFERRAL_SOURCES } from "./external-sources";
import { addressedReferralImpliesWorker, invitationImpliesWorkerContext, pickAddressedJoinPlatform } from "./model";

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
    expect(page).toMatch(/if \(!inviteToken\) \{\s*const invited = await resolveInvitedWorkerContext\(null\);/);
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

describe("addressedReferralImpliesWorker — who may skip the role question without the link", () => {
  it("a join_platform referral from Nonstop Group (registered, worker notice) → skip", () => {
    expect(addressedReferralImpliesWorker({ invitationType: "join_platform", externalSourceSlug: "nonstop" })).toBe(true);
  });
  it("missing, unknown or malformed source → the question is shown", () => {
    for (const slug of [null, undefined, "", "unknown-partner", "NONSTOP", "../x"]) {
      expect(addressedReferralImpliesWorker({ invitationType: "join_platform", externalSourceSlug: slug }), String(slug)).toBe(false);
    }
  });
  it("Nonstop, but not join_platform → the question is shown", () => {
    for (const t of ["join_team", "join_as_employee", "join_project", "invite_company"]) {
      expect(addressedReferralImpliesWorker({ invitationType: t, externalSourceSlug: "nonstop" }), t).toBe(false);
    }
  });
  it("every registered partner states the flag; only those with a worker notice skip", () => {
    for (const src of EXTERNAL_REFERRAL_SOURCES) {
      expect(typeof src.referredPersonIsWorker, src.slug).toBe("boolean");
      expect(addressedReferralImpliesWorker({ invitationType: "join_platform", externalSourceSlug: src.slug })).toBe(src.referredPersonIsWorker);
    }
  });
  it("the token path keeps its own, unchanged rule", () => {
    expect(invitationImpliesWorkerContext({ invitationType: "join_platform", externalSourceSlug: "unknown-partner" })).toBe(true);
    expect(invitationImpliesWorkerContext({ invitationType: "join_as_employee", externalSourceSlug: null })).toBe(true);
  });
});

describe("the role is settled on the SERVER", () => {
  const APP = join(__dirname, "..", "..");
  const actions = readFileSync(join(APP, "lib/auth/actions.ts"), "utf8");
  const resolver = readFileSync(join(APP, "lib/onboarding/invited-worker-context.ts"), "utf8");
  it("completeOnboarding re-derives the invitation and overrides the submitted role", () => {
    const body = actions.slice(actions.indexOf("export async function completeOnboarding"));
    expect(body).toMatch(/const invited = await resolveInvitedWorkerContext\(/);
    expect(body).toMatch(/if \(invited\.workerImplied\) roles = \["worker"\];/);
    // the override sits BEFORE the primary role is derived from `roles`
    expect(body.indexOf('roles = ["worker"]')).toBeLessThan(body.indexOf("const primary = ROLE_ORDER.find"));
  });
  it("the resolver reads only verifiable server data: the token preview or my verified-email invitations", () => {
    expect(resolver).toMatch(/^import "server-only";/);
    expect(resolver).toMatch(/readPublicInvitationPreview\(inviteToken, \{ emitOpened: false \}\)/);
    expect(resolver).toMatch(/listInvitationsForMe\(\)/);
    expect(resolver).toMatch(/addressedReferralImpliesWorker\(addressed\)/);
    expect(resolver).not.toMatch(/formData|searchParams|headers\(/);
  });
});
