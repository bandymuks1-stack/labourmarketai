import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV_ITEM,
  getCoreNavItems,
  getHeaderOverflowNavItems,
  getOrganizationHeaderNav,
  type HeaderWorkspace,
  type NavItem,
} from "@/lib/config/navigation";
import { ORGANIZATION_WORK_AREAS } from "@/lib/navigation/work-areas";

/**
 * PRIMARY NAVIGATION BY ROLE (owner P0-2, direction A, 2026-11-03).
 *
 * The one header shows the core of the ACTIVE workspace: the personal space
 * keeps the core loop; a person who RUNS a company or agency gets that
 * organization's own core. Re-prioritized, never removed: every destination
 * the person had stays reachable from the same header.
 */
const org = (over: Partial<NonNullable<HeaderWorkspace>>): HeaderWorkspace => ({
  kind: "organization",
  organizationType: "company",
  relationship: "owner",
  ...over,
});
const ids = (items: readonly NavItem[]) => items.map((i) => i.id);
const hrefs = (nav: { primary: readonly NavItem[]; overflow: readonly NavItem[] }) =>
  [...nav.primary, ...nav.overflow].map((i) => i.href);

describe("the header follows the active workspace", () => {
  it("the personal space and an employee keep the one core loop", () => {
    expect(getOrganizationHeaderNav({ isAdmin: false, workspace: { kind: "personal" } })).toBeNull();
    expect(getOrganizationHeaderNav({ isAdmin: false, workspace: null })).toBeNull();
    expect(
      getOrganizationHeaderNav({ isAdmin: false, workspace: org({ relationship: "employee" }) }),
    ).toBeNull();
    expect(
      getOrganizationHeaderNav({ isAdmin: false, workspace: org({ organizationType: "team" }) }),
    ).toBeNull();
  });

  it("a company owner or manager gets home · people · projects · hours · messages", () => {
    for (const relationship of ["owner", "manager"] as const) {
      const nav = getOrganizationHeaderNav({ isAdmin: false, workspace: org({ relationship }) })!;
      expect(ids(nav.primary)).toEqual([
        "overview",
        "area:people",
        "area:projects",
        "area:work",
        "communication",
      ]);
    }
  });

  it("an agency (by type or by its company's type) leads with its reserve and clients", () => {
    const byType = getOrganizationHeaderNav({ isAdmin: false, workspace: org({ organizationType: "agency" }) })!;
    const byCompany = getOrganizationHeaderNav({
      isAdmin: false,
      workspace: org({ companyType: "staffing_agency" }),
    })!;
    for (const nav of [byType, byCompany]) {
      expect(ids(nav.primary)).toEqual([
        "overview",
        "area:people",
        "area:clients",
        "area:projects",
        "communication",
      ]);
    }
  });

  it("nothing is removed: every core-loop, More and organization destination stays reachable once", () => {
    const nav = getOrganizationHeaderNav({ isAdmin: false, workspace: org({}) })!;
    const all = hrefs(nav);
    const before = [...getCoreNavItems(), ...getHeaderOverflowNavItems({ isAdmin: false })].map((i) => i.href);
    for (const href of [...before, ...ORGANIZATION_WORK_AREAS.map((a) => a.href)]) {
      expect(all, href).toContain(href);
    }
    expect(new Set(all).size).toBe(all.length);
  });

  it("admin joins More for admins only, never the primary row", () => {
    const plain = getOrganizationHeaderNav({ isAdmin: false, workspace: org({}) })!;
    const admin = getOrganizationHeaderNav({ isAdmin: true, workspace: org({}) })!;
    expect(ids(plain.overflow)).not.toContain("admin");
    expect(ids(admin.primary)).not.toContain("admin");
    expect(admin.overflow[admin.overflow.length - 1]).toEqual(ADMIN_NAV_ITEM);
  });

  it("the primary row stays at five: focused, never a tab strip", () => {
    for (const workspace of [org({}), org({ organizationType: "agency" })]) {
      expect(getOrganizationHeaderNav({ isAdmin: true, workspace })!.primary).toHaveLength(5);
    }
  });
});
