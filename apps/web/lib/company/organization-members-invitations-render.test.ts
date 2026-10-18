import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * Rendered-DOM proof of the owner's grant control (owner direction
 * 2026-09-24): invitation management is a PER-PERSON grant the owner (or an
 * admin) gives or withdraws — never a job title. Owner/admin see one control
 * on every other active member who is not owner/admin; the label follows the
 * current grant; a delegated member carries a badge; nobody else sees a
 * control. Labels come from the REAL catalogues, so a missing key fails here.
 */
vi.mock("@/lib/company/membership-actions", () => ({
  cancelMembershipInviteAction: async () => ({}),
  changeMembershipRoleAction: async () => ({}),
  inviteMembershipAction: async () => ({}),
  leaveOrganizationAction: async () => ({}),
  revokeMembershipAction: async () => ({}),
  setMembershipInvitationManagerAction: async () => ({}),
}));
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useActionState: () => [null, () => {}, false] };
});

const { OrganizationMembersSection } = await import("@/components/app/organization-members-section");

const WEB = join(__dirname, "..", "..");
const LOCALES = ["lt", "en", "da", "de", "et", "lv", "nl", "no", "pl", "ru", "sv"];
const catalog = (loc: string) =>
  JSON.parse(readFileSync(join(WEB, "messages", `${loc}.json`), "utf8")).organizationMembers;

function labels(loc: string) {
  const c = catalog(loc);
  return {
    ...c.members,
    roleLabels: c.roles,
    outcomes: c.outcomes,
  };
}

const OWNER = "p-owner";
const member = (id: string, role: string, extra: Partial<{ managesInvitations: boolean; status: string; profileId: string }> = {}) => ({
  membershipId: `m-${id}`,
  profileId: extra.profileId ?? `p-${id}`,
  fullName: id,
  email: null,
  role,
  status: extra.status ?? "active",
  managesInvitations: extra.managesInvitations ?? false,
});

const MEMBERS = [
  member("owner", "owner", { profileId: OWNER }),
  member("admin", "admin"),
  member("recruiter", "manager"),
  member("delegate", "manager", { managesInvitations: true }),
  member("plain", "member"),
  member("pending", "manager", { status: "invited" }),
];

function render(myRole: string, myProfileId: string, loc = "lt") {
  return renderToStaticMarkup(
    createElement(OrganizationMembersSection, {
      members: MEMBERS as never,
      myRole: myRole as never,
      myProfileId,
      labels: labels(loc) as never,
    }),
  );
}

describe("owner's invitation-management grant control", () => {
  it("owner: one control on each active non-owner/admin member; label follows the grant", () => {
    const html = render("owner", OWNER);
    const l = labels("lt");
    expect(html).toContain('data-testid="org-member-invitations-m-recruiter"');
    expect(html).toContain('data-testid="org-member-invitations-m-plain"');
    expect(html).toContain('data-testid="org-member-invitations-m-delegate"');
    // Owner/admin rows hold it by role; an invited (not yet active) row has no grant.
    expect(html).not.toContain('data-testid="org-member-invitations-m-owner"');
    expect(html).not.toContain('data-testid="org-member-invitations-m-admin"');
    expect(html).not.toContain('data-testid="org-member-invitations-m-pending"');
    expect(html).toContain(l.grantInvitations);
    expect(html).toContain(l.withdrawInvitations);
    // The hidden flag asks for the opposite of the current state, per row.
    const row = (id: string) => {
      const start = html.indexOf(`data-testid="org-member-row-m-${id}"`);
      return html.slice(start, html.indexOf("</li>", start));
    };
    expect(row("delegate")).toContain('name="enabled" value="false"');
    expect(row("delegate")).toContain(l.withdrawInvitations);
    expect(row("recruiter")).toContain('name="enabled" value="true"');
    expect(row("recruiter")).toContain(l.grantInvitations);
  });

  it("admin: the same control on the rows an admin may touch", () => {
    const html = render("admin", "p-admin");
    expect(html).toContain('data-testid="org-member-invitations-m-recruiter"');
    expect(html).not.toContain('data-testid="org-member-invitations-m-owner"');
  });

  it("a manager (even a delegated one) sees no grant control — only owner/admin grant", () => {
    for (const [role, pid] of [["manager", "p-recruiter"], ["manager", "p-delegate"], ["member", "p-plain"]]) {
      const html = render(role, pid);
      expect(html, `${role}/${pid}`).not.toContain('data-testid="org-member-invitations-');
    }
  });

  it("a delegated member carries a badge everyone reads; an undelegated manager does not", () => {
    const html = render("manager", "p-recruiter");
    expect(html).toContain('data-testid="org-member-manages-invitations-m-delegate"');
    expect(html).not.toContain('data-testid="org-member-manages-invitations-m-recruiter"');
  });

  it("every catalogue carries the control, the badge and the three outcomes", () => {
    for (const loc of LOCALES) {
      const c = catalog(loc);
      for (const k of ["managesInvitations", "grantInvitations", "withdrawInvitations"]) {
        expect(c.members[k], `${loc} members.${k}`).toMatch(/\S/);
      }
      for (const k of ["granted", "withdrawn", "held_by_role"]) {
        expect(c.outcomes[k], `${loc} outcomes.${k}`).toMatch(/\S/);
      }
      expect(render("owner", OWNER, loc), loc).toContain(
        c.members.grantInvitations.replace(/'/g, "&#x27;"),
      );
    }
  });
});
