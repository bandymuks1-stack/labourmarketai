import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ONE PERSON = ONE CONTINUOUS PROFESSIONAL HISTORY (decision 0025, 2026-10-17).
 *
 * What this protects:
 *  1. every surface that states a person's experience reads the ONE reading
 *     (`deriveProfessionalExperience`) — no second total arithmetic anywhere;
 *  2. the reading is pure, reads no finance, and never attributes an
 *     organization's records about other people to a leader;
 *  3. roles (ownership / management) reach the reading through the one
 *     membership spine and carry no hours;
 *  4. a confirmation state never filters a line out;
 *  5. the copy exists in every locale the Work-in-Numbers block is published in.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
const code = (rel: string) =>
  read(rel)
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");

const reading = read("lib/journal/professional-experience.ts");
const reader = read("lib/journal/professional-experience-read.ts");
const scale = read("components/app/work-in-numbers/experience-scale.tsx");
const station = read("app/[locale]/dashboard/work-in-numbers/page.tsx");
const section = read("components/app/journal-work-intelligence.tsx");
const cvBuilder = read("lib/cv-export/verified-cv.ts");
const cvPage = read("app/[locale]/cv/page.tsx");
const profilePage = read("app/[locale]/dashboard/profile/page.tsx");
const identityFacts = read("lib/player-card/identity-facts.ts");
const model = read("lib/journal/work-intelligence.ts");
const capabilities = read("lib/capabilities/domain-action-capabilities.ts");

describe("1 · one reading, every surface", () => {
  it("the experience scale derives the total through the one reading and does no arithmetic of its own", () => {
    expect(scale).toContain('from "@/lib/journal/professional-experience"');
    expect(scale).toMatch(/deriveProfessionalExperience\(\{ wi, relationships, projectNames \}\)/);
    expect(scale).toContain('testId="wi-experience-total"');
    expect(scale).not.toMatch(/all\.hours \+|\+ orgHours|\.reduce\(\(s, l\) => s \+ l\.hours/);
  });
  it("the station and the shared section hand the scale the person's relationships", () => {
    expect(station).toContain("readOwnExperienceRelationships(supabase, user.id)");
    expect(station).toContain("<ExperienceScale wi={wi} locale={locale} t={t} relationships={relationships} />");
    expect(section).toContain("relationships?: readonly ExperienceRelationship[] | null;");
    expect(section).toContain("<ExperienceScale wi={wi} locale={locale} t={t} relationships={relationships} />");
  });
  it("the Living CV carries the reading as data (so the MCP cv.verified.get states the same history) and prints its total", () => {
    expect(cvBuilder).toContain("professionalExperience: ProfessionalExperience | null;");
    expect(cvBuilder).toMatch(/professionalExperience: workIntelligence\s*\?\s*deriveProfessionalExperience\(\{/);
    expect(cvBuilder).toContain("readOwnExperienceRelationships(supabase, user.id)");
    expect(capabilities).toMatch(/read\("cv\.verified\.get"[\s\S]*?buildVerifiedCv\(\)/);
    expect(cvPage).toContain('data-testid="cv-professional-experience-total"');
    expect(cvPage).toContain('tPremium("facts.experienceTotal")');
    expect(cvPage).toMatch(/const experienceTotal = cv\.professionalExperience\?\.hours \?\? null;/);
  });
  it("the profile fact strip states the same total, derived by the same function", () => {
    expect(profilePage).toContain("readOwnExperienceRelationships(supabase, user.id)");
    expect(profilePage).toMatch(/deriveProfessionalExperience\(\{ wi: workIntelligence, relationships: experienceRelationships \}\)\.hours/);
    expect(identityFacts).toContain('testid: "player-card-fact-experience-total"');
    expect(identityFacts).toContain('label: t("experienceTotal")');
  });
  it("no surface re-adds journal and organization hours by hand", () => {
    for (const [name, src] of [
      ["cv page", cvPage],
      ["profile page", profilePage],
      ["identity facts", identityFacts],
      ["station", station],
    ] as const) {
      expect(src, name).not.toMatch(/recordedHoursTotal\s*\+\s*|organizationHistoryHours\s*\+\s*|\+\s*organizationHistoryHours|totalHours\s*\+\s*organization/);
    }
  });
});

describe("2 · the reading is pure, finance-free and person-scoped", () => {
  it("is pure: no IO, no clock, no i18n", () => {
    expect(reading).not.toMatch(/from "@\/lib\/supabase|server-only|fetch\(|new Date\(|getTranslations|console\./);
  });
  it("reads no invoice, payment or settlement anywhere on the path", () => {
    for (const f of ["lib/journal/professional-experience.ts", "lib/journal/professional-experience-read.ts"]) {
      expect(code(f), f).not.toMatch(/finance_records|invoice|lmc_transactions|payment|paid_at|settlement/i);
    }
  });
  it("the relationships reader reads the person's OWN rows only — never an organization's records about other people, never organization-wide hours", () => {
    expect(reader).toMatch(/\.from\("engagement_contexts"\)[\s\S]*?\.eq\("profile_id", userId\)/);
    expect(reader).not.toMatch(/organization_evidence_records|work_hour_allocations|organization_people|evidence_import|service_role|createAdminClient/);
    expect(reader).toContain("readMyLedOrganizations()");
  });
  it("roles come from the membership spine and carry no hours in the reading", () => {
    expect(reader).toMatch(/\.in\("relationship_slug", \[\.\.\.PROFESSIONAL_HISTORY_RELATIONSHIPS, \.\.\.LEADERSHIP_RELATIONSHIPS\]\)/);
    expect(reader).toContain('const LEADERSHIP_RELATIONSHIPS = ["manager"] as const;');
    // an ExperienceRelationship has no hours field at all
    const relType = reading.slice(reading.indexOf("export type ExperienceRelationship = {"), reading.indexOf("export type ExperienceHourSource"));
    expect(relType).not.toMatch(/hours/i);
    // organization lines come from the person's own ledger in the model, keyed by their linked roster rows
    expect(reading).toMatch(/wi\.organizationDayRecords \?\? wi\.organizationContextRecords/);
    expect(reading).toContain("wi.organizationPeriodRecords");
  });
  it("a confirmation state never filters a line out; the confirmed part is a sub-figure", () => {
    expect(reading).not.toMatch(/reviewResult|confirmedHours > 0 \? [^:]*: null|\.filter\([^)]*confirmed/);
    expect(reading).toContain("journalConfirmed: round2(journalConfirmed)");
  });
  it("every not-counted line names its reason; the three reasons are the only ones", () => {
    expect(reading).toMatch(/"describes_journal_entry"\s*\|\s*"period_spans_day_records"\s*\|\s*"journal_within_organization_period"/);
    expect(reading).toContain('notCountedReason: a.describesJournal ? "describes_journal_entry" : null');
    expect(reading).toContain('notCountedReason: spansDayRecords ? "period_spans_day_records" : null');
    expect(reading).toContain('notCountedReason: counted ? null : "journal_within_organization_period"');
  });
  it("the model's all-time journal lines are NOT focus-scoped and are keyed on the model's own entries", () => {
    const at = model.indexOf("const allTimeAcc = new Map<");
    expect(at).toBeGreaterThan(0);
    const block = model.slice(at, model.indexOf("const entryIds ="));
    expect(block).toMatch(/for \(const d of derived\)/);
    expect(block).not.toMatch(/scoped/);
    expect(model).toContain("const entryIds = derived.map((d) => d.entry.entryId).sort();");
  });
});

describe("3 · copy in every published locale", () => {
  const KEYS = [
    "totalLabel",
    "totalSub",
    "totalSubJournalOnly",
    "totalSource",
    "totalSourceConfirmed",
    "ruleOnce",
    "rulePeriods",
    "ruleRoles",
    "breakdownTitle",
    "personalRecords",
    "orgUnnamed",
    "rowJournal",
    "rowJournalConfirmed",
    "rowOrganization",
    "rowSpan",
    "rowNoHours",
    "roleNow",
    "roleDatesNotRecorded",
    "businessPeriod",
    "datesNotDocumented",
    "projectsTitle",
    "projectUnnamed",
    "notCountedTitle",
    "notCounted.describes_journal_entry",
    "notCounted.period_spans_day_records",
    "notCounted.journal_within_organization_period",
    "rolesUnknown",
    "source.journal",
    "source.organization_day",
    "source.organization_period",
  ];
  for (const loc of ["lt", "en", "ru", "nl", "de", "pl"] as const) {
    it(`${loc}: journal.intelligence.experience, cvExport and playerCard.identity carry the keys with real text`, () => {
      const j = JSON.parse(read(`messages/${loc}/journal.json`)) as { intelligence: { experience: Record<string, unknown> } };
      const exp = j.intelligence.experience;
      for (const key of KEYS) {
        const value = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], exp);
        expect(typeof value === "string" && value.trim().length > 0, `${loc}.experience.${key}`).toBe(true);
      }
      // the old contradiction is gone
      expect(exp.ruleSeparate).toBeUndefined();
      const base = JSON.parse(read(`messages/${loc}.json`)) as {
        cvExport: { premium: { facts: Record<string, string> }; professionalExperienceTotal: string; professionalExperienceNotCounted: string };
        playerCard: { identity: Record<string, string> };
      };
      expect(base.cvExport.premium.facts.experienceTotal).toMatch(/\S/);
      expect(base.cvExport.professionalExperienceTotal).toContain("{total}");
      expect(base.cvExport.professionalExperienceNotCounted).toContain("{hours}");
      expect(base.playerCard.identity.experienceTotal).toMatch(/\S/);
    });
  }
});
