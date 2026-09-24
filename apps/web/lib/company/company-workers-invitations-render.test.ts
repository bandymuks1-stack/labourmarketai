import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * Rendered-DOM proof of the owner direction of 2026-09-24 on the People
 * page's invitations: `manage-invitations` is owner/admin, never a job
 * title. A person without it gets neither the invite form nor the
 * pending-invitations list — an empty list there would read as "nobody is
 * invited" — but one neutral sentence saying who handles invitations. The
 * sentence comes from the REAL catalogues, so a missing key fails here.
 */
vi.mock("@/lib/company/actions", () => ({
  inviteCompanyWorkerAction: async () => ({}),
  assignCompanyWorkerRoleAction: async () => ({}),
  provisionCompanyWorkerEngagementContextAction: async () => ({}),
  setCompanyWorkerJournalReviewAction: async () => ({}),
}));
vi.mock("@/lib/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children?: unknown }) =>
    createElement("a", { href }, children as never),
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/",
}));
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useActionState: () => [null, () => {}, false] };
});

const { CompanyWorkersSection } = await import("@/components/app/company-workers-section");

const WEB = join(__dirname, "..", "..");
const managedElsewhere = (loc: string): string =>
  JSON.parse(readFileSync(join(WEB, "messages", `${loc}.json`), "utf8")).roleDashboards.company.workers
    .invitationsManagedElsewhere;

const labels = (loc: string) =>
  new Proxy({} as Record<string, never>, {
    get: (_t, k) =>
      k === "operations"
        ? { columnHeading: "Ops", notAssigned: "not assigned", reviewEnabled: "on", reviewNotEnabled: "off", roleLabels: {}, setupNote: "", nextActionLabels: {}, assign: {} }
        : k === "invitationsManagedElsewhere"
          ? managedElsewhere(loc)
          : String(k),
  });

const PENDING = {
  kind: "ok" as const,
  rows: [
    { id: "inv-1", invitedEmail: "pending@example.test", status: "pending" as const, createdAt: "2026-09-24T08:00:00Z", note: null },
  ],
};

function render(canManageInvitations: boolean | undefined, loc = "lt") {
  return renderToStaticMarkup(
    createElement(CompanyWorkersSection, {
      workersResult: { kind: "ok", rows: [] },
      invitationsResult: PENDING,
      labels: labels(loc) as never,
      roleCoordinationEnabled: false,
      canManageInvitations,
    }),
  );
}

describe("People page invitations — manage-invitations only", () => {
  it("with the capability: the invite form and the pending list", () => {
    const html = render(true);
    expect(html).toContain('data-testid="company-workers-invite-form"');
    expect(html).toContain('data-testid="company-workers-pending-list"');
    expect(html).toContain("pending@example.test");
    expect(html).not.toContain('data-testid="company-invitations-managed-elsewhere"');
  });

  for (const flag of [false, undefined]) {
    it(`without it (${String(flag)}): no form, no list, the neutral sentence — fails closed by default`, () => {
      const html = render(flag);
      expect(html).not.toContain('data-testid="company-workers-invite-form"');
      expect(html).not.toContain('data-testid="company-workers-pending-list"');
      expect(html).not.toContain("pending@example.test");
      expect(html).not.toContain("invitationsEmpty");
      expect(html).toContain('data-testid="company-invitations-managed-elsewhere"');
      expect(html).toContain("Kvietimais rūpinasi už tai atsakingas įmonės asmuo.");
      // The anchor other surfaces link to still lands on the section.
      expect(html).toContain('id="company-invitations"');
    });
  }

  it("the sentence exists in every catalogue", () => {
    for (const loc of ["lt", "en", "da", "de", "et", "lv", "nl", "no", "pl", "ru", "sv"]) {
      expect(managedElsewhere(loc), loc).toMatch(/\S/);
      expect(render(false, loc), loc).toContain(managedElsewhere(loc).replace(/'/g, "&#x27;"));
    }
  });
});

describe("People page wiring", () => {
  const page = readFileSync(join(WEB, "app", "[locale]", "dashboard", "company", "people", "page.tsx"), "utf8");

  it("derives the flag from the capability projection, never a role string — the creator arm included", () => {
    expect(page).toMatch(
      /projectOrganizationAuthority\(\{ role: employerCtx\.role, isCreator: employerCtx\.isCreator \}\)\s*\.canManageInvitations/,
    );
    expect(page).toContain("canManageInvitations={canManageInvitations}");
  });

  it("the creator keeps invitation authority under a narrower membership row (owns_company admits them)", () => {
    const ctx = readFileSync(join(WEB, "lib", "company", "employer-company-context.ts"), "utf8");
    expect(ctx).toMatch(/isCreator: company\.profile_id === caller\.userId/);
    const actions = readFileSync(join(WEB, "lib", "company", "actions.ts"), "utf8");
    expect(actions).toMatch(
      /!hasOrganizationCapability\(company\.role, "manage-invitations"\) && company\.isCreator !== true/,
    );
  });

  it("every catalogue carries the summary without the pending count", () => {
    for (const loc of ["lt", "en", "da", "de", "et", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const c = JSON.parse(readFileSync(join(WEB, "messages", `${loc}.json`), "utf8"));
      const v = c.organizationDoors.pages.people.summaryWithoutInvitations as string;
      expect(v, loc).toMatch(/\{active\}[\s\S]*\{members\}[\s\S]*\{review\}/);
      expect(v, loc).not.toMatch(/\{pending\}/);
    }
  });

  it("does not read invitations, count them, or offer Pakviesti without it", () => {
    expect(page).toContain("canManageInvitations ? listCompanyWorkerInvitations(companyRow.id) : null");
    expect(page).toMatch(/canManageInvitations\s*\?\s*t\("summary"/);
    expect(page).toMatch(/t\("summaryWithoutInvitations"/);
    expect(page).toMatch(/\{canManageInvitations \? \(\s*<Link[\s\S]*?data-testid="company-invite-link"/);
  });
});
