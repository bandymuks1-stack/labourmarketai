import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WORK INTELLIGENCE + UNIVERSAL JOURNAL GUARD (issue #1689).
 *
 * What this protects, so the regressions this slice fixed cannot recur:
 *  1. the journal page derives its day totals through THE canonical
 *     work-time rule — never again from the entry-level metric alone (the
 *     three-answers defect: 0 h / 5 h / 9 h for one day);
 *  2. every figure the "work in numbers" section shows comes from the one
 *     attribution model, and that model never emits a person score, rating
 *     or rank (doctrine §19; owner rule §5 — no fabricated skill-hours);
 *  3. the section exposes no internal vocabulary to the person;
 *  4. the Living CV and the conversation read the SAME model — no second
 *     hours derivation anywhere in the app;
 *  5. the universal journal model stays data: no profession/ISCO switch
 *     statement in lib/journal, and the ISCO map covers every sub-major
 *     group (the full world of work, not the professions we happen to see);
 *  6. the i18n namespace exists in every active locale;
 *  7. plausibility checks (owner §13) WARN and never corrupt: the check
 *     module is pure and reads the canonical lines, no figure depends on a
 *     check, an acknowledgement is one append-only worker row with a reason,
 *     an acknowledged check stays visible, and both intake surfaces show
 *     the saved record's day check;
 *  8. the organization view (owner §14) composes the SAME reader and the
 *     SAME component for a member on the person page — scope is the
 *     database's org-manager RLS branch, never a filter, an admin client or
 *     a second timesheet read — and shows the organization nothing that is
 *     the person's own: no checks / acknowledgements, no adjacent
 *     directions, no diary deep links, no CV consequence links.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

const page = read("app/[locale]/dashboard/journal/page.tsx");
const component = read("components/app/journal-work-intelligence.tsx");
const model = read("lib/journal/work-intelligence.ts");
const cv = read("lib/cv-export/verified-cv.ts");
const workflows = read("lib/ai-workspace/workflows.ts");
const plausibility = read("lib/journal/work-time-plausibility.ts");
const plausibilityAction = read("lib/journal/work-time-plausibility-actions.ts");
const plausibilityRead = read("lib/journal/work-time-plausibility-read.ts");
const writeCore = read("lib/journal/journal-write-core.ts");
const worklogFlow = read("components/app/conversation/worker-worklog-flow.tsx");
const composer = read("components/app/journal-entry-composer.tsx");
const ackForm = read("components/app/journal-work-time-check-ack.tsx");
const reader = read("lib/journal/work-intelligence-read.ts");
const personPage = read("app/[locale]/dashboard/people/[workerId]/page.tsx");

describe("1 · one hours rule", () => {
  it("the journal page's day totals go through deriveEntryWorkTime", () => {
    expect(page).toContain('import { deriveEntryWorkTime } from "@/lib/journal/work-time"');
    expect(page).toMatch(/deriveEntryWorkTime\(\{\s*entryId: e\.id/);
  });
  it("the old entry-level-only computation is gone", () => {
    expect(page).not.toMatch(/timeMetric\?\.value_numeric/);
    expect(page).not.toMatch(/\(m\.metric_slug === "quantity" \|\| m\.metric_slug === "area_done"\) &&/);
  });
  it("no other module in the app sums journal hours on its own", () => {
    // The only places allowed to turn metrics into hours are the canonical
    // rule and the SQL mirror the canonical guard already pins.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".next") continue;
          walk(rel);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
        if (rel === "lib/journal/work-time.ts") continue;
        const body = read(rel);
        // A local "hours ? value * 60 : value" conversion over a metric row is
        // the shape of the defect this guard exists to prevent.
        if (/unit_slug === "hours"\s*\?\s*[a-zA-Z_.?]+value_numeric\s*\*\s*60/.test(body)) {
          offenders.push(rel);
        }
      }
    };
    walk("app");
    walk("lib");
    walk("components");
    expect(offenders).toEqual([]);
  });
});

describe("2 · the model is honest by construction", () => {
  it("attributes hours to a skill ONLY when it is the single linked skill, or the link names the fragment", () => {
    expect(model).toMatch(/if \(n > 1\) return "shared";/);
    expect(model).toMatch(/if \(n === 0\) return "none";/);
    // one linked skill but several kinds of work in the fragments → involvement
    expect(model).toMatch(/activities\.size > 1 \? "multi_activity" : "attributed"/);
    // a fragment is claimed only when EXACTLY ONE linked skill sits on it
    // (`fragment_skill` rows) — never split by guess, never by an unlinked row
    expect(model).toMatch(/if \(claimants\.size === 1\)/);
    expect(model).toMatch(/if \(id && linked\.has\(id\)\) claimants\.add\(id\);/);
    expect(model).toContain("fragmentSkillsByIndex(entry.metrics)");
  });
  it("the fragment → skill evidence is written by the pipeline and the worker's confirmation, never by the model", () => {
    // the model stays pure: it reads the rows, it never writes anything
    expect(model).not.toMatch(/\.from\(|\.insert\(|\.upsert\(|createClient/);
    const pipeline = read("lib/journal/skill-pipeline.ts");
    const actions = read("lib/journal/skill-pipeline-actions.ts");
    expect(pipeline).toContain("mapRecognitionToPersistedFragments(");
    expect(actions).toContain("recordFragmentSkillEvidence(ctx,");
    // the row states where a link came from — it is never a link itself
    expect(pipeline).not.toMatch(/fragment_skill[\s\S]{0,400}journal_entry_skills/);
  });
  it("never emits a person score, rating, rank or tier field", () => {
    const typeBlock = model.slice(model.indexOf("export type WorkIntelligence = {"));
    const fieldNames = [...typeBlock.matchAll(/readonly (\w+):/g)].map((m) => m[1]!.toLowerCase());
    for (const f of fieldNames) {
      expect(f, f).not.toMatch(/score|rating|rank|ovr/);
      expect(f, f).not.toMatch(/strength$/);
    }
  });
  it("days-unit durations are kept apart from hours in every period row", () => {
    expect(model).toContain("dayUnits: round2(dayUnits)");
    expect(model).toContain("totalDayUnits");
  });
});

describe("3 · no internal vocabulary reaches the person", () => {
  it("the section renders no raw table, slug or enum names", () => {
    // JSX text nodes and string literals inside the component must not carry
    // schema words; the data-* attributes and i18n keys are not user copy.
    const withoutAttrs = component.replace(/data-[a-z-]+=\{[^}]*\}|data-[a-z-]+="[^"]*"/g, "");
    const withoutComments = withoutAttrs.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    for (const word of [
      "journal_entry_skills",
      "fragment_time",
      "worker_input",
      "ai_extracted",
      "manager_corrected",
      "journal_entry_metrics",
      "engagement_context",
    ]) {
      expect(withoutComments.includes(`>${word}`) || withoutComments.includes(`"${word}"`), word).toBe(false);
    }
  });
  it("every visible sentence is an i18n key from journal.intelligence", () => {
    expect(component).toContain('getTranslations("journal.intelligence")');
    expect(component).not.toMatch(/>\s*[A-Z][a-z]+ [a-z]+ [a-z]+/); // no inline English prose
  });
});

describe("4 · one model, three surfaces", () => {
  it("the Living CV reads recorded hours through the same reader", () => {
    expect(cv).toContain('from "@/lib/journal/work-intelligence-read"');
    expect(cv).toContain("attributedHoursBySlug(");
    expect(cv).toContain("recordedHoursBySkill");
  });
  it("the conversation's figures answer reads the same model and no longer denies an hours figure", () => {
    expect(workflows).toContain("loadOwnWorkIntelligence()");
    expect(workflows).not.toContain('t("figuresNoHoursLedger")');
  });
  it("the recent-journal answer looks BACK in time, not forward", () => {
    expect(workflows).toMatch(/isoDayMinus\(todayIso, RECENT_JOURNAL_DAYS - 1\)/);
    expect(workflows).not.toMatch(/visibleRange\("agenda"/);
  });
});

describe("5 · one journal for the full world of work", () => {
  it("lib/journal carries no profession or ISCO switch statement", () => {
    for (const entry of readdirSync(join(root, "lib/journal"))) {
      if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
      const body = read(`lib/journal/${entry}`);
      expect(body, entry).not.toMatch(/switch\s*\(\s*(profession|isco|occupation)/i);
    }
  });
  it("the archetype model is data keyed on ISCO groups, and its guard tests exist", () => {
    const archetypes = read("lib/journal/work-evidence-archetypes.ts");
    expect(archetypes).toContain("export const ISCO_ARCHETYPES");
    expect(archetypes).toContain("export function composeJournal(");
    expect(archetypes).toContain("export const ISCO_SUB_MAJOR_GROUPS");
    expect(readdirSync(join(root, "lib/journal"))).toContain("work-evidence-archetypes.test.ts");
  });
});

describe("6 · i18n in every active locale", () => {
  const REQUIRED = [
    "title",
    "period.today",
    "period.week",
    "period.month",
    "period.year",
    "period.all",
    "mainActivity",
    "evidenceStrength",
    "sharedHours",
    "unattributedHours",
    "skillsHint",
    "directionsHint",
    "provenanceRule",
    "checks.title",
    "checks.hint",
    "checks.day_over_24h",
    "checks.long_day",
    "checks.line_over_24h",
    "checks.entry_duration_ignored",
    "checks.acknowledged",
    "checks.ackOpen",
    "checks.openInJournal",
  ];
  for (const loc of ["lt", "en", "ru", "nl", "de"] as const) {
    it(`${loc}: journal.intelligence carries the required keys with real text`, () => {
      const j = JSON.parse(read(`messages/${loc}/journal.json`)) as Record<string, unknown>;
      const intel = j.intelligence as Record<string, unknown>;
      for (const key of REQUIRED) {
        const value = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], intel);
        expect(typeof value === "string" && value.trim().length > 0, `${loc}.intelligence.${key}`).toBe(true);
      }
      const base = JSON.parse(read(`messages/${loc}.json`)) as Record<string, Record<string, Record<string, unknown>>>;
      expect(typeof base.cvExport!.recordedHours).toBe("string");
      expect(typeof base.workspace!.ai!.figuresWorkerHours).toBe("string");
      expect(typeof base.conversation!.chat!.chipJournalNumbers).toBe("string");
    });
  }
});

describe("7 · plausibility checks warn, never corrupt (owner §13)", () => {
  it("the check module is pure and reads only the canonical lines", () => {
    expect(plausibility).not.toMatch(/from "@\/lib\/supabase|server-only|fetch\(|new Date\(\)/);
    expect(plausibility).toContain('import type { EntryWorkTime, WorkTimeMetricRow } from "@/lib/journal/work-time"');
    // the thresholds are named facts, not buried numbers
    expect(plausibility).toContain("export const HOURS_IN_A_DAY = 24");
    expect(plausibility).toMatch(/export const LONG_DAY_HOURS = \d+/);
  });
  it("no figure in the model depends on a check — checks are derived last, from the same scoped lines", () => {
    const checksAt = model.indexOf("const checks = deriveWorkTimeChecks(");
    expect(checksAt).toBeGreaterThan(model.indexOf("const periods: WorkPeriodTotals[]"));
    expect(checksAt).toBeGreaterThan(model.indexOf("const provenance = {"));
    expect(model).toMatch(/checks,\s*totalHours: all\.hours/);
    // nothing caps, drops or rescales a line because of a check
    expect(model).not.toMatch(/HOURS_IN_A_DAY|LONG_DAY_HOURS|Math\.min\([^)]*hours/);
  });
  it("an acknowledgement is ONE append-only worker row with a reason — never an update, delete or figure change", () => {
    expect(plausibilityAction).toContain('"use server"');
    expect(plausibilityAction).toContain("metric_slug: WORK_TIME_OVERRIDE_METRIC_SLUG");
    expect(plausibilityAction).toContain('source: "worker_input"');
    expect(plausibilityAction).toContain("normalizeOverrideReason(");
    expect(plausibilityAction).not.toMatch(/\.update\(|\.delete\(|\.upsert\(|value_numeric/);
    expect(plausibilityAction).not.toMatch(/service_role|createAdminClient|admin/i);
    // only the worker's own row acknowledges; the pipeline cannot wave a check through
    expect(plausibility).toContain('if (m.source !== "worker_input") continue;');
  });
  it("an acknowledged check stays visible with its reason — the section never hides it", () => {
    expect(component).toContain("ackedChecks.map((c) =>");
    expect(component).toContain('t("checks.acknowledged"');
    expect(component).toContain("data-open-checks={openChecks.length}");
    expect(ackForm).toContain("acknowledgeWorkTimeCheck(");
  });
  it("both intake surfaces show the saved record's day check, read AFTER the save from the same journal read", () => {
    expect(writeCore).toContain("readSavedEntryDayCheck(");
    expect(plausibilityRead).toContain("listJournalEntries(caller, { workerId })");
    expect(plausibilityRead).toContain("deriveEntryWorkTime({");
    expect(worklogFlow).toContain('data-testid="worklog-day-check"');
    expect(composer).toContain('data-testid="journal-saved-day-check"');
  });
});

describe("8 · the organization view composes the same reader (owner §14)", () => {
  it("the person page loads the member's model through loadWorkIntelligence — no second hours read", () => {
    expect(personPage).toContain('import { loadWorkIntelligence } from "@/lib/journal/work-intelligence-read"');
    expect(personPage).toContain('import { JournalWorkIntelligence } from "@/components/app/journal-work-intelligence"');
    expect(personPage).toContain('audience="organization"');
    expect(personPage).not.toMatch(/journal_entry_metrics|fragment_time|deriveEntryWorkTime|work_hour_allocations|timesheets/);
  });
  it("scope is the database's: the reader filters by worker id only and uses no admin client", () => {
    expect(reader).toContain('listJournalEntries(caller, { workerId })');
    expect(reader).not.toMatch(/service_role|createAdminClient|createServiceClient|engagement_context_id\s*[,)]/);
    expect(personPage).not.toMatch(/service_role|createAdminClient|createServiceClient/);
  });
  it("the section is composed only for a viewer who already sees an engagement with the person — never 'no work' about a stranger", () => {
    expect(personPage).toMatch(/recordedWork\.status === "ok" && recordedWork\.entries\.length > 0\s*\?\s*await loadWorkIntelligence\(/);
  });
  it("the organization sees no checks, no acknowledgements, no directions, no diary links and no CV consequence", () => {
    expect(component).toContain('export type WorkIntelligenceAudience = "self" | "organization";');
    expect(component).toContain('const org = audience === "organization";');
    expect(component).toContain("{!org && wi.checks.length > 0 && (");
    expect(component).toContain("workerSkillSlugs: org ? [] : evidenced,");
    expect(component).toMatch(/\{org \? \(\s*<span[^>]*data-testid=\{`wi-skill-name-\$\{s\.slug\}`\}/);
    expect(component).toMatch(/\{org \? \(\s*<p[\s\S]*?data-testid="wi-org-scope"/);
    expect(component).toContain('t("org.scopeNote")');
    // the period tiles point at the surface they sit on, never at someone else's diary by default
    expect(component).toContain("periodHref?: (key: WorkPeriodKey) => string;");
    expect(personPage).toMatch(/periodHref: \(key\) =>\s*`\/dashboard\/people\/\$\{workerId\}\?period=\$\{key\}#work-intelligence`/);
  });
  it("the organization wording exists in every active locale, addressed to the organization, not to 'you' the worker", () => {
    for (const loc of ["lt", "en", "ru", "nl", "de"] as const) {
      const j = JSON.parse(read(`messages/${loc}/journal.json`)) as Record<string, unknown>;
      const org = (j.intelligence as Record<string, unknown>).org as Record<string, unknown>;
      for (const key of [
        "title",
        "subtitle",
        "emptyNoEntries",
        "emptyNoHours",
        "evidenceStrength",
        "skillsHint",
        "unattributedHours",
        "provenance",
        "provenanceRule",
        "scopeNote",
      ]) {
        expect(typeof org?.[key] === "string" && (org[key] as string).trim().length > 0, `${loc}.intelligence.org.${key}`).toBe(true);
      }
    }
    const en = JSON.parse(read("messages/en/journal.json")) as { intelligence: { org: Record<string, string> } };
    expect(en.intelligence.org.provenance).not.toMatch(/\bby you\b/);
    expect(en.intelligence.org.scopeNote).toMatch(/not a rating/);
  });
});
