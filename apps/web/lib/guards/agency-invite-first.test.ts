import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARD — UX gaps 2026-11-18, A-2 and A-3.
 * A-2: on the agency's people page the roster invite sat about a screen and a
 * half down, under the roster. For an agency (the ONE agency rule,
 * actsAsAgency) the invite form leads the team section; every other
 * organisation keeps its order. The "offer our company to an open need" fold
 * gets a 44 px summary.
 * A-3: the success state already hands over a link to send (InviteShareLink);
 * the phone walk now proves it is shown after a real roster invitation.
 */
const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");
const section = read("components/app/company-workers-section.tsx");
const page = read("app/[locale]/dashboard/company/people/page.tsx");

describe("agency: the roster invite comes first", () => {
  it("the people page asks for it only for an agency, by the one agency rule", () => {
    expect(page).toMatch(/const isStaffingAgency = actsAsAgency\(/);
    expect(page).toMatch(/inviteFirst=\{isStaffingAgency\}/);
  });

  it("the section draws ONE invite form, either first or in its old place", () => {
    expect(section.split('data-testid="company-workers-invite-form"').length - 1).toBe(1);
    const header = section.indexOf("{labels.subtitle ?");
    const first = section.indexOf("{inviteFirst && canManageInvitations ? inviteForm : null}");
    const roster = section.indexOf('data-testid="company-workers-active-list"');
    expect(first).toBeGreaterThan(header);
    expect(first).toBeLessThan(roster);
    expect(section).toMatch(/\{inviteFirst \? null : inviteForm\}/);
    expect(section).toMatch(/inviteFirst = false,/);
  });

  it("the invite still needs manage-invitations wherever it is drawn", () => {
    const old = section.indexOf("{inviteFirst ? null : inviteForm}");
    expect(section.lastIndexOf("{canManageInvitations ? (", old)).toBeGreaterThan(-1);
    expect(section).toMatch(/inviteFirst && canManageInvitations \? inviteForm/);
  });

  it("the success state keeps its link to send, and the phone walk checks it", () => {
    expect(section).toMatch(/state\.outcome === "invited" \|\| state\.outcome === "already_pending"\) && labels\.inviteShareLinkLabel/);
    const walk = read("tests/e2e/phone-journeys-isolated.spec.ts");
    expect(walk).toMatch(/getByTestId\("company-workers-invite-link"\), "the invitation offers a link to send"\)\.toBeVisible\(\)/);
  });

  it("the offer-to-a-need fold opens from a 44 px row", () => {
    expect(read("components/app/team-demand-offer-form.tsx")).toMatch(/<summary className="flex min-h-11 cursor-pointer items-center/);
  });
});
