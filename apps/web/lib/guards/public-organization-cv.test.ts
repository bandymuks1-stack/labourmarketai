import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  PUBLIC_CV_HOURS_STEP,
  PUBLIC_CV_MIN_PEOPLE,
  buildPublicOrganizationCv,
} from "@/lib/organization-evidence/public-organization-cv-model";
import type { CompanyWorkHistory } from "@/lib/organization-evidence/company-work-history";
import type { OrganizationJournal } from "@/lib/organization-evidence/organization-journal";
import type { OrganizationProjects } from "@/lib/organization-evidence/organization-projects";

/**
 * GUARD — the public company Living CV (register 3.36, owner decision
 * 2026-11-16): aggregated data only; a minimum group of 5 people; shown only
 * while the public profile is on; no personal data.
 */
const WEB = resolve(__dirname, "../..");
const src = (p: string) => readFileSync(resolve(WEB, p), "utf8");

const journal = (people: number): OrganizationJournal => ({
  entries: 40,
  people,
  hours: 312.5,
  confirmedHours: 120,
  dayUnits: 0,
  firstMonth: "2026-03",
  lastMonth: "2026-10",
});
const history = (peopleCount: number): CompanyWorkHistory => ({
  places: [
    {
      key: "o:place-1",
      kind: "object",
      name: "Synthetic Street 1",
      objectId: "place-1",
      scope: "object",
      records: [],
      dayHours: 80,
      periodHours: 0,
      dayCount: 10,
      recordedDays: 10,
      periodCount: 0,
      firstDate: "2025-01-02",
      lastDate: "2025-06-30",
      people: [{ id: "person-1", name: "Synthetic Person", dayHours: 80, periodHours: 0 }],
    } as unknown as CompanyWorkHistory["places"][number],
  ],
  totalRecords: 120,
  dayHours: 960,
  periodHours: 400,
  peopleCount,
  firstDate: "2024-02-05",
  lastDate: "2025-06-30",
  byPlacement: { object: 100, label: 10, none: 10 },
});
const projects: OrganizationProjects = {
  total: 3,
  running: 1,
  completed: 2,
  items: [{ id: "project-1", title: "Synthetic project", city: "Vilnius", completed: false }],
};

describe("public company Living CV — the k>=5 and opt-in gate", () => {
  it("the minimum group is 5 people", () => {
    expect(PUBLIC_CV_MIN_PEOPLE).toBe(5);
  });

  it("nothing at all while the public profile is off, whatever the figures", () => {
    expect(buildPublicOrganizationCv({ enabled: false, projects, journal: journal(50), history: history(50) })).toBeNull();
  });

  it("4 people behind a figure hide it; 5 show it", () => {
    expect(buildPublicOrganizationCv({ enabled: true, projects, journal: journal(4), history: history(4) })).toBeNull();
    const five = buildPublicOrganizationCv({ enabled: true, projects, journal: journal(5), history: history(4) });
    expect(five?.journal?.people).toBe(5);
    expect(five?.history).toBeNull();
    const hist = buildPublicOrganizationCv({ enabled: true, projects, journal: journal(4), history: history(5) });
    expect(hist?.journal).toBeNull();
    expect(hist?.history?.people).toBe(5);
  });

  it("project counts never stand alone: they need a people-backed figure beside them", () => {
    expect(buildPublicOrganizationCv({ enabled: true, projects, journal: null, history: null })).toBeNull();
    expect(buildPublicOrganizationCv({ enabled: true, projects, journal: journal(4), history: null })).toBeNull();
  });

  it("an unreadable source (null) is hidden, never shown as zero", () => {
    expect(buildPublicOrganizationCv({ enabled: true, projects: null, journal: null, history: null })).toBeNull();
    const cv = buildPublicOrganizationCv({ enabled: true, projects: null, journal: journal(6), history: null });
    expect(cv?.projects).toBeNull();
    expect(cv?.history).toBeNull();
  });

  it("published hours are coarse: multiples of 10, so two snapshots cannot recover one person's hours", () => {
    expect(PUBLIC_CV_HOURS_STEP).toBe(10);
    const cv = buildPublicOrganizationCv({ enabled: true, projects, journal: journal(6), history: history(6) });
    expect(cv?.journal?.hours).toBe(310); // 312.5 recorded
    expect(cv?.journal?.confirmedHours).toBe(120);
    expect(cv?.history?.dayHours).toBe(960);
    for (const h of [cv?.journal?.hours, cv?.journal?.confirmedHours, cv?.history?.dayHours]) {
      expect((h ?? 0) % PUBLIC_CV_HOURS_STEP).toBe(0);
    }
  });

  it("only aggregates leave: every field is a count, an hour total or a month", () => {
    const cv = buildPublicOrganizationCv({ enabled: true, projects, journal: journal(9), history: history(9) });
    expect(cv).not.toBeNull();
    const keys = new Set<string>();
    const walk = (v: unknown, path: string) => {
      if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
      else keys.add(path);
    };
    walk(cv, "");
    expect([...keys].sort()).toEqual(
      [
        "history.dayHours",
        "history.firstMonth",
        "history.lastMonth",
        "history.people",
        "journal.confirmedHours",
        "journal.firstMonth",
        "journal.hours",
        "journal.lastMonth",
        "journal.people",
        "projects.completed",
        "projects.running",
      ].sort(),
    );
    // Nothing from the inputs' personal or place detail survives.
    const text = JSON.stringify(cv);
    for (const leak of ["Synthetic Person", "person-1", "Synthetic Street", "place-1", "Synthetic project", "project-1", "Vilnius"]) {
      expect(text).not.toContain(leak);
    }
    // Months only: no day-precise date is published.
    expect(cv?.history?.firstMonth).toBe("2024-02");
    expect(cv?.history?.lastMonth).toBe("2025-06");
  });
});

describe("public company Living CV — the server path", () => {
  const reader = src("lib/organization-evidence/public-organization-cv.ts");

  it("reads the organization's own opt-in itself and stops when it is not exactly true", () => {
    expect(reader).toMatch(/\.select\("public_profile_enabled"\)/);
    expect(reader).toMatch(/public_profile_enabled !== true\)\s*\{\s*return null;/);
  });

  it("returns only the gated model's output", () => {
    const returns = [...reader.matchAll(/^\s*return\s+([^;]+);/gm)].map((m) => m[1].trim());
    const top = returns.filter((r) => r !== "null" && !r.startsWith("buildCompanyWorkHistory("));
    expect(top.every((r) => r.startsWith("buildPublicOrganizationCv("))).toBe(true);
  });

  it("one service-role read per organization per few minutes: the page gets only the cached export", () => {
    // R2 P2 on #3464: the uncached read ran the whole evidence + journal read per anonymous hit.
    expect(reader).toMatch(/export const readPublicOrganizationCv = unstable_cache\(\s*readPublicOrganizationCvUncached,/);
    expect(reader).not.toMatch(/export\s+(async\s+)?function\s+readPublicOrganizationCvUncached/);
    const seconds = Number(/PUBLIC_CV_REVALIDATE_SECONDS = (\d+)/.exec(reader)?.[1]);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(600);
    expect(reader).toMatch(/revalidate: PUBLIC_CV_REVALIDATE_SECONDS/);
    // A cached function may not read the request: the journal day is passed in.
    expect(reader).toMatch(/readOrganizationJournal\(admin as never, organizationId, resolveWorkToday\(\{ timeZone: null \}\)\)/);
    const component = src("components/app/organization/public-organization-cv.tsx");
    expect(component).toContain('import { readPublicOrganizationCv } from "@/lib/organization-evidence/public-organization-cv";');
  });

  it("the service-role read path is used by this module alone", () => {
    const users = execSync("git grep -l queryEvidenceRecords -- 'lib' 'app' 'components'", { cwd: WEB })
      .toString()
      .trim()
      .split("\n")
      .filter((f) => !f.endsWith(".test.ts"));
    expect(users.sort()).toEqual(
      ["lib/organization-evidence/import-core.ts", "lib/organization-evidence/public-organization-cv.ts"].sort(),
    );
  });

  it("the public page renders it only through the gated component", () => {
    const page = src("app/[locale]/business/[slug]/page.tsx");
    expect(page).toContain("<PublicOrganizationCv organizationId={profile.id}");
    expect(page).not.toMatch(/readPublicOrganizationCv|readOrganizationJournal|queryEvidenceRecords/);
  });

  it("switching the profile on says that these totals go public (consent)", () => {
    const panel = src("components/app/business-public-profile-panel.tsx");
    expect(panel).toContain('t("cv.enableHint")');
    const en = JSON.parse(src("messages/en.json")).businessProfile.cv.enableHint as string;
    expect(en).toMatch(/at least 5 people/);
    expect(en).toMatch(/Never names/);
  });
});
