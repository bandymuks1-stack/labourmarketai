import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales } from "@/lib/i18n/config";

/**
 * Local UX review 2026-10-24 — four organization doors that told the person
 * the wrong thing, pinned at the source so they cannot quietly return.
 *
 *  1.5 / 1.10  An owner in the PERSONAL space opened the company page and was
 *              told "you have no company profile yet — create one": an
 *              invitation to a duplicate organization. The personal space now
 *              names the person's organizations with the switch into each.
 *  3.23        The lifecycle section printed the employee as "—" (an owner
 *              cannot read another person's profiles row) while the members
 *              panel on the same page already fell back to the worker's own
 *              display name. Both read ONE fallback now.
 *  1.9         Inviting an e-mail with no account answered only "no such
 *              user" — a dead end next to a working invitation link. The
 *              refusal now points to that link, honestly (a link joins the
 *              organization; a role is granted afterwards).
 */
const web = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(web, rel), "utf8");
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const get = (o: unknown, p: string): unknown =>
  p.split(".").reduce<unknown>(
    (n, k) => (n && typeof n === "object" ? (n as Record<string, unknown>)[k] : undefined),
    o,
  );

describe("1.5/1.10 the personal space is not 'no company'", () => {
  const src = code(read("components/app/company-next-actions.tsx"));

  it("the guide answers the personal workspace BEFORE the create-a-company fallback", () => {
    const personal = src.indexOf('reason === "personal-workspace"');
    const create = src.indexOf('t("noCompany.title")');
    expect(personal).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(personal);
  });

  it("it lists the person's organization workspaces with the membership-checked switch", () => {
    expect(src).toMatch(/getWorkspaceContext\(\)/);
    expect(src).toMatch(/w\.kind === "organization"/);
    expect(src).toMatch(/<OpenWorkspaceButton/);
    expect(src).toMatch(/data-testid="company-personal-space-guide"/);
  });

  for (const loc of activeLocales) {
    it(`${loc}: the personal-space copy and the reused switch labels resolve`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as unknown;
      for (const key of [
        "roleDashboards.company.nextActions.personalSpace.title",
        "roleDashboards.company.nextActions.personalSpace.body",
        "companyWorkHistory.business.workspace.open",
        "companyWorkHistory.business.workspace.opening",
        "companyWorkHistory.business.workspace.error",
        "conversation.chat.workspaceUnnamed",
      ]) {
        const v = get(msgs, key);
        expect(typeof v === "string" && v.trim().length > 0, `${loc}: ${key}`).toBe(true);
      }
    });
  }
});

describe("3.23 one name fallback for organization members", () => {
  it("the members panel and the lifecycle section both read the shared worker display-name fallback", () => {
    for (const rel of ["lib/operations/org-members.ts", "lib/lifecycle/lifecycle.ts"]) {
      const src = code(read(rel));
      expect(src, rel).toMatch(/workerDisplayNamesByProfile\(/);
      // no second inline copy of the workers read
      expect(src, rel).not.toMatch(/\.from\("workers"\)/);
    }
  });

  it("the people-and-stages list is collapsed to one row per person and relationship", () => {
    const src = code(read("app/[locale]/dashboard/company/lifecycle-section.tsx"));
    expect(src).toMatch(/collapseDuplicateLifecycleRows\(members\)/);
    expect(src).toMatch(/listedMembers\.map\(/);
  });
});

describe("1.9 a member invite to an e-mail with no account points to the invitation link", () => {
  const src = code(read("components/app/organization-members-section.tsx"));

  it("the no_such_user refusal renders the hint and the invite-panel door", () => {
    expect(src).toMatch(/inviteState\.code === "no_such_user"/);
    expect(src).toMatch(/data-testid="org-members-invite-no-account-cta"/);
    expect(src).toMatch(/NO_ACCOUNT_INVITE_HREF/);
  });

  it("the door keeps the organization the invite was for (multi-org admin never lands on another org)", () => {
    expect(src).toMatch(/noAccountInviteHref\(organizationId\)/);
    expect(src).toMatch(/&org=\$\{encodeURIComponent\(organizationId\)\}/);
    const page = code(read("app/[locale]/dashboard/company/settings/page.tsx"));
    expect(page).toMatch(/organizationId=\{memberOrgId \?\? null\}/);
  });

  it("the door opens the canonical invite panel with 'join my organization' pre-selected", () => {
    expect(src).toMatch(
      /"\/dashboard\/network\?invite=1&type=join_organization#network-invite"/,
    );
  });

  for (const loc of activeLocales) {
    it(`${loc}: the no-account hint and CTA resolve`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as unknown;
      for (const key of [
        "organizationMembers.members.noAccountHint",
        "organizationMembers.members.noAccountCta",
      ]) {
        const v = get(msgs, key);
        expect(typeof v === "string" && v.trim().length > 0, `${loc}: ${key}`).toBe(true);
      }
    });
  }
});
