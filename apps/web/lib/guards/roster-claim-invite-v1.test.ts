import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: a roster name with no account can be INVITED to claim its history,
 * and the invitation never links anything.
 *
 * Production fact (read-only, 2026-10-04): the first imported history covers
 * seven roster people; five have no account at all (129 of 158 records), one
 * has a proposed link, one is linked. The database admits a link OFFER only for
 * a profile already in an active relationship with the organization, so for the
 * five there was no first step. This slice adds that step on the ONE invitation
 * primitive and keeps the rule that an unlinked name is not an identity.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(APP_ROOT, ...p), "utf8");
const LOCALES = ["en", "lt", "ru", "nl", "de", "pl"] as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const msgs = (loc: string): any => JSON.parse(read("messages", `${loc}.json`));

const actions = read("lib", "organization-evidence", "roster-link-actions.ts");
const claimAction = actions.slice(actions.indexOf("export async function inviteRosterPersonToClaimAction"));

describe("inviting a roster person to claim their history", () => {
  it("rides the one invitation primitive, never a second path", () => {
    expect(claimAction).toMatch(/createAndSendInvitations\(/);
    expect(claimAction).toMatch(/invitationType: "join_as_employee"/);
    expect(actions).toMatch(/from "@\/lib\/invitations\/actions"/);
  });

  it("links nothing: no write to organization_people, no offer, no auto-match", () => {
    expect(claimAction).not.toMatch(/\.update\(/);
    expect(claimAction).not.toMatch(/\.insert\(/);
    expect(claimAction).not.toMatch(/offerRosterLink\(/);
    expect(claimAction).not.toMatch(/link_state:\s*"(linked|link_proposed)"/);
    // The only table touch is the caller's own RLS read of the roster row.
    expect(claimAction).toMatch(/\.from\("organization_people"\)\s*\.select\(/);
  });

  it("invites only a name nobody has claimed, and never defaults a relationship", () => {
    expect(claimAction).toMatch(/person\.link_state !== "unlinked"/);
    expect(claimAction).toMatch(/isRelationshipInviteSlug\(kind\)/);
    expect(claimAction).toMatch(/code: "invalid_relationship"/);
  });

  it("takes exactly one e-mail address and a roster id that is a uuid", () => {
    expect(claimAction).toMatch(/SINGLE_EMAIL\.test\(email\)/);
    expect(claimAction).toMatch(/ROSTER_UUID\.test\(personId\)/);
  });

  it("is offered on every unlinked roster row, beside the existing link offer", () => {
    const section = read("components", "app", "organization-roster-section.tsx");
    expect(section).toMatch(/<RosterClaimInviteForm/);
    expect(section).toMatch(/<RosterLinkOfferForm/);
    expect(section).toMatch(/linkStateKey\(p\.linkState\) === "unlinked" \? \(\s*<RosterClaimInviteForm/);
  });

  it.each(LOCALES)("%s carries every claim key the form renders", (loc) => {
    const claim = msgs(loc).organizationRoster?.claim;
    expect(claim, `${loc} organizationRoster.claim`).toBeTruthy();
    for (const k of ["label", "placeholder", "invite", "sent", "created", "deliveryFailed", "hint"]) {
      expect(typeof claim[k], `${loc} claim.${k}`).toBe("string");
      expect(claim[k].length).toBeGreaterThan(3);
    }
    for (const k of [
      "generic",
      "duplicate_pending",
      "rate_limited",
      "limit_reached",
      "not_authorized",
      "invalid_relationship",
      "invalid_email",
      "needs_migration",
    ]) {
      expect(typeof claim.errors?.[k], `${loc} claim.errors.${k}`).toBe("string");
    }
  });
});
