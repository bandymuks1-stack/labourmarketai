import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { moduleGroupsFor } from "../journal/journal-module-fields";
import {
  ISCO_ARCHETYPES,
  JOURNAL_MODULES,
  RELATIONSHIP_ARCHETYPES,
} from "../journal/work-evidence-archetypes";

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
 *     directions, no diary deep links, no CV consequence links;
 *  9. the SECOND hour ledger (owner §19, re-audit F7) — the organization's
 *     timesheet lines and imported documents in `work_hour_allocations` —
 *     is read by the SAME reader through the one RLS-scoped allocation
 *     read, kept apart from every journal figure (never summed into a
 *     period, never attributed to a skill), named by provenance on the
 *     section, the CV and the chat, and fed into the day check so "an
 *     imported timesheet on top of a live record" is caught by arithmetic
 *     rather than claimed in a comment;
 * 10. the five rules the re-audit pinned (2026-09-11, F8–F12): no consumer
 *     sums per-skill involvement; output is counted per unit × kind of
 *     work and every recorded output counts; the work day is the person's
 *     stated day on every intake, and a save-day placement is counted and
 *     said; two skill rows for one slug are one skill; a CV chip names its
 *     base (confirmed vs own record) in words.
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
const reportsPage = read("app/[locale]/dashboard/reports/page.tsx");
const windowReport = read("lib/journal/journal-window-report.ts");
const listCore = read("lib/journal/journal-list-core.ts");
const allocations = read("lib/work-hours/allocations.ts");
const cvPage = read("app/[locale]/cv/page.tsx");
const workTime = read("lib/journal/work-time.ts");
const display = read("lib/time/display.ts");
const personDay = read("lib/time/person-calendar-day.ts");
const workerSchemas = read("lib/conversation/worker-schemas.ts");
const chat = read("components/app/conversation/chat/conversation-chat.tsx");
const compactEditor = read("components/app/journal-entry-compact-editor.tsx");
const capabilities = read("lib/capabilities/registry.ts");

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
    // one linked skill, but the entry's OWN timed fragments say the time was
    // split → involvement. The brake keys on the TIMED PARTS, not on the
    // labels: three timed parts with no kind of work named are still three
    // parts (re-audit 2026-09-11 F4 — the unlabelled path is the majority
    // case in production).
    expect(model).toMatch(/const fragments = time\.lines\.filter\(\(l\) => l\.hours > 0 && l\.derivedFrom === "fragment_time"\);/);
    expect(model).toMatch(/if \(fragments\.length > 1\) \{/);
    expect(model).toMatch(/const oneKindOfWork = labels\.size === 1 && !labels\.has\(""\);/);
    expect(model).toMatch(/if \(!oneKindOfWork\) return "multi_activity";/);
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

describe("9 · the organization's per-member roll-up rides the same model (owner §14)", () => {
  it("the window report derives hours through deriveWorkIntelligence — no second hours arithmetic", () => {
    expect(windowReport).toContain('import { deriveReviewResult } from "@/lib/journal/review-status";');
    expect(windowReport).toMatch(/deriveWorkIntelligence,\s*type WorkIntelligenceEntry,\s*\} from "@\/lib\/journal\/work-intelligence"/);
    expect(windowReport).toContain("export function deriveWindowWorkTime(");
    expect(windowReport).toContain("export function rollUpJournalWindow(");
    // the rule's inputs are never re-implemented here
    expect(windowReport).not.toMatch(/fragment_time|"quantity"|unit_slug === "hours"|deriveEntryWorkTime/);
  });
  it("it embeds the list core's metric and confirmation projection — one select, not a hand-written one", () => {
    expect(listCore).toContain("export const JOURNAL_ENTRY_METRICS_EMBED =");
    expect(listCore).toContain("export const JOURNAL_ENTRY_CONFIRMATIONS_EMBED =");
    expect(listCore).toMatch(/const V3_SELECT = `[^`]*\$\{JOURNAL_ENTRY_METRICS_EMBED\}, \$\{JOURNAL_ENTRY_CONFIRMATIONS_EMBED\}`/);
    // ONE projection, always the list core's — a count-sized read narrows it
    // with a query-time filter, never with a second hand-written embed.
    expect(windowReport).toMatch(/JOURNAL_ENTRY_CONFIRMATIONS_EMBED,\s*JOURNAL_ENTRY_METRICS_EMBED,\s*\]\.join\(", "\)/);
    expect(windowReport).toMatch(/opts\.workTime \? q : q\.eq\("journal_entry_metrics\.metric_slug", "work_date"\)/);
    expect(windowReport).not.toMatch(/journal_entry_metrics\(/);
  });
  it("it reads no skills and no links — an org roll-up answers how much / on what / backed by what", () => {
    expect(windowReport).not.toMatch(/worker_skills|journal_entry_skills|readWorkerEntrySkillLinks/);
    expect(windowReport).toContain("linkedSkillIds: [],");
    expect(windowReport).toContain("skills: [],");
  });
  it("confirmed counts APPROVED entries only; a rejection is returned, never confirmed", () => {
    expect(windowReport).toMatch(/if \(result === "approved"\) bucket\.confirmed \+= 1;\s*else if \(result === "submitted"\) bucket\.awaitingReview \+= 1;\s*else bucket\.returned \+= 1;/);
    // the pre-fix shape: any confirmation row → confirmed
    expect(windowReport).not.toMatch(/confirmedIds/);
  });
  it("work time is null when not measured — the hub tile and the daily panel stay count-sized", () => {
    expect(windowReport).toContain("readonly work: JournalWindowWorkTime | null;");
    expect(windowReport).toMatch(/work: opts\.workTime \? deriveWindowWorkTime\(b\.rows, opts\.todayIso\) : null/);
    expect(read("lib/reports/reports-hub.ts")).toMatch(/getJournalWindowReport\("week"\)/);
    expect(read("lib/planning/organization-today.ts")).toMatch(/getJournalWindowReport\("today", todayIso\)/);
  });
  it("the reports page asks for work time, renders it only when measured, and opens the person page per member", () => {
    expect(reportsPage).toMatch(/getJournalWindowReport\(journalWindowKey, undefined, \{\s*workTime: true,\s*\}\)/);
    expect(reportsPage).toContain("const measured = report.applied && report.totals.work !== null;");
    expect(reportsPage).toMatch(/href=\{`\/dashboard\/people\/\$\{w\.workerId\}` as "\/dashboard"\}/);
    expect(reportsPage).toContain('data-testid="journal-window-total-hours"');
    expect(reportsPage).toContain('data-testid="journal-window-without-duration"');
    expect(reportsPage).not.toMatch(/journal_entry_metrics|fragment_time|deriveEntryWorkTime|original_text/);
  });
  it("the roll-up wording exists in every active locale and names hours, confirmed hours and the returned state", () => {
    for (const loc of ["lt", "en", "ru", "nl", "de"] as const) {
      const base = JSON.parse(read(`messages/${loc}.json`)) as { reports: { journalWindow: Record<string, unknown> } };
      const jw = base.reports.journalWindow;
      const table = jw.table as Record<string, string>;
      for (const key of ["hours", "confirmedHours", "days", "returned"]) {
        expect(typeof table[key] === "string" && table[key]!.trim().length > 0, `${loc}.reports.journalWindow.table.${key}`).toBe(true);
      }
      for (const key of ["hours", "dayUnits", "mainly", "withoutDuration", "basis"]) {
        expect(typeof jw[key] === "string" && (jw[key] as string).trim().length > 0, `${loc}.reports.journalWindow.${key}`).toBe(true);
      }
      expect(jw.hours as string).toContain("{hours}");
      expect(jw.mainly as string).toContain("{activity}");
      expect(jw.withoutDuration as string).toContain("{count, plural,");
    }
    const en = JSON.parse(read("messages/en.json")) as { reports: { journalWindow: { basis: string } } };
    expect(en.reports.journalWindow.basis).toMatch(/counted once/);
    expect(en.reports.journalWindow.basis).toMatch(/approved/);
  });
});

describe("10 · archetype module fields — composed from the relationship, one metric row each (owner §12)", () => {
  /**
   * The universal journal's modules reach the person through the ONE
   * composition contract: the engagement RELATIONSHIP resolves archetypes,
   * `composeJournal` unions their modules, both editors render exactly those
   * fields behind their existing disclosure, and the server accepts a slug
   * only when the SAVED engagement's own composition allows it. No second
   * form, no profession switch, no client-declared field list, and no
   * vocabulary (archetype / module / ISCO) reaches the person.
   */
  const fields = read("lib/journal/journal-module-fields.ts");
  const fieldsComponent = read("components/app/journal-module-fields.tsx");
  const compactEditor = read("components/app/journal-entry-compact-editor.tsx");
  const actions = read("lib/journal/actions.ts");
  const editEntry = read("lib/journal/edit-entry.ts");

  it("the field model composes through composeJournal over BOTH sources — the occupation's ISCO group and the relationship — with no list of its own", () => {
    expect(fields).toContain("composeJournal(archetypesForSources(sources))");
    expect(fields).toMatch(/for \(const code of sources\.iscoGroups \?\? \[\]\) ids\.push\(\.\.\.archetypesForIsco\(code\)\);/);
    expect(fields).toContain("ids.push(...archetypesForRelationship(sources.relationshipSlug));");
    expect(fields).not.toMatch(/switch\s*\(/);
    expect(fields).not.toMatch(/"student"|"volunteer"|"employee"/);
    // no ISCO code is spelled out here either — the map lives in the archetype catalogue
    expect(fields).not.toMatch(/"\d{2,4}"/);
  });
  it("the occupation path is resolved SERVER-SIDE from the worker's own professions: esco_uri → esco_occupations.isco_group, under the caller's RLS", () => {
    const path = read("lib/journal/journal-occupation-path.ts");
    expect(path).toMatch(/^import "server-only";/m);
    expect(path).toMatch(/from\("worker_professions"\)\s*\.select\("is_primary, professions\(slug, esco_uri\)"\)\s*\.eq\("worker_id", workerId\)/);
    expect(path).toContain("iscoGroupsForEscoUris(uris, supabase as SupabaseClient)");
    expect(path).not.toMatch(/createAdminClient|service_role|SUPABASE_SERVICE_ROLE_KEY/);
    // the ESCO reader is ONE bounded read on esco_uri, and lib/esco now has a product consumer
    const lookup = read("lib/esco/esco-lookup.ts");
    expect(lookup).toContain("export async function iscoGroupsForEscoUris(");
    expect(lookup).toMatch(/from\("esco_occupations"\)\s*\.select\("esco_uri, isco_group"\)\s*\.in\("esco_uri", uris\)\s*\.limit\(ESCO_URI_BATCH_LIMIT\)/);
    // an unmapped profession is null, never a guessed family
    expect(path).toContain("iscoGroup: d.escoUri ? (byUri.get(d.escoUri) ?? null) : null");
    // the journal page composes its directions THROUGH the path (no second worker_professions read)
    expect(page).toContain("readOwnOccupationPath(supabase, worker.id)");
    expect(page).not.toMatch(/from\("worker_professions"\)/);
    expect(page).toContain("iscoGroup: d.iscoGroup");
  });
  it("both editors render the ONE module-fields block and ship the ONE wire field", () => {
    for (const [name, src] of [["composer", composer], ["compact editor", compactEditor]] as const) {
      expect(src, name).toContain("<JournalModuleFields");
      expect(src, name).toMatch(/relationshipSlug=\{selectedRelationship\}/);
      // the occupation source: the named direction's ISCO group, else the primary profession's
      expect(src, name).toMatch(/iscoGroup=\{selectedIscoGroup\}/);
      expect(src, name).toMatch(/: directions\[0\]\s*\)?\?\.iscoGroup \?\? null/);
    }
    expect(fieldsComponent).toContain("moduleGroupsFor({ relationshipSlug, iscoGroups: [iscoGroup] })");
    expect(composer).toContain("serializeModuleFields(moduleFields)");
    expect(read("lib/journal/compact-edit-model.ts")).toContain("serializeModuleFields(input.moduleFields)");
  });
  it("the server accepts module slugs by the SAVED engagement's relationship AND the worker's OWN professions — never a client slug — on create and on supersede alike", () => {
    expect(writeCore).toContain("export async function resolveModuleMetricRows(");
    expect(writeCore).toMatch(/from\("engagement_contexts"\)\s*\.select\("relationship_slug"\)\s*\.eq\("id", engagementId\)/);
    expect(writeCore).toContain("readOwnOccupationPathForUser(supabase, userId)");
    expect(writeCore).toMatch(/allowedModuleSlugsFor\(\{\s*relationshipSlug: ctx\?\.relationship_slug \?\? null,\s*iscoGroups: own\.iscoGroups,\s*\}\)/);
    // the request's work_direction / any posted profession never reaches the accept set
    const resolver = writeCore.slice(
      writeCore.indexOf("export async function resolveModuleMetricRows("),
      writeCore.indexOf("export function collectUnitSlugs"),
    );
    expect(resolver).not.toMatch(/work_direction|workDirection|formData|profession_id/);
    // both callers hand the resolver the signed-in user, not a form value
    expect(writeCore).toMatch(/String\(formData\.get\(MODULE_METRICS_FIELD\) \?\? ""\),\s*userId,\s*\);/);
    expect(actions).toMatch(/String\(formData\.get\(MODULE_METRICS_FIELD\) \?\? ""\),\s*user\.id,\s*\);/);
    expect(writeCore).toContain("...moduleRows.rows,");
    expect(actions).toContain("resolveModuleMetricRows(");
    expect(actions).toContain("...moduleRows.rows,");
    // A refused field is a named failure before any write — never a silent drop.
    expect(writeCore).toContain('code: "module_field_invalid"');
    expect(writeCore).toMatch(/if \(!moduleRows\.ok\) return moduleRows;/);
    expect(actions).toMatch(/if \(!moduleRows\.ok\) return moduleRows;/);
  });
  it("an edit preloads the entry's module rows so the supersede re-sends them (no data loss)", () => {
    expect(editEntry).toContain("moduleFields: readModuleFieldValues(metrics)");
    expect(compactEditor).toContain("entry.moduleFields");
    expect(composer).toContain("editingEntry?.moduleFields");
  });
  it("the journal page hands the editors the relationship and filters contexts by the canonical list — no local copy", () => {
    expect(page).toContain("relationshipSlug: e.relationship_slug");
    expect(page).toMatch(/import \{ PROFESSIONAL_HISTORY_RELATIONSHIPS \} from "@\/lib\/player-card\/work-history-model"/);
    expect(page).not.toMatch(/const WORKER_RELATIONSHIPS = \[/);
    // and shows the saved fields back on the entry, in plain words
    expect(page).toContain("journal-entry-module-fields-");
    expect(page).toContain("readModuleFieldValues(metrics)");
  });
  it("the component shows the person plain words only — no archetype, module or ISCO vocabulary", () => {
    // JSX text nodes (`>text<`) and string literals inside JSX attributes are
    // what the person can read; identifiers and comments are not.
    const visible = fieldsComponent.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    const textNodes = [...visible.matchAll(/>\s*([^<>{}]+?)\s*<\//g)].map((m) => m[1]!);
    for (const node of textNodes) expect(node).not.toMatch(/archetype|module|isco|esco/i);
    expect(visible).toContain('useTranslations("journal.moduleFields")');
  });
  it("every module field ANY occupation family or relationship can compose has a label in every active locale, and the error names the fields in all 11", () => {
    const reachable = new Map<string, Set<string>>();
    const collect = (sources: Parameters<typeof moduleGroupsFor>[0]) => {
      for (const g of moduleGroupsFor(sources)) {
        if (!reachable.has(g.moduleId)) reachable.set(g.moduleId, new Set());
        for (const s of g.slugs) reachable.get(g.moduleId)!.add(s);
      }
    };
    for (const rel of Object.keys(RELATIONSHIP_ARCHETYPES)) collect({ relationshipSlug: rel });
    for (const code of Object.keys(ISCO_ARCHETYPES)) collect({ iscoGroups: [code] });
    // the occupation path makes the WHOLE catalogue reachable — a family that
    // composed a module with no label would show the person a raw key
    expect([...reachable.keys()].sort()).toEqual(Object.keys(JOURNAL_MODULES).sort());
    for (const loc of ["lt", "en", "ru", "nl", "de"] as const) {
      const j = JSON.parse(read(`messages/${loc}/journal.json`)) as {
        moduleFields: { title: string; hint: string; modules: Record<string, string>; fields: Record<string, string> };
      };
      const mf = j.moduleFields;
      expect(typeof mf.title === "string" && mf.title.trim().length > 0, `${loc}.moduleFields.title`).toBe(true);
      expect(typeof mf.hint === "string" && mf.hint.trim().length > 0, `${loc}.moduleFields.hint`).toBe(true);
      for (const [moduleId, slugs] of reachable) {
        expect(typeof mf.modules[moduleId] === "string" && mf.modules[moduleId]!.trim().length > 0, `${loc}.moduleFields.modules.${moduleId}`).toBe(true);
        for (const s of slugs) {
          expect(typeof mf.fields[s] === "string" && mf.fields[s]!.trim().length > 0, `${loc}.moduleFields.fields.${s}`).toBe(true);
          expect(mf.fields[s]!, `${loc}.moduleFields.fields.${s}`).not.toMatch(/_/);
        }
      }
    }
    for (const loc of ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"]) {
      const j = JSON.parse(read(`messages/${loc}/journal.json`)) as { errors: Record<string, string> };
      expect(j.errors.moduleFieldInvalid, `${loc}.errors.moduleFieldInvalid`).toContain("{fields}");
    }
  });
});

/**
 * 11 · COVERAGE SEMANTICS — every share names the base it is a share OF, no
 * recorded hour vanishes from the reading it belongs to, and the window is
 * the day the work happened (re-audit 2026-09-11, F2/F3/F4/F5/F6).
 *
 * These are the ways an honest set of figures still told a wrong story:
 * a "main activity" chosen from only the labelled hours; "5 h - 100 %" over
 * 95 unattributed hours; "no confirmations" above "1 confirmed"; last
 * month's hours under "Today".
 */
describe("11 · coverage semantics: shares name their base, hours never vanish", () => {
  it("F2 · the model states the coverage of the activity reading and the share is of ALL recorded hours", () => {
    expect(model).toContain("readonly activityHours: number;");
    expect(model).toContain("readonly unlabelledHours: number;");
    expect(model).toContain("readonly unlabelledEntries: number;");
    // the base is the focus period's own hours — the same figure the
    // period tile shows, not the sum of the labelled ones
    expect(model).toMatch(/const focusHours = periods\.find\(\(p\) => p\.key === focus\)\?\.hours \?\? 0;/);
    expect(model).toMatch(/share: focusHours > 0 \? round2\(a\.hours \/ focusHours\) : 0,/);
    // an unlabelled timed part is counted in the denominator, never dropped
    expect(model).toMatch(/unlabelledHours \+= line\.hours;/);
  });

  it("F2 · the section names the unlabelled hours instead of hiding them", () => {
    expect(component).toContain('data-testid="wi-unlabelled-hours"');
    expect(component).toContain('data-testid="wi-activities-coverage"');
    expect(component).toMatch(/t\("unlabelledHours", \{/);
    expect(component).toMatch(/t\("activitiesCoverage", \{/);
  });

  it("F3 · the skill share states its base in WORDS, not only in an aria-label", () => {
    expect(component).toContain('data-testid="wi-skills-coverage"');
    expect(component).toMatch(/t\("skillsCoverage", \{/);
    expect(component).toMatch(/t\("shareOf", \{/);
    // the bare percentage with no base beside it is the pre-fix shape
    expect(component).not.toMatch(/\? ` · \$\{fmtPct\(s\.share, locale\)\}`/);
  });

  it("F5 · work recorded in days has its own confirmed figure, and the headline reads the same state as the count below it", () => {
    expect(model).toContain("readonly confirmedDayUnits: number;");
    expect(model).toMatch(/confirmedDayUnits: round2\(confirmedDayUnits\),/);
    // a days-unit duration is a duration: the day counts as worked
    expect(model).toMatch(/if \(d\.time\.totalHours > 0 \|\| d\.time\.totalDayUnits > 0\) days\.add\(d\.time\.day\);/);
    expect(component).toMatch(/t\("confirmedOfDays", \{/);
    expect(component).toMatch(/t\("confirmedNoDuration", \{/);
    // "no entry with a duration" was false for an entry recorded in days
    expect(component).toMatch(/const hasAnyHours = wi\.totalHours > 0 \|\| allPeriod\.dayUnits > 0;/);
  });

  it("F6 · the org window report decides membership by the WORK day, from two bounded reads", () => {
    expect(windowReport).toContain('import { resolveWorkDay } from "@/lib/journal/work-time";');
    expect(windowReport).toMatch(/export function inWorkWindow\(/);
    expect(windowReport).toMatch(/const day = resolveWorkDay\(row\.journal_entry_metrics \?\? \[\], row\.created_at\);/);
    // (B) the entries whose STATED work day falls in the window
    expect(windowReport).toMatch(/\.eq\("metric_slug", "work_date"\)\s*\.gte\("value_text", window\.startIso\)\s*\.lte\("value_text", window\.endIso\)/);
    // both reads stay bounded and stay inside the org's own contexts
    expect(windowReport).toMatch(/\.in\("engagement_context_id", contextIds\)/);
    expect(windowReport).not.toMatch(/service_role|createAdminClient|createServiceClient/);
    // a failed work-day read degrades the whole report — it never silently
    // falls back to the created_at-only defect
    expect(windowReport).toMatch(/if \(createdRes\.error \|\| workedRes\.error\) return \{ applied: false, reason: "error" \};/);
    expect(windowReport).toMatch(/\.filter\(\(row\) => inWorkWindow\(row, window\)\)/);
  });

  it("the chat answers from the model's coverage figures — it never re-derives them", () => {
    expect(workflows).toContain("wi.activityHours");
    expect(workflows).toContain("wi.unlabelledHours");
    expect(workflows).toMatch(/pct: fmtPct\(a\.share, locale\)/);
    // the pre-fix shape: the chat subtracting its own labelled total
    expect(workflows).not.toMatch(/const labelled = wi\.activities\.reduce/);
  });

  it("every coverage line has copy in each locale the section is published in", () => {
    const keys = [
      "activityShareOf",
      "unlabelledHours",
      "skillsCoverage",
      "shareOf",
      "activitiesCoverage",
      "confirmedOfDays",
      "confirmedNoDuration",
    ];
    for (const loc of ["lt", "en", "ru", "nl", "de"] as const) {
      const j = JSON.parse(read(`messages/${loc}/journal.json`)) as {
        intelligence: Record<string, string>;
      };
      for (const k of keys) {
        const v = j.intelligence[k];
        expect(typeof v === "string" && v.trim().length > 0, `${loc}.intelligence.${k}`).toBe(true);
        // a share sentence that names no base is the defect itself
        expect(v!, `${loc}.intelligence.${k}`).not.toMatch(/\{[a-zA-Z]+\}%/);
      }
      // the report row's "mainly X" gains its base in the same locales
      const rootJson = JSON.parse(read(`messages/${loc}.json`)) as Record<string, unknown>;
      const reports = (rootJson.reports ?? {}) as { journalWindow?: Record<string, string> };
      const mainlyShare = reports.journalWindow?.mainlyShare;
      expect(typeof mainlyShare === "string" && mainlyShare.includes("{percent}"), `${loc}.reports.journalWindow.mainlyShare`).toBe(true);
      expect(mainlyShare!, `${loc}.reports.journalWindow.mainlyShare`).toContain("{total}");
    }
  });
});

describe("12 · the second hour ledger is bridged, not merged (owner §19, re-audit F7)", () => {
  it("the organization's records reach the model through the ONE reader and the ONE allocation read — RLS-scoped, no admin client", () => {
    expect(allocations).toMatch(/export async function readAllocationsForWorker\(/);
    // worker-scoped, live rows only, bounded — no employer context, no org filter
    expect(allocations).toMatch(/\.eq\("worker_id", workerId\)\s*\.is\("superseded_by", null\)\s*\.order\("work_date", \{ ascending: false \}\)\s*\.limit\(ALLOCATION_READ_LIMIT\)/);
    expect(allocations).not.toMatch(/service_role|createAdminClient|createServiceClient/);
    expect(reader).toContain('import { readAllocationsForWorker } from "@/lib/work-hours/allocations";');
    expect(reader).toMatch(/export async function readOrganizationRecords\(/);
    expect(reader).toMatch(/readOrganizationRecords\(caller\.supabase, workerId\),/);
    // the journal page reads the ledger in the same batch and hands it to the same assembly
    expect(page).toMatch(/readOrganizationRecords\(supabase, worker\.id\),/);
    expect(page).toMatch(/organizationRecords,\s*\}\)\s*: null;/);
    // nothing else in the app reads the table for a person's figures
    expect(component).not.toMatch(/\.from\("|createClient|readAllocationsForWorker/);
    expect(cv).not.toMatch(/\.from\("work_hour_allocations"|readAllocationsForWorker/);
    expect(workflows).not.toMatch(/\.from\("work_hour_allocations"|readAllocationsForWorker/);
  });

  it("UNKNOWN ≠ ZERO on the ledger: a failed read is null, an absent table is an empty ledger", () => {
    expect(reader).toMatch(/if \(res\.kind === "error"\) return null;\s*if \(res\.kind === "needs-migration"\) return \[\];/);
    expect(model).toContain("readonly organizationRecords: readonly OrganizationRecordTotals[] | null;");
  });

  it("the model keeps the ledger apart: derived AFTER every journal figure, never inside a period total or a skill", () => {
    const ledgerAt = model.indexOf("const orgRows = input.organizationRecords ?? null;");
    expect(ledgerAt).toBeGreaterThan(model.indexOf("const provenance = {"));
    expect(ledgerAt).toBeGreaterThan(model.indexOf("const periods: WorkPeriodTotals[]"));
    expect(ledgerAt).toBeLessThan(model.indexOf("const checks = deriveWorkTimeChecks("));
    // the period totals loop never sees a record; the skill accumulator never sees one
    const periodsBlock = model.slice(model.indexOf("const periods: WorkPeriodTotals[]"), model.indexOf("const focus: WorkPeriodKey"));
    expect(periodsBlock).not.toMatch(/organizationRecords|orgRows/);
    const skillsBlock = model.slice(model.indexOf("// ── skills"), model.indexOf("// ── the organization's hour records"));
    expect(skillsBlock).not.toMatch(/organizationRecords|orgRows/);
    // a rejected row is kept visible and counted nowhere
    expect(model).toMatch(/if \(r\.status === "rejected"\) \{\s*rejectedHours \+= r\.hours;\s*continue;/);
    expect(model).toMatch(/readonly rejectedHours: number;/);
  });

  it("the day check reads the ledger — the plausibility claim is code, not a comment", () => {
    expect(plausibility).toMatch(/readonly organizationHoursByDay\?: ReadonlyMap<string, number>;/);
    expect(plausibility).toMatch(/const hours = round2\(acc\.hours \+ organizationHours\);/);
    expect(plausibility).toContain("readonly organizationHours: number;");
    expect(model).toMatch(/deriveWorkTimeChecks\(\s*scoped\.map\(\(d\) => \(\{ time: d\.time, metrics: d\.entry\.metrics \}\)\),\s*\{ organizationHoursByDay \},\s*\)/);
    // the check module stays pure
    expect(plausibility).not.toMatch(/from "@\/lib\/supabase|server-only|fetch\(|new Date\(\)/);
  });

  it("the section, the CV and the chat NAME the ledger beside the journal figure and state it is added to nothing", () => {
    expect(component).toContain('data-testid="wi-org-records"');
    expect(component).toContain('data-testid="wi-org-records-provenance"');
    expect(component).toContain('data-testid="wi-org-records-rule"');
    expect(component).toMatch(/tk\("orgRecords\.rule"\)/);
    expect(component).toMatch(/t\("checks\.organizationHours", \{/);
    // the ledger figure is the model's own — the component adds nothing to a journal figure
    expect(component).not.toMatch(/orgPeriod\.hours \+|\+ orgPeriod\.hours|orgAll\.hours \+|\+ orgAll\.hours/);
    expect(cv).toContain("organizationRecordedHours: organizationRecordedHoursOf(workIntelligence),");
    expect(cvPage).toContain('data-testid="cv-organization-recorded-hours"');
    expect(cvPage).toMatch(/t\("organizationRecordedHours", \{/);
    expect(workflows).toMatch(/t\("journalOrgRecords", \{/);
    expect(workflows).toMatch(/wi\?\.organizationRecords\?\.find\(\(p\) => p\.key === \(focus \?\? "all"\)\)/);
  });

  it("every ledger sentence has copy in each locale the section is published in, and none of it sums the two ledgers", () => {
    for (const loc of ["lt", "en", "ru", "nl", "de"] as const) {
      const j = JSON.parse(read(`messages/${loc}/journal.json`)) as {
        intelligence: {
          orgRecords: Record<string, string>;
          checks: Record<string, string>;
          org: { orgRecords: Record<string, string> };
        };
      };
      for (const k of ["title", "body", "periodEmpty", "imported", "approved", "linked", "rejected", "rule"]) {
        const v = j.intelligence.orgRecords[k];
        expect(typeof v === "string" && v.trim().length > 0, `${loc}.intelligence.orgRecords.${k}`).toBe(true);
      }
      for (const k of ["title", "body", "periodEmpty", "rule"]) {
        const v = j.intelligence.org.orgRecords[k];
        expect(typeof v === "string" && v.trim().length > 0, `${loc}.intelligence.org.orgRecords.${k}`).toBe(true);
      }
      expect(j.intelligence.checks.organizationHours, `${loc}.intelligence.checks.organizationHours`).toContain("{hours}");
      // no internal vocabulary reaches the person
      for (const v of [...Object.values(j.intelligence.orgRecords), ...Object.values(j.intelligence.org.orgRecords)]) {
        expect(v).not.toMatch(/work_hour_allocations|allocation|journal_entry|_id\b/i);
      }
      const root = JSON.parse(read(`messages/${loc}.json`)) as Record<string, unknown>;
      const find = (o: unknown, key: string): string | null => {
        if (!o || typeof o !== "object") return null;
        const rec = o as Record<string, unknown>;
        if (typeof rec[key] === "string") return rec[key] as string;
        for (const v of Object.values(rec)) {
          const hit = find(v, key);
          if (hit) return hit;
        }
        return null;
      };
      const cvLine = find(root, "organizationRecordedHours");
      expect(cvLine, `${loc}.cv.organizationRecordedHours`).toContain("{hours}");
      const chatLine = find(root, "journalOrgRecords");
      expect(chatLine, `${loc}.chat.journalOrgRecords`).toContain("{hours}");
    }
  });
});

describe("13 · the five rules the re-audit pinned (2026-09-11, F8–F12)", () => {
  const consumers: Record<string, string> = {
    component,
    workflows,
    cv,
    cvPage,
    reader,
    windowReport,
    personPage,
    reportsPage,
    listCore,
  };

  it("F8 · no consumer sums per-skill involvement — `sharedHours` is never reduced, added or accumulated outside the model", () => {
    for (const [name, src] of Object.entries(consumers)) {
      // a reduce / += / a + b over a skill's sharedHours is the 8 h × 5 = 40 h lie
      expect(src, `${name}: reduce over sharedHours`).not.toMatch(/reduce\([^;]*\.sharedHours/);
      expect(src, `${name}: += sharedHours`).not.toMatch(/\+=\s*[\w.]*\.sharedHours/);
      expect(src, `${name}: skill.sharedHours + …`).not.toMatch(/\b(s|skill|sk|row|x|y)\.sharedHours\s*\+/);
      expect(src, `${name}: … + skill.sharedHours`).not.toMatch(/\+\s*\b(s|skill|sk|row|x|y)\.sharedHours\b/);
    }
    // the model's own once-counted figure is the entry remainder, summed once per ENTRY
    expect(model).toMatch(/if \(d\.basis === "shared"\) \{\s*sharedHours \+= remainder;\s*sharedEntries \+= 1;\s*for \(const id of ids\) accFor\(id\)\.shared \+= remainder;/);
    expect(model).toContain("F8  INVOLVEMENT IS NEVER A TOTAL");
  });

  it("F9 · every recorded output counts, one per unit within the entry, totalled per unit × kind of work — the latest-row-only rule is gone", () => {
    expect(model).not.toMatch(/function outputOf\(/);
    expect(model).toMatch(/function outputsOf\(/);
    expect(model).toMatch(/const byUnit = new Map<string, number>\(\);\s*for \(const row of rows\) \{\s*const unit = row\.unit_slug!\.trim\(\);\s*if \(!byUnit\.has\(unit\)\) byUnit\.set\(unit, row\.value_numeric as number\);/);
    expect(model).toContain("readonly activity: string | null;");
    expect(model).toMatch(/const activity = directionOf\(d\.entry\.metrics\);\s*for \(const o of outputsOf\(d\.entry\.metrics\)\) \{\s*const key = `\$\{o\.unit\}\|\$\{activity \?\? ""\}`;/);
    // the section and the chat NAME the kind of work on the output line
    expect(component).toMatch(/key=\{`\$\{o\.unit\}\|\$\{o\.activity \?\? ""\}`\}/);
    expect(component).toMatch(/\{o\.activity \? \(\s*<span className="text-text-muted"> · \{activityName\(o\.activity\)\}<\/span>/);
    expect(workflows).toMatch(/o\.activity\s*\? t\("wiOutputItemActivity", \{/);
  });

  it("F10 · the work day is the PERSON's stated day on every intake, and a save-day placement is counted and said", () => {
    // the rule names its basis; the model counts the fallback per period
    expect(workTime).toMatch(/export type WorkDayBasis = "stated" \| "created";/);
    expect(workTime).toMatch(/export function resolveWorkDayDetail\(/);
    expect(workTime).toMatch(/return \{ day: String\(createdAt \?\? ""\)\.slice\(0, 10\), basis: "created" \};/);
    expect(model).toMatch(/if \(d\.time\.dayBasis === "created"\) entriesDayInferred \+= 1;/);
    expect(component).toContain('data-testid="wi-day-inferred"');
    expect(component).toMatch(/t\("dayInferred", \{ count: period\.entriesDayInferred \}\)/);
    // every intake that records time carries a work_date: the chat and the MCP
    // capability REQUIRE it at the floor every write crosses …
    expect(workerSchemas).toMatch(/workDate: z\.string\(\)\.trim\(\)\.regex\(\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\),/);
    expect(capabilities).toMatch(/const journalDraftInput = workerLogWorkSchema\.extend\(\{/);
    expect(writeCore).toMatch(/metric_slug: "work_date",\s*value_text: workDate,/);
    // … and its default is the PERSON's calendar day, from the one helper
    expect(personDay).toMatch(/export function personCalendarDay\(now: Date = new Date\(\)\): string \{\s*const p = [^\n]*\n\s*return `\$\{now\.getFullYear\(\)\}-\$\{p\(now\.getMonth\(\) \+ 1\)\}-\$\{p\(now\.getDate\(\)\)\}`;/);
    expect(chat).toMatch(/function todayIso\(\): string \{\s*return personCalendarDay\(\);\s*\}/);
    expect(composer).toMatch(/setWorkDate\(\(d\) => \(d === today \? personCalendarDay\(\) : d\)\);/);
    expect(compactEditor).toMatch(/setWorkDate\(\(d\) => \(d === today \? personCalendarDay\(\) : d\)\);/);
    // the ambient zone is read for INPUT only — never by the pure rule, the model or the reader
    for (const [name, src] of Object.entries({ workTime, model, reader, windowReport, plausibility, display })) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, `${name} reads the ambient zone`).not.toMatch(/personCalendarDay|getTimezoneOffset|toLocaleDateString/);
    }
  });

  it("F11 · two skill rows for one slug are ONE skill — collapsed by slug, aliases folded into the links, order-independent", () => {
    expect(model).toMatch(/const canonicalIdBySlug = new Map<string, string>\(\);\s*const canonicalIdByAlias = new Map<string, string>\(\);/);
    expect(model).toMatch(/for \(const s of \[\.\.\.input\.skills\]\.sort\(\(a, b\) => a\.skillId\.localeCompare\(b\.skillId\)\)\) \{/);
    expect(model).toMatch(/const canonicalLinkIds = \(ids: readonly string\[\]\): string\[\] => \[\s*\.\.\.new Set\(ids\.map\(\(id\) => canonicalIdByAlias\.get\(id\) \?\? id\)\),\s*\];/);
    expect(model).toMatch(/const linkedSkillIds = canonicalLinkIds\(raw\.linkedSkillIds\);/);
  });

  it("F12 · a CV chip names its base in words — confirmed hours travel with attributed hours, the qualifier is text, not a hover title", () => {
    expect(model).toMatch(/export function confirmedHoursBySlug\(wi: WorkIntelligence\): Map<string, number>/);
    expect(cv).toContain("confirmedHoursBySkill: Record<string, number> | null;");
    expect(cv).toMatch(/confirmedHoursBySkill: workIntelligence\s*\? Object\.fromEntries\(confirmedHoursBySlug\(workIntelligence\)\)\s*: null,/);
    expect(cvPage).toMatch(/t\("skillHoursConfirmed", \{/);
    expect(cvPage).toMatch(/t\("skillHoursOwn", \{/);
    // the bare "{hours} h" chip — its base only in a title — is no longer rendered
    expect(cvPage).not.toMatch(/t\("skillHours", \{/);
  });

  it("every F9/F10/F12 sentence has copy in each locale the surfaces are published in, and none of it exposes internal vocabulary", () => {
    for (const loc of ["lt", "en", "ru", "nl", "de"] as const) {
      const j = JSON.parse(read(`messages/${loc}/journal.json`)) as { intelligence: Record<string, string> };
      expect(j.intelligence.dayInferred, `${loc}.intelligence.dayInferred`).toContain("{count, plural,");
      expect(j.intelligence.dayInferred).not.toMatch(/work_date|created_at|UTC|timezone/i);
      const root = JSON.parse(read(`messages/${loc}.json`)) as {
        cvExport: Record<string, string>;
        workspace: { ai: Record<string, string> };
      };
      expect(root.cvExport.skillHoursOwn, `${loc}.cvExport.skillHoursOwn`).toContain("{hours}");
      expect(root.cvExport.skillHoursConfirmed, `${loc}.cvExport.skillHoursConfirmed`).toContain("{hours}");
      expect(root.cvExport.skillHoursConfirmed).toContain("{confirmed}");
      expect(root.workspace.ai.wiOutputItemActivity, `${loc}.workspace.ai.wiOutputItemActivity`).toContain("{activity}");
      expect(root.workspace.ai.wiOutputItemActivity).toContain("{unit}");
    }
  });
});
