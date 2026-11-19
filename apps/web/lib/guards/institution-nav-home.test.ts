import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isEducationInstitution } from "@/lib/organizations/capabilities";
import {
  learnerInviteHref,
  ORGANIZATION_EDUCATION_AREA,
  organizationHeaderAreas,
} from "@/lib/navigation/work-areas";
import { CLIENT_MESSAGE_ROOTS } from "@/lib/i18n/client-messages";
import { activeLocales } from "@/lib/i18n/config";

/**
 * THE EDUCATION INSTITUTION FINDS ITS LEARNING HOME (UX_GAPS 2026-11-18 I-1, I-2).
 *
 * I-1: the header listed an institution's 18 organization destinations but not
 *      its learning home; the way back was the door chip or the address bar.
 * I-2: its home led with "Describe a need" — employer copy for an organization
 *      that declared it trains people.
 *
 * Both follow the ONE education gate the organization doors already use
 * (`isEducationInstitution` over the declared capabilities) — no second rule.
 */
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("I-1 — the header names the learning area for an education institution", () => {
  it("the doors, the header and the home ask the same predicate", () => {
    expect(read("lib/company/organization-doors.ts")).toMatch(
      /const hasEducation = isEducationInstitution\(\{ roleSlugs: capabilities \}\);/,
    );
    const header = read("components/app/conversation/chat/conversation-header.tsx");
    expect(header).toMatch(
      /isEducationInstitution\(\{ roleSlugs: auth\?\.activeOrganizationCapabilities \}\)/,
    );
    expect(header).toMatch(/organizationHeaderAreas\(actingRole, \{ education \}\)/);
    expect(read("app/[locale]/dashboard/layout.tsx")).toMatch(
      /readOrganizationCapabilities\(activeOrganizationId\)/,
    );
    expect(isEducationInstitution({ roleSlugs: ["training_provider"] })).toBe(true);
    expect(isEducationInstitution({ roleSlugs: ["employer"] })).toBe(false);
    expect(isEducationInstitution({ roleSlugs: [] , legacyType: "company" })).toBe(false);
  });

  it("the area is the education door's own route and label, and leads the institution's doors", () => {
    const doors = read("lib/company/organization-doors.ts");
    expect(doors).toContain(`education: "${ORGANIZATION_EDUCATION_AREA.href}"`);
    expect(ORGANIZATION_EDUCATION_AREA.labelKey).toBe("organizationDoors.education");
    for (const role of ["company", "agency"] as const) {
      const withEdu = organizationHeaderAreas(role, { education: true });
      expect(withEdu[0]).toMatchObject({ id: "area:education", href: "/dashboard/company/education" });
      expect(withEdu.slice(1)).toEqual(organizationHeaderAreas(role));
      expect(organizationHeaderAreas(role).some((a) => a.id === "area:education")).toBe(false);
    }
  });

  it("the label reaches the browser in every locale (no raw key in the header)", () => {
    expect((CLIENT_MESSAGE_ROOTS as readonly string[]).includes("organizationDoors")).toBe(true);
    for (const locale of activeLocales) {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as {
        organizationDoors?: { education?: unknown };
      };
      expect(typeof messages.organizationDoors?.education, locale).toBe("string");
    }
  });
});

describe("I-2 — an education institution's home leads with the learner invite", () => {
  const screen = read("components/app/organization/company-model-screen.tsx");
  const page = read("app/[locale]/dashboard/page.tsx");

  it("the one primary is the learner invite for an institution, the need door otherwise", () => {
    expect(page).toMatch(
      /isEducationInstitution\(\{ roleSlugs: workspace\.signals\.capabilities \}\)\s*\?\s*workspace\.organizationId\s*:\s*null/,
    );
    expect(screen).toMatch(/learnerInviteHref\(learnerInviteOrganizationId\)/);
    expect(screen).toMatch(/roleDashboards\.company\.learners\.invite/);
    expect(screen).toMatch(/<NeedDoorLink surface="company_model" testId="company-model-primary"/);
    expect(screen.match(/data-testid="company-model-primary"|testId="company-model-primary"/g)).toHaveLength(2);
  });

  it("every learner invite uses the ONE address", () => {
    expect(learnerInviteHref("org-1")).toBe(
      "/dashboard/network?type=join_organization&org=org-1&relationship=student",
    );
    for (const f of [
      "components/app/institution-learners-section.tsx",
      "components/app/institution-programs-section.tsx",
      "components/app/organization/company-model-screen.tsx",
    ]) {
      expect(read(f), f).not.toMatch(/type=join_organization&org=\$\{/);
    }
  });

  it("the approvals' people link is a 44 px target", () => {
    expect(read("components/app/arena/confirm-pulse.tsx")).toMatch(
      /className=\{`\$\{lineLink\} inline-flex min-h-11 items-center`\} data-testid="organization-approvals-people"/,
    );
  });
});
