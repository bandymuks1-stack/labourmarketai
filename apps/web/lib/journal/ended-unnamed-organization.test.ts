import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  endedUnnamedOrganizationContexts,
  isEndedUnnamedOrganization,
} from "@/lib/journal/engagement-label";
import {
  deriveProfessionalExperience,
  type ExperienceRelationship,
} from "@/lib/journal/professional-experience";
import { deriveIndependentReviewResult } from "@/lib/journal/review-status";
import { deriveWorkIntelligence, type WorkIntelligenceEntry } from "@/lib/journal/work-intelligence";

/**
 * AN ORGANIZATION WITHOUT A NAME THE PERSON NO LONGER WORKS WITH IS RENAMED,
 * NEVER HIDDEN (owner decision 2026-11-15, #3356).
 *
 * The case: the 2026-09-23 consolidation retired a test organization with no
 * name and ended the person's engagement there. That engagement holds journal
 * entries a manager confirmed. Hiding it moved those hours to the personal
 * row — a false source (decision 0025) — so the row stays and is named for
 * what the person's own rows can tell. Once the relationship has ended the
 * organization row is outside the person's RLS: the reading gets no name and
 * no archive flag, only the person's own engagement row with its end date.
 * Every fixture here is shaped that way.
 */

const SUBJECT = "profile-person";
const ORG_SHELL = "org-shell";
const CTX_SHELL = "ctx-shell-ended";
const CTX_PERSONAL = "ctx-personal";

const ended = { endedAt: "2026-09-23", current: false };

describe("the rule: an organization, no name, every relationship ended", () => {
  it("is such an organization", () => {
    expect(isEndedUnnamedOrganization({ organizationId: ORG_SHELL, organizationName: null, relationships: [ended] })).toBe(true);
  });
  it("a blank name is no name", () => {
    expect(isEndedUnnamedOrganization({ organizationId: ORG_SHELL, organizationName: "  ", relationships: [ended] })).toBe(true);
  });
  it("a named organization keeps its name (a business that closed is still named)", () => {
    expect(isEndedUnnamedOrganization({ organizationId: ORG_SHELL, organizationName: "Closed Ltd", relationships: [ended] })).toBe(false);
  });
  it("no organization is the person's own records, never 'an organization'", () => {
    expect(isEndedUnnamedOrganization({ organizationId: null, organizationName: null, relationships: [ended] })).toBe(false);
  });
  it("a relationship without an end date has not ended", () => {
    expect(isEndedUnnamedOrganization({ organizationId: ORG_SHELL, organizationName: null, relationships: [{ endedAt: null }] })).toBe(false);
  });
  it("a row a reader marks current has not ended, whatever date it carries", () => {
    expect(
      isEndedUnnamedOrganization({ organizationId: ORG_SHELL, organizationName: null, relationships: [{ endedAt: "2026-09-23", current: true }] }),
    ).toBe(false);
  });
  it("no relationship at all says nothing", () => {
    expect(isEndedUnnamedOrganization({ organizationId: ORG_SHELL, organizationName: null, relationships: [] })).toBe(false);
  });
});

const role = (patch: Partial<ExperienceRelationship>): ExperienceRelationship => ({
  engagementContextId: CTX_SHELL,
  organizationId: ORG_SHELL,
  organizationName: null,
  relationship: "employee",
  title: null,
  startedAt: null,
  endedAt: "2026-09-23",
  current: false,
  source: "engagement",
  businessPeriods: [],
  ...patch,
});

describe("which CV rows it names (judged per organization)", () => {
  it("the ended engagement in an organization without a name", () => {
    expect([...endedUnnamedOrganizationContexts([role({})])]).toEqual([CTX_SHELL]);
  });
  it("not while another role in the same organization is current", () => {
    const current = role({ engagementContextId: null, relationship: "manager", endedAt: null, current: true, source: "membership" });
    expect(endedUnnamedOrganizationContexts([role({}), current]).size).toBe(0);
  });
  it("a name on any of the organization's rows is its name", () => {
    expect(endedUnnamedOrganizationContexts([role({}), role({ engagementContextId: "ctx-2", organizationName: "Closed Ltd" })]).size).toBe(0);
  });
  it("the person's own context (no organization) is never one", () => {
    expect(endedUnnamedOrganizationContexts([role({ engagementContextId: CTX_PERSONAL, organizationId: null })]).size).toBe(0);
  });
  it("unreadable relationships name nothing: the rows keep their earlier heading", () => {
    expect(endedUnnamedOrganizationContexts(null).size).toBe(0);
    expect(endedUnnamedOrganizationContexts(undefined).size).toBe(0);
  });
});

type Metric = WorkIntelligenceEntry["metrics"][number];
const metric = (metric_slug: string, value_numeric: number | null, value_text: string | null, unit_slug: string | null): Metric =>
  ({ metric_slug, value_numeric, value_text, unit_slug, source: "worker_input", created_at: "2026-05-30T09:00:00Z" }) as Metric;
const confirmedByManager = [
  {
    confirmation_scope: { action: "confirm", decision: "approved" },
    created_at: "2026-05-30T09:10:01Z",
    confirmer_role: "owner",
    confirmer_id: "profile-manager",
  },
];
const entry = (id: string, ctx: string, hours: number, date: string, confirmations: typeof confirmedByManager | null): WorkIntelligenceEntry => ({
  entryId: id,
  createdAt: `${date}T09:00:00Z`,
  metrics: [metric("quantity", hours, null, "hours"), metric("work_date", null, date, null)],
  engagementContextId: ctx,
  projectId: null,
  reviewResult: deriveIndependentReviewResult(confirmations, SUBJECT),
  linkedSkillIds: [],
});

describe("through the one experience reading (decision 0025): the hours keep their source", () => {
  const wi = deriveWorkIntelligence({
    entries: [entry("e-shell", CTX_SHELL, 3, "2026-05-30", confirmedByManager), entry("e-own", CTX_PERSONAL, 2, "2026-06-02", null)],
    skills: [],
    todayIso: "2026-11-15",
    focus: "all",
    organizationRecords: [],
    organizationPeriodRecords: [],
  });
  // What the person's own reader hands over for that engagement: no name (the
  // organization row is not readable any more), its own end date.
  const exp = deriveProfessionalExperience({ wi, relationships: [role({})] });

  it("the engagement's hours stay on the organization's row, not on the person's own records", () => {
    const shell = exp.organizations.find((o) => o.organizationId === ORG_SHELL);
    expect(shell, "the organization row is kept").toBeDefined();
    expect(shell!.journalHours).toBe(3);
    expect(shell!.journalConfirmedHours, "the manager's confirmation stays with them").toBe(3);
    expect(shell!.entries).toBe(1);
    const own = exp.organizations.find((o) => o.kind === "personal");
    expect(own?.journalHours).toBe(2);
    expect(exp.hours?.journal).toBe(5);
  });

  it("that row, and only that row, is named as an earlier organization without a name", () => {
    const named = exp.organizations.filter((o) =>
      isEndedUnnamedOrganization({ organizationId: o.organizationId, organizationName: o.organizationName, relationships: o.roles }),
    );
    expect(named.map((o) => o.organizationId)).toEqual([ORG_SHELL]);
    expect([...endedUnnamedOrganizationContexts(exp.roles)]).toEqual([CTX_SHELL]);
  });
});

const web = process.cwd();
const read = (rel: string) => readFileSync(join(web, rel), "utf8");

describe("the phrase, in every catalog", () => {
  for (const loc of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
    it(`${loc}: journal.unnamedOrganization.ended is real text, not the plain "without a name"`, () => {
      const j = JSON.parse(read(`messages/${loc}/journal.json`)) as { unnamedOrganization: Record<string, string> };
      const phrase = j.unnamedOrganization.ended;
      expect(typeof phrase === "string" && phrase.trim().length > 0).toBe(true);
      expect(phrase).not.toBe(j.unnamedOrganization.other);
    });
  }
});

describe("every surface that names this row uses the one rule and the one phrase", () => {
  const surfaces: [string, RegExp][] = [
    ["app/[locale]/cv/page.tsx", /endedUnnamedOrganizationContexts\(cv\.professionalExperience\?\.roles\)/],
    ["lib/cv/athlete-profile.ts", /endedUnnamedOrganizationContexts\(pe\?\.roles\)/],
    ["components/app/work-in-numbers/experience-scale.tsx", /isEndedUnnamedOrganization\(\{/],
    ["app/[locale]/dashboard/profile/page.tsx", /endedUnnamedOrganizationContexts\(/],
  ];
  for (const [file, rule] of surfaces) {
    it(file, () => {
      const src = read(file);
      expect(src).toMatch(rule);
    });
  }
  it("the phrase is read from journal.unnamedOrganization.ended on each page", () => {
    for (const f of [
      "app/[locale]/cv/page.tsx",
      "components/app/cv/athlete-profile-page.tsx",
      "components/app/work-in-numbers/experience-scale.tsx",
      "app/[locale]/dashboard/profile/page.tsx",
    ]) {
      expect(read(f), f).toContain('tJournal("unnamedOrganization.ended")');
    }
  });
});
