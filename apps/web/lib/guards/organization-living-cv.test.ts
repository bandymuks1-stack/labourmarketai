import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CompanyTeamProfile,
  OrganizationLivingEntry,
  organizationMonogram,
  type CompanyTeamTranslate,
} from "@/components/app/company-team-profile";
import {
  buildCompanyTeamProfile,
  buildOrganizationLivingCv,
  buildOrganizationLivingRecord,
  ORGANIZATION_GALLERY_LIMIT,
  ORGANIZATION_LIVING_TABS,
  organizationLivingTab,
  type OrganizationLivingInput,
  type OrganizationLivingTab,
} from "@/lib/company/team-profile-model";
import { activeLocales } from "@/lib/i18n/config";

/**
 * THE ORGANIZATION'S LIVING CV (owner P0 2026-11-24). One guard per owner point:
 *
 *   1 a professional presentation, inside the signed-in page (section + h2);
 *   2 specialization: declared capabilities, the roster's skills, the team;
 *   3 projects, ongoing and completed;
 *   4 hours from the ONE organization history read, every hour once: day
 *     records, period totals and the journal are never added together, and
 *     client work never reaches this view;
 *   5 a gallery of work photos only, never a photo stated against a person;
 *   6 confirmed and recorded hours as two figures, never one;
 *
 * plus: no helper noise (decision 0032), every active locale, phone widths, and
 * the public page never shows any of it.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const catalog = (locale: string): Record<string, unknown> => JSON.parse(read(`messages/${locale}.json`));
// The runtime merges the skill catalogue in as `skillNames` (lib/i18n/request.ts).
const translator = (locale: string) =>
  createTranslator({
    locale,
    messages: { ...catalog(locale), skillNames: JSON.parse(read(`messages/${locale}/skill-names.json`)) } as never,
  }) as unknown as CompanyTeamTranslate;

const FULL: OrganizationLivingInput = {
  capabilities: ["client", "employer", "workforce_provider"],
  teamSkills: [
    { slug: "tiling", confirmed: false },
    { slug: "tiling", confirmed: true },
    { slug: "plastering", confirmed: false },
  ],
  rosterSize: 41,
  history: {
    hours: 18250.5,
    peopleCount: 37,
    placesCount: 22,
    firstDate: "2019-03-04",
    lastDate: "2025-10-30",
  },
  journal: { hours: 120, confirmedHours: 96, people: 4, firstMonth: "2025-06", lastMonth: "2026-11" },
  projects: {
    running: 1,
    completed: 2,
    items: [
      { id: "p1", title: "Gyvenamasis namas", city: "Vilnius", completed: false },
      { id: "p2", title: "Biurų pastatas", city: "Kaunas", completed: true },
      { id: "p3", title: null, city: null, completed: true },
    ],
  },
  gallery: [
    { id: "m1", url: "https://example.test/1.jpg", caption: "Fasadas", personLinked: false },
    { id: "m2", url: "https://example.test/2.jpg", caption: "Portretas", personLinked: true },
    { id: "m3", url: "", caption: null, personLinked: false },
  ],
  clients: ["UAB Nonstop Group", null, "UAB Nonstop Group"],
};

const IDENTITY = { name: "UAB Alfa", tagline: "Fasadai ir stogai", description: null, country: "LT" };
const tabHref = Object.fromEntries(ORGANIZATION_LIVING_TABS.map((k) => [k, `/x?cv=${k}`])) as Record<
  OrganizationLivingTab,
  string
>;
const render = (locale: string, tab: OrganizationLivingTab = "overview", input: OrganizationLivingInput = FULL) =>
  renderToStaticMarkup(
    createElement(CompanyTeamProfile, {
      view: buildOrganizationLivingCv(IDENTITY, input, locale),
      t: translator(locale),
      member: { locale, tab, tabHref },
    }),
  );

describe("organization Living CV — model", () => {
  it("4: every hour once — the own-records figure is the one business total; the journal stays apart", () => {
    const r = buildOrganizationLivingRecord(FULL);
    expect(r.figures.find((f) => f.key === "hours")?.value).toBe(18251);
    expect(r.experience).toEqual({
      confirmedHours: 96,
      pendingHours: 24,
      recordedHours: 18250.5,
    });
    expect(r.span).toEqual({ from: 2019, to: 2026 });
    expect(r.figures.map((f) => f.key)).toEqual(["years", "hours", "projects", "team"]);
    expect(r.peopleWorked).toBe(37);
    expect(r.places).toBe(22);
  });

  it("no source, no figure: an empty organization shows no number at all", () => {
    const r = buildOrganizationLivingRecord({
      capabilities: [],
      teamSkills: null,
      rosterSize: 0,
      history: { hours: 0, peopleCount: 0, placesCount: 0, firstDate: null, lastDate: null },
      journal: null,
      projects: null,
      gallery: [],
      clients: [],
    });
    expect(r.figures).toEqual([]);
    expect(r.experience).toBeNull();
    expect(r.projects).toBeNull();
    expect(r.span).toBeNull();
    expect(r.rosterSize).toBeNull();
  });

  it("2: capabilities in catalogue order; a skill confirmed in any team stays confirmed", () => {
    const r = buildOrganizationLivingRecord(FULL);
    expect(r.capabilities).toEqual(["employer", "workforce_provider", "client"]);
    expect(r.skills).toEqual([
      { slug: "tiling", confirmed: true },
      { slug: "plastering", confirmed: false },
    ]);
  });

  it("3: projects split ongoing / completed; a project with no title is not invented one", () => {
    const r = buildOrganizationLivingRecord(FULL);
    expect(r.projects?.running.map((p) => p.id)).toEqual(["p1"]);
    expect(r.projects?.completed.map((p) => p.id)).toEqual(["p2"]);
  });

  it("5: the gallery never shows a photo stated against a person, nor an unsigned one, and is capped", () => {
    expect(buildOrganizationLivingRecord(FULL).gallery.map((g) => g.id)).toEqual(["m1"]);
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `g${i}`,
      url: `https://example.test/${i}.jpg`,
      caption: null,
      personLinked: false,
    }));
    expect(buildOrganizationLivingRecord({ ...FULL, gallery: many }).gallery).toHaveLength(
      ORGANIZATION_GALLERY_LIMIT,
    );
  });

  it("the structure is one plain line: named clients only, once each; a cut list says how many more", () => {
    expect(buildOrganizationLivingRecord(FULL).clients).toEqual(["UAB Nonstop Group"]);
    expect(buildOrganizationLivingRecord(FULL).clientsMore).toBe(0);
    const many = buildOrganizationLivingRecord({ ...FULL, clients: ["A", "B", "C", "D", "E"] });
    expect(many.clients).toEqual(["A", "B", "C"]);
    expect(many.clientsMore).toBe(2);
    const html = renderToStaticMarkup(
      createElement(CompanyTeamProfile, {
        view: buildOrganizationLivingCv(IDENTITY, { ...FULL, clients: ["A", "B", "C", "D", "E"] }, "en"),
        t: translator("en"),
        member: { locale: "en", tab: "experience", tabHref },
      }),
    );
    expect(html).toContain("Work done for: A, B, C and 2 more");
  });
});

describe("organization Living CV — rendered", () => {
  it("1: the identity card, the header and the fact strip — a section with its own h2, no public ways in", () => {
    const html = render("lt");
    expect(html).toMatch(/^<section[^>]*data-testid="org-living-cv"/);
    expect(html).toContain('data-testid="org-living-card"');
    expect(html).toContain('data-testid="org-living-figures"');
    expect(html).toContain("<h2");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<main");
    expect(html).not.toContain('data-testid="company-team-contact"');
    expect(html).not.toContain("mailto:");
    expect(html).toContain("2019–2026");
    expect(organizationMonogram("UAB Nonstop Group")).toBe("NG");
    expect(organizationMonogram("Labour market ai Sp. z o.o.")).toBe("LM");
  });

  it("0034: one block at a time, each tab its own address; a block without data has no tab", () => {
    for (const tab of ORGANIZATION_LIVING_TABS) {
      const html = render("en", tab);
      expect(html, tab).toContain(`data-testid="org-living-tab-${tab}"`);
      for (const other of ORGANIZATION_LIVING_TABS.filter((o) => o !== tab)) {
        expect(html, `${tab} hides ${other}`).not.toContain(`data-testid="org-living-tab-${other}"`);
      }
      expect(html).toMatch(new RegExp(`aria-current="page"[^>]*data-tab="${tab}"|data-tab="${tab}"[^>]*aria-current="page"`));
    }
    const bare = render("en", "gallery", { ...FULL, gallery: [], projects: null });
    expect(bare).toContain('data-testid="org-living-tab-overview"');
    expect(bare).not.toContain('data-tab="gallery"');
    expect(bare).not.toContain('data-tab="projects"');
    expect(organizationLivingTab("gallery")).toBe("gallery");
    expect(organizationLivingTab("x")).toBeNull();
    expect(organizationLivingTab(["gallery"])).toBeNull();
  });

  it("0034: the Overview holds only the card, the header, the fact strip and the panels", () => {
    const overview = render("en", "overview");
    for (const part of ["org-living-card", "org-living-figures", "org-living-work", "org-living-summary"]) {
      expect(overview, part).toContain(`data-testid="${part}"`);
    }
    for (const block of ["org-living-gallery", "org-living-experience-pair", "org-living-team-figures", "org-living-clients"]) {
      expect(overview, block).not.toContain(`data-testid="${block}"`);
    }
    expect(overview).not.toContain("Gyvenamasis namas");
    for (const tab of ORGANIZATION_LIVING_TABS.filter((k) => k !== "overview")) {
      const html = render("en", tab);
      expect(html, tab).not.toContain('data-testid="org-living-card"');
      expect(html, tab).not.toContain('data-testid="org-living-figures"');
    }
  });

  it("6: confirmed and recorded hours are two figures with their own evidence marks; the ring reads the journal only", () => {
    const html = render("en", "experience");
    expect(html).toMatch(/org-living-confirmed[\s\S]*data-level="confirmed"/);
    expect(html).toMatch(/org-living-recorded[\s\S]*data-level="recorded"/);
    expect(html).toContain("96 h");
    expect(html).toContain("18,250.5 h");
    expect(html).toContain("24 h waiting for approval");
    // 96 of 120 journal hours: 80 %. The organization's own records are never in the ring.
    expect(render("en", "overview")).toContain("80% of journal hours confirmed");
  });

  it("2: capabilities, skills with their confirmation and the team size; the Team block", () => {
    const html = render("lt");
    expect(html).toContain('data-testid="org-living-capabilities"');
    expect(html).toContain('data-confirmed="true"');
    expect(html).toContain("Komandoje 41 žmogus");
    const team = render("lt", "team");
    expect(team).toContain('data-testid="org-living-team-figures"');
    expect(team).toContain("37");
    expect(team).not.toMatch(/Jonas|Petras|@/);
  });

  it("3 + 5: projects ongoing and completed; a work-only gallery", () => {
    const projects = render("lt", "projects");
    expect(projects).toContain("Gyvenamasis namas");
    expect(projects).toContain("Biurų pastatas");
    const photos = render("lt", "gallery");
    expect(photos).toContain("https://example.test/1.jpg");
    expect(photos).not.toContain("https://example.test/2.jpg");
  });

  it("0032: no helper noise — no public provenance line, footer, rating or score", () => {
    const lt = catalog("lt") as { businessProfile: { poweredBy: string; team: Record<string, string> } };
    for (const tab of ORGANIZATION_LIVING_TABS) {
      const html = render("lt", tab);
      for (const noise of [lt.businessProfile.poweredBy, lt.businessProfile.team.provenance, lt.businessProfile.team.contactNote]) {
        expect(html).not.toContain(noise);
      }
      expect(html.toLowerCase()).not.toContain("demo");
      expect(html).not.toMatch(/★|rating|score/i);
    }
  });

  it("every active locale renders every block from its own catalogue, never English fallbacks", () => {
    const enLiving = (catalog("en") as { businessProfile: { team: { living: Record<string, unknown> } } })
      .businessProfile.team.living;
    const keys = (o: Record<string, unknown>, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === "object" ? keys(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`],
      );
    for (const locale of activeLocales) {
      const living = (catalog(locale) as { businessProfile: { team: { living?: Record<string, unknown> } } })
        .businessProfile.team.living;
      expect(living, `${locale} has the living catalogue`).toBeDefined();
      expect(keys(living!).sort(), locale).toEqual(keys(enLiving).sort());
      for (const tab of ORGANIZATION_LIVING_TABS) {
        const html = render(locale, tab);
        expect(html, `${locale} ${tab}`).not.toContain("businessProfile.");
        if (locale !== "en") expect(html, `${locale} ${tab}`).not.toContain("hours worked");
      }
      const entry = renderToStaticMarkup(
        createElement(OrganizationLivingEntry, { name: "UAB Alfa", href: "/x?cv=overview", t: translator(locale) }),
      );
      expect(entry, locale).not.toContain("businessProfile.");
    }
  });

  it("phone widths: every grid starts at one or two columns and its items may shrink", () => {
    const src = read("components/app/company-team-profile.tsx");
    const member = src.slice(src.indexOf("const LIVING ="), src.indexOf("export function CompanyTeamProfile"));
    for (const grid of member.match(/className="grid [^"]*"/g) ?? []) {
      // One or two columns; three only for the compact tab control.
      expect(grid, grid).toMatch(/grid-cols-(1|2)( |")|^className="grid grid-cols-3 gap-1 rounded-card/);
    }
    expect(member).not.toMatch(/\bw-\[\d+px\]|min-w-\[\d+px\]/);
    expect((member.match(/min-w-0/g) ?? []).length).toBeGreaterThanOrEqual(14);
    // The tabs are a segmented control that fits 375 px: no sideways strip
    // anywhere in the member form (decision 0034, the one-rail rule).
    expect(member).not.toMatch(/overflow-x-(auto|scroll)|min-w-max|snap-x/);
    expect(member).toContain('className="grid grid-cols-3 gap-1 rounded-card');
  });
});

describe("organization Living CV — wiring", () => {
  it("the public page never builds the member form", () => {
    const view = buildCompanyTeamProfile(
      {
        profile: {
          id: "o",
          displayName: "A",
          tagline: null,
          description: null,
          country: null,
          website: null,
          contactEmail: null,
          contactPhone: null,
        },
        listings: [],
      },
      "lt",
    );
    expect(view.living).toBeUndefined();
    expect(read("app/[locale]/business/[slug]/page.tsx")).not.toMatch(/organization-living-cv|buildOrganizationLivingCv/);
  });

  it("the member form reads the ONE organization history read and stores nothing", () => {
    const loader = read("lib/company/organization-living-cv.ts");
    expect(loader).toContain('from "@/lib/organization-evidence/company-work-history-read"');
    expect(loader).not.toMatch(/listEvidenceRecords|listAllEvidenceRecords|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(loader).not.toMatch(/service[_-]?role|createAdminClient/i);
    // 0025: the own-records figure is the business history's ONE total; day and
    // period sums are never added here (overlapping periods would count twice).
    expect(loader).toContain("load.business.totals.hours");
    expect(loader).not.toMatch(/dayHours|periodHours/);
  });

  it("the organization's own settings page carries the way in and the Living CV at its own address", () => {
    const page = read("app/[locale]/dashboard/company/settings/page.tsx");
    expect(page).toContain("loadOrganizationLivingCv(");
    expect(page).toContain("<CompanyTeamProfile");
    expect(page).toContain("<OrganizationLivingEntry");
    expect(page).toContain("organizationLivingTab(sp.cv)");
    // The history is read only when the Living CV is opened, never on every Settings visit.
    expect(page).toMatch(/cvTab && capabilityOrgId\s*\?\s*await loadOrganizationLivingCv/);
  });
});
