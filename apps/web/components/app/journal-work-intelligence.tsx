import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { Link } from "@/lib/i18n/navigation";
import {
  type WorkIntelligence,
  type WorkPeriodKey,
  type WorkTrend,
} from "@/lib/journal/work-intelligence";
import { deriveGrowthReading } from "@/lib/journal/growth-reading";
import { deriveAttributionExpectation } from "@/lib/journal/attribution-expectation";
import { orgLedger, skillRows } from "@/lib/journal/work-in-numbers-view";
import { skillsForProfession } from "@/lib/taxonomy/profession-skills";
import { formatUtcDate } from "@/lib/time/display";
// ONE rendering of every figure (target worker IA 2026-09-13): the period
// tiles, the checks, the organization's ledger, the share bars, the honest
// remainder and the growth kinds are the SAME components the Work-in-Numbers
// station (`/dashboard/journal?view=numbers`) composes — this block only arranges
// them for the audience it serves.
import { ChecksList } from "@/components/app/work-in-numbers/checks-list";
import { fmtHours, fmtPct } from "@/components/app/work-in-numbers/format";
import {
  GrowthKinds,
  type GrowthSkillDirection,
} from "@/components/app/work-in-numbers/growth-kinds";
import { HoursRemainder } from "@/components/app/work-in-numbers/hours-remainder";
import { OrgLedger } from "@/components/app/work-in-numbers/org-ledger";
import { PeriodNav } from "@/components/app/work-in-numbers/period-nav";
import { SkillShareList } from "@/components/app/work-in-numbers/skill-share-list";

/**
 * "Darbas skaičiais" — what the person's recorded work adds up to, rendered
 * from `deriveWorkIntelligence` (issue #1689, owner direction §4–§8, §12).
 * Server component; every figure it shows is a sum of lines the ONE
 * canonical work-time rule produced, and the section says plainly what it
 * could NOT attribute.
 *
 * ── INFORMATION ARCHITECTURE (a worker's questions, in order) ─────────────
 *   1. How much did I work?     TODAY · 7 DAYS · 30 DAYS · 365 DAYS · ALL — the
 *                               strip is the period switch: every figure is
 *                               real and visible at once, the chosen one
 *                               scopes the detail beneath
 *   2. On what, mainly?         main activity — N h; other evidenced activities
 *   3. What backs it?           confirmed hours · entries confirmed / with
 *                               photos / from an original document / self-only
 *   4. Which skills?            attributed practice time, involvement,
 *                               frequency, recency, contexts — and the unsplit
 *                               / unlinked remainder, named
 *   5. What kind, for whom?     activities with trend · outputs · contexts
 *   6. How is it changing?      months
 *   7. Where could I grow?     the growth reading (owner line 8): a FACT
 *                               block — the skills the entries back, in
 *                               hours, and how many declared skills are
 *                               left out — and, apart from it, a block
 *                               labelled DERIVED: skills whose own evidence
 *                               is thin or moving (deepen), adjacent
 *                               directions from EVIDENCED skills only
 *                               (expand), and a pointer to the board for
 *                               what real demand asks (demand is not read
 *                               here — the chat's answer reads it)
 *   8. What does it feed?       the Living CV and the opportunities board
 *   9. Where do the numbers come from?  provenance footnote
 *   1b. What did my organization record?  the second hour ledger (owner
 *                               §19): timesheet lines and imported documents
 *                               in `work_hour_allocations`, read beside the
 *                               journal and shown beside it — hours, days,
 *                               how much was imported / approved / already
 *                               described by a journal entry — and stated
 *                               plainly as NOT added to the figures above
 *                               and reaching no skill (an hour record
 *                               carries no description of the work)
 *   1a. Does anything need a look?  plausibility checks (owner §13) right
 *                               under the strip: a day above 24 h, a long
 *                               day, one duration longer than a day, an
 *                               entry-level figure the rule set aside —
 *                               warnings beside unchanged figures; the
 *                               person fixes the record or stands by it with
 *                               a reason, and an acknowledged check stays
 *                               listed with that reason
 *
 * ── HONESTY ───────────────────────────────────────────────────────────────
 *   · a skill's hours are the entries where it was the ONLY linked skill;
 *     involvement (shared) hours are listed, never summed — an 8-hour entry
 *     with four skills is 8 hours, not 32 (owner rule §5);
 *   · a share is a fraction of the person's OWN attributed hours — no score,
 *     no rating, no rank, no person tier (the tier word is the skill row's
 *     evidence ladder, from the one `evidenceTier` namespace);
 *   · a direction is "your recorded work already covers N of M skills of X",
 *     never "you are qualified for X"; a "deepen" line is a fact about the
 *     person's own rows (used only alongside others / never confirmed /
 *     rising / not used for 90 days), never a judgement of the person;
 *   · confirmed hours light up ONLY from an approved confirmation row; zero
 *     is shown as zero of the total, never hidden;
 *   · an unreadable model renders nothing (the caller passes null) — it never
 *     renders a zero that reads as "no work" (SEP-7).
 *
 * No internal vocabulary reaches the person: no `journal_entry_skills`, no
 * `fragment_time`, no provenance enum names — every word is an i18n key.
 *
 * ── TWO AUDIENCES, ONE MODEL (owner §14) ──────────────────────────────────
 * `audience: "organization"` renders the SAME derived model for a manager
 * looking at a member on the person page. The figures are the database's
 * scope (RLS hands the manager only the entries logged against their own
 * organization's engagements — see `loadWorkIntelligence`), so nothing here
 * filters or re-derives. What the organization view deliberately does NOT
 * show: the person's plausibility checks and their acknowledgements (a
 * subset of someone's days cannot be judged as their day), the adjacent
 * directions (the person's own growth reading, never an employer's ranking
 * input), the CV / opportunities consequence links and the diary deep links
 * (the diary is the person's). Copy addressed to "you" switches to the
 * organization's wording under `org.*` keys; the rest is shared.
 */

/** Who is reading: the person about their own work (default), or a manager
 *  of an organization about a member's work logged against it. */
export type WorkIntelligenceAudience = "self" | "organization";

export type WorkIntelligenceLabels = {
  /** Catalogue skill slug → localized name (null when the locale has none). */
  skillName: (slug: string) => string | null;
  /** Profession slug → localized name (null when unknown) — for activities
   *  recorded as a profession slug and for adjacent directions. */
  professionName: (slug: string) => string | null;
  /** Productivity unit slug → localized short name (null when unknown). */
  unitName: (slug: string) => string | null;
  /** Engagement context id → the label the diary already uses for it. */
  contextLabel: (id: string | null) => string;
  /** The worker's declared primary profession slug, if any. */
  primaryProfessionSlug: string | null;
  /** ISCO groups of the person's own occupation path — the ONE composition
   *  (`composeJournal`) tells which skill-time attribution this kind of work
   *  can support; absent / empty → no reading (UNKNOWN, never a default). */
  iscoGroups?: readonly string[];
  /** Where a period tile points. Defaults to the person's own journal; the
   *  organization view passes the person page it sits on. */
  periodHref?: (key: WorkPeriodKey) => string;
};

const MAX_SKILLS = 8;
const MAX_ACTIVITIES = 6;
const MAX_MONTHS = 12;
const MAX_DIRECTIONS = 3;
const MAX_KINDS = 6;

const TREND_GLYPH: Record<WorkTrend, string> = {
  up: "↗",
  down: "↘",
  flat: "→",
  new: "",
  none: "",
};

export async function JournalWorkIntelligence({
  wi,
  locale,
  labels,
  audience = "self",
}: {
  wi: WorkIntelligence;
  locale: string;
  labels: WorkIntelligenceLabels;
  audience?: WorkIntelligenceAudience;
}) {
  const t = await getTranslations("journal.intelligence");
  const tTier = await getTranslations("evidenceTier");
  const org = audience === "organization";
  /** Organization wording where the sentence addressed the person ("you"). */
  const tk = (key: string, values?: Record<string, string | number>) =>
    org && t.has(`org.${key}`) ? t(`org.${key}`, values) : t(key, values);
  // the person's own tiles point at the Work-in-Numbers station (the
  // figures' stable destination, target IA §2); the organization view passes
  // the person page it sits on
  const periodHref = (key: WorkPeriodKey): string =>
    labels.periodHref?.(key) ?? `/dashboard/journal?view=numbers&period=${key}`;
  const period =
    wi.periods.find((p) => p.key === wi.focus) ??
    wi.periods[wi.periods.length - 1]!;
  const h = (n: number) => t("hours", { hours: fmtHours(n, locale) });
  const day = (iso: string | null) =>
    iso
      ? (formatUtcDate(iso, locale, { month: "short", day: "numeric" }) ?? iso)
      : null;
  // an activity key is a profession slug (the LT lexicon) OR a skill slug
  // (a compact-editor selection, or the intake's strong skill reading when
  // the lexicon read nothing — #1689); a raw key never reaches the person
  const activityName = (key: string) =>
    labels.professionName(key) ?? labels.skillName(key) ?? key;

  // ── 7 · growth reading: FACT block + DERIVED block, from the ONE pure
  //    derivation the chat answers with too (`growth-reading.ts`); the
  //    organization view gets none of it (the person's own reading, never
  //    an employer's ranking input)
  const growth = org
    ? null
    : deriveGrowthReading(wi, { primaryProfessionSlug: labels.primaryProfessionSlug });
  // what the person's KIND OF WORK can attribute (owner matrix column
  // `skillTimeAttribution`, read here for the first time — #1689): a
  // sentence only when the figures show the pattern; the person's own
  // reading, withheld from the organization view
  const attribution = org
    ? null
    : deriveAttributionExpectation(labels.iscoGroups ?? [], wi);
  const growthBasis = (growth?.basis.skills ?? [])
    .map((s) => ({ ...s, name: labels.skillName(s.slug) }))
    .filter((s): s is typeof s & { name: string } => s.name !== null)
    .slice(0, MAX_SKILLS);
  const deepen = (growth?.deepen ?? [])
    .map((d) => ({ ...d, name: labels.skillName(d.slug) }))
    .filter((d): d is typeof d & { name: string } => d.name !== null);
  // the KINDS over skills (owner requirement 5, #1689) — core strength /
  // growing / underused / self-stated, each with the facts it was decided
  // on; the adjacent kind is the existing directions block below, labelled
  const kindsAll = (growth?.directions ?? [])
    .filter((d): d is GrowthSkillDirection => d.kind !== "adjacent_opportunity")
    .map((d) => ({ ...d, name: labels.skillName(d.slug) }))
    .filter((d): d is typeof d & { name: string } => d.name !== null);
  const kinds = kindsAll.slice(0, MAX_KINDS);
  // every sentence names the evidence: the figures the kind was decided on
  // (`growthKindWhy`, shared with the station)
  const directions = (growth?.expand ?? [])
    .map((d) => ({
      professionId: d.professionId,
      name: labels.professionName(d.professionId),
      sharedCount: d.sharedCount,
      total: skillsForProfession(d.professionId).length,
      missingNames: d.missingSkills
        .map((s) => labels.skillName(s))
        .filter((n): n is string => n !== null)
        .slice(0, 3),
    }))
    .filter((d): d is typeof d & { name: string } => d.name !== null)
    .slice(0, MAX_DIRECTIONS);

  // Every list below is CAPPED for the page; the totals above them are not.
  // Where a cap cuts, the surface says so ("Rodoma 8 iš 12") — a silent cut
  // read as "these are all my skills" (#1689, REMAINING 2 of the receipts).
  // The rows are the ONE presentation model (`skillRows`: evidenced skills,
  // share desc, every figure the model's) the station lists too; a skill the
  // locale cannot name is dropped, never shown as a raw slug.
  const skillsAll = skillRows(wi, labels.skillName).filter((r) => r.name !== null);
  const skills = skillsAll.slice(0, MAX_SKILLS);
  const activities = wi.activities.slice(0, MAX_ACTIVITIES);
  const mainActivity = activities[0] ?? null;
  const otherActivities = activities.slice(1);
  const months = wi.months.slice(-MAX_MONTHS);
  const directionsTotal = (growth?.expand ?? []).filter(
    (d) => labels.professionName(d.professionId) !== null,
  ).length;
  const capLine = (
    kind: "skills" | "activities" | "months" | "directions" | "deepen" | "kinds",
    shown: number,
    total: number,
  ) =>
    total > shown ? (
      <p
        className="text-meta leading-relaxed text-text-muted"
        data-testid={`wi-cap-${kind}`}
        data-shown={shown}
        data-total={total}
      >
        {t(kind === "months" ? "monthsCap" : "listCap", { shown, total })}
      </p>
    ) : null;
  const monthMax = Math.max(0, ...months.map((m) => m.hours));
  // Work recorded in DAYS is a duration too — "no entry with a duration"
  // was false for a 2-day entry (re-audit F5).
  const allPeriod = wi.periods.find((p) => p.key === "all") ?? period;
  const hasAnyHours = wi.totalHours > 0 || allPeriod.dayUnits > 0;
  const noEntriesAtAll = wi.totalEntries === 0;
  const periodHasEntries = period.entries > 0;

  // ── 1b · the organization's own hour records (owner §19) ──────────────
  // A ledger beside the journal (`orgLedger`): shown when it holds anything
  // at all, with the focus period's figure (and the all-time one when the
  // period is empty). `null` = the ledger could not be read → UNKNOWN is
  // said, never a zero (the shared `OrgLedger` renders each state).
  const ledger = orgLedger(wi);

  return (
    <section
      id="work-intelligence"
      className="scroll-mt-20"
      data-testid="journal-work-intelligence"
      data-period={wi.focus}
      data-total-hours={wi.totalHours}
      data-audience={audience}
    >
      <Card compact className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {tk("title")}
          </h2>
          <p className="text-meta leading-relaxed text-text-muted">
            {tk("subtitle")}
          </p>
        </header>

        {noEntriesAtAll ? (
          <p
            className="text-sm leading-relaxed text-text-secondary"
            data-testid="wi-empty"
          >
            {tk("emptyNoEntries")}
          </p>
        ) : (
          <>
            {/* 1 · at a glance — every period real and visible; the chosen one
              scopes the detail below (owner §4, §12) */}
            <PeriodNav wi={wi} locale={locale} t={t} href={periodHref} />

            {/* 1a · plausibility checks (owner §13) — warn, never corrupt:
              every figure above and below is exactly what was recorded.
              The person's own surface only. */}
            {!org && wi.checks.length > 0 && (
              <ChecksList
                checks={wi.checks}
                locale={locale}
                t={t}
                unitName={labels.unitName}
                dayLabel={day}
              />
            )}

            {/* 1b · the organization's hour records — the second ledger,
              named beside the journal, added to nothing, reaching no skill */}
            <OrgLedger
              view={ledger}
              periodWord={t(`period.${wi.focus}`)}
              locale={locale}
              t={t}
              tk={tk}
            />

            {!hasAnyHours && (
              <p
                className="text-sm leading-relaxed text-text-secondary"
                data-testid="wi-empty-hours"
              >
                {tk("emptyNoHours", { count: wi.totalEntries })}
              </p>
            )}

            {!periodHasEntries && hasAnyHours && (
              <p
                className="text-sm leading-relaxed text-text-secondary"
                data-testid="wi-period-empty"
              >
                {t("periodEmpty", { period: t(`period.${wi.focus}`) })}
              </p>
            )}

            {/* 2 · main activity + 3 · what backs it */}
            {periodHasEntries && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div
                  className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface-1/50 px-3 py-2.5"
                  data-testid="wi-main"
                >
                  <span className="font-mono text-meta uppercase tracking-label text-text-secondary">
                    {t("mainActivity")}
                  </span>
                  {mainActivity ? (
                    <>
                      <span
                        className="text-base font-semibold text-text-primary"
                        data-testid="wi-main-activity"
                      >
                        {activityName(mainActivity.key)}
                        <span
                          className="ml-2 font-normal tabular-nums text-text-secondary"
                          data-testid="wi-main-activity-share"
                          data-share={mainActivity.share}
                        >
                          {h(mainActivity.hours)}
                          {mainActivity.share > 0
                            ? ` · ${t("activityShareOf", {
                                percent: fmtPct(mainActivity.share, locale),
                                total: fmtHours(period.hours, locale),
                              })}`
                            : ""}
                        </span>
                      </span>
                      {otherActivities.length > 0 && (
                        <span
                          className="text-meta leading-relaxed text-text-muted"
                          data-testid="wi-other-activities"
                        >
                          {t("otherActivities")}:{" "}
                          {otherActivities
                            .map((a) => activityName(a.key))
                            .join(", ")}
                        </span>
                      )}
                      {/* the coverage of this reading — timed parts with no
                        kind of work stay in the base and are named here,
                        never dropped (re-audit F2) */}
                      {wi.unlabelledHours > 0 && (
                        <span
                          className="text-meta leading-relaxed text-text-muted"
                          data-testid="wi-unlabelled-hours"
                          data-hours={wi.unlabelledHours}
                        >
                          {t("unlabelledHours", {
                            hours: fmtHours(wi.unlabelledHours, locale),
                            count: wi.unlabelledEntries,
                          })}
                        </span>
                      )}
                    </>
                  ) : skills[0] && skills[0].measured ? (
                    <span
                      className="text-base font-semibold text-text-primary"
                      data-testid="wi-main-skill"
                    >
                      {skills[0].name ?? skills[0].slug}
                      <span className="ml-2 font-normal tabular-nums text-text-secondary">
                        {h(skills[0].attributedHours)}
                      </span>
                    </span>
                  ) : (
                    <span
                      className="text-sm text-text-muted"
                      data-testid="wi-main-none"
                    >
                      {t("mainActivityNone")}
                    </span>
                  )}
                </div>
                <div
                  className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface-1/50 px-3 py-2.5"
                  data-testid="wi-evidence"
                >
                  <span className="font-mono text-meta uppercase tracking-label text-text-secondary">
                    {t("confirmedHours")}
                  </span>
                  <span
                    className="text-base font-semibold tabular-nums text-text-primary"
                    data-testid="wi-confirmed-hours"
                    data-confirmed-hours={period.confirmedHours}
                    data-confirmed-day-units={period.confirmedDayUnits}
                    data-confirmed-entries={wi.evidence.confirmed}
                  >
                    {/* The headline and the count below it read the SAME
                      review state: hours, then day units, then entries
                      confirmed without a duration — never "no confirmations"
                      above "1 confirmed" (re-audit F5). */}
                    {period.hours > 0
                      ? t("confirmedOf", {
                          confirmed: fmtHours(period.confirmedHours, locale),
                          total: fmtHours(period.hours, locale),
                        }) +
                        (period.dayUnits > 0
                          ? ` · ${t("confirmedOfDays", {
                              confirmed: fmtHours(period.confirmedDayUnits, locale),
                              total: fmtHours(period.dayUnits, locale),
                            })}`
                          : "")
                      : period.dayUnits > 0
                        ? t("confirmedOfDays", {
                            confirmed: fmtHours(period.confirmedDayUnits, locale),
                            total: fmtHours(period.dayUnits, locale),
                          })
                        : wi.evidence.confirmed > 0
                          ? t("confirmedNoDuration", {
                              confirmed: wi.evidence.confirmed,
                              entries: wi.evidence.entries,
                            })
                          : t("confirmedNone")}
                  </span>
                  <span
                    className="text-meta leading-relaxed text-text-muted"
                    data-testid="wi-evidence-strength"
                  >
                    {tk("evidenceStrength", {
                      entries: wi.evidence.entries,
                      confirmed: wi.evidence.confirmed,
                      photos: wi.evidence.withPhotos,
                      documents: wi.evidence.fromDocument,
                      selfOnly: wi.evidence.selfOnly,
                    })}
                  </span>
                </div>
              </div>
            )}

            {/* 4 · skills — attributed practice time vs involvement: the ONE
              share-bar rendering the station uses, then the honest remainder
              (shared / multi-activity / unattributed) and the provenance of
              every hour — reported once, never summed */}
            {(skills.length > 0 ||
              wi.unattributedHours > 0 ||
              wi.sharedHours > 0 ||
              wi.multiActivityHours > 0) && (
              <div className="flex flex-col gap-3">
                <SkillShareList
                  rows={skills}
                  attributedHours={wi.attributedHours}
                  periodHours={period.hours}
                  periodWord={t(`period.${wi.focus}`)}
                  locale={locale}
                  t={t}
                  tk={tk}
                  tTier={tTier}
                  linkHref={
                    org
                      ? null
                      : (slug) => `/dashboard/journal?skill=${slug}#journal-entries`
                  }
                  unitName={labels.unitName}
                  dayLabel={day}
                  attributionNote={attribution}
                  capNote={capLine("skills", skills.length, skillsAll.length)}
                />
                <HoursRemainder wi={wi} period={period} locale={locale} t={t} tk={tk} />
              </div>
            )}

            {/* 5 · activities (with trend) · outputs · contexts */}
            {(activities.length > 0 ||
              wi.outputs.length > 0 ||
              wi.contexts.length > 1) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {activities.length > 0 && (
                  <div
                    className="flex flex-col gap-1.5"
                    data-testid="wi-activities"
                  >
                    <h3 className="font-mono text-meta uppercase tracking-label text-text-secondary">
                      {t("activitiesTitle")}
                    </h3>
                    {period.hours > 0 && (
                      <p
                        className="text-meta leading-relaxed text-text-muted"
                        data-testid="wi-activities-coverage"
                        data-activity-hours={wi.activityHours}
                        data-unlabelled-hours={wi.unlabelledHours}
                      >
                        {t("activitiesCoverage", {
                          labelled: fmtHours(wi.activityHours, locale),
                          total: fmtHours(period.hours, locale),
                        })}
                      </p>
                    )}
                    <ul className="flex flex-col gap-1">
                      {activities.map((a) => (
                        <li
                          key={a.key}
                          className="flex items-baseline justify-between gap-3 text-sm"
                          data-testid="wi-activity"
                          data-trend={a.trend}
                          data-share={a.share}
                        >
                          <span className="min-w-0 break-words text-text-primary">
                            {activityName(a.key)}
                            {a.trend !== "none" && (
                              <span
                                className="ml-1.5 text-meta text-text-muted"
                                title={t(`trend.${a.trend}`)}
                                aria-label={t(`trend.${a.trend}`)}
                              >
                                {a.trend === "new"
                                  ? t("trendNewShort")
                                  : TREND_GLYPH[a.trend]}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-meta tabular-nums text-text-muted">
                            {h(a.hours)}
                            {a.share > 0 ? ` · ${fmtPct(a.share, locale)}` : ""} ·{" "}
                            {t("activityMeta", {
                              entries: a.entries,
                              contexts: a.contexts,
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {capLine("activities", activities.length, wi.activities.length)}
                  </div>
                )}
                <div className="flex flex-col gap-4">
                  {wi.outputs.length > 0 && (
                    <div
                      className="flex flex-col gap-1.5"
                      data-testid="wi-outputs"
                    >
                      <h3 className="font-mono text-meta uppercase tracking-label text-text-secondary">
                        {t("outputsTitle")}
                      </h3>
                      <ul className="flex flex-col gap-1">
                        {wi.outputs.map((o) => (
                          <li
                            key={`${o.unit}|${o.activity ?? ""}`}
                            className="flex items-baseline justify-between gap-3 text-sm"
                            data-testid="wi-output"
                            data-unit={o.unit}
                            data-activity={o.activity ?? ""}
                          >
                            <span className="min-w-0 truncate text-text-primary">
                              {fmtHours(o.value, locale)}{" "}
                              {labels.unitName(o.unit) ?? o.unit}
                              {/* one unit is totalled only inside one kind of
                                  work (re-audit F9) — the kind is named so two
                                  "km" lines read as two different outputs */}
                              {o.activity ? (
                                <span className="text-text-muted"> · {activityName(o.activity)}</span>
                              ) : null}
                            </span>
                            <span className="shrink-0 text-meta tabular-nums text-text-muted">
                              {t("entriesCount", { count: o.entries })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {wi.contexts.length > 1 && (
                    <div
                      className="flex flex-col gap-1.5"
                      data-testid="wi-contexts"
                    >
                      <h3 className="font-mono text-meta uppercase tracking-label text-text-secondary">
                        {t("contextsTitle")}
                      </h3>
                      <ul className="flex flex-col gap-1">
                        {wi.contexts.map((c) => (
                          <li
                            key={c.engagementContextId ?? "personal"}
                            className="flex items-baseline justify-between gap-3 text-sm"
                            data-testid="wi-context"
                          >
                            <span className="min-w-0 truncate text-text-primary">
                              {labels.contextLabel(c.engagementContextId)}
                            </span>
                            <span className="shrink-0 text-meta tabular-nums text-text-muted">
                              {h(c.hours)}
                              {c.confirmedHours > 0
                                ? ` · ${t("skillConfirmed", { hours: fmtHours(c.confirmedHours, locale) })}`
                                : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 6 · evolution — months, real zeros never smoothed */}
            {months.length > 1 && monthMax > 0 && (
              <div className="flex flex-col gap-1.5" data-testid="wi-months">
                <h3 className="font-mono text-meta uppercase tracking-label text-text-secondary">
                  {t("monthsTitle")}
                </h3>
                <ol
                  className="flex items-end gap-1.5"
                  aria-label={t("monthsTitle")}
                >
                  {months.map((m) => {
                    const height = Math.max(
                      4,
                      Math.round((m.hours / monthMax) * 56),
                    );
                    const confirmedHeight =
                      m.hours > 0
                        ? Math.round((m.confirmedHours / m.hours) * height)
                        : 0;
                    const label =
                      formatUtcDate(`${m.month}-01`, locale, {
                        month: "short",
                      }) ?? m.month;
                    return (
                      <li
                        key={m.month}
                        className="flex min-w-0 flex-1 flex-col items-center gap-1"
                        data-testid="wi-month"
                        data-month={m.month}
                        data-hours={m.hours}
                        title={`${label}: ${h(m.hours)}`}
                      >
                        <span className="text-[0.65rem] tabular-nums text-text-muted">
                          {fmtHours(m.hours, locale)}
                        </span>
                        <span
                          className="relative w-full max-w-8 overflow-hidden rounded-sm bg-ink-700/60"
                          style={{ height: `${height}px` }}
                          aria-hidden
                        >
                          <span
                            className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-blue to-brand-cyan"
                            style={{ height: `${height - confirmedHeight}px` }}
                          />
                          {confirmedHeight > 0 && (
                            <span
                              className="absolute inset-x-0 top-0 bg-state-success/70"
                              style={{ height: `${confirmedHeight}px` }}
                            />
                          )}
                        </span>
                        <span className="text-[0.65rem] text-text-muted">
                          {label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <p className="text-meta text-text-muted">{t("monthsLegend")}</p>
                {capLine("months", months.length, wi.months.length)}
              </div>
            )}

            {/* 7 · where could I grow — the FACT block (what the entries
                back) and, apart from it, the DERIVED block (deepen / expand);
                withheld entirely for the organization view */}
            {growth !== null && growthBasis.length > 0 && (
              <div
                className="flex flex-col gap-3"
                data-testid="wi-growth"
                data-kind={growth.kind}
                data-limitation={growth.limitation}
              >
                <h3 className="font-mono text-meta uppercase tracking-label text-text-secondary">
                  {t("growthTitle")}
                </h3>
                {/* FACT — the person's own rows this reading stands on */}
                <p
                  className="text-meta leading-relaxed text-text-secondary"
                  data-testid="wi-growth-basis"
                  data-declared-only={growth.basis.declaredOnly}
                >
                  {t("growthBasis", {
                    count: growth.basis.skills.length,
                    hours: fmtHours(growth.basis.recordedHours, locale),
                    entries: growth.basis.entries,
                    period: t(`period.${wi.focus}`),
                  })}{" "}
                  {growthBasis
                    .map((s) =>
                      s.attributedHours > 0
                        ? t("growthBasisSkill", { skill: s.name, hours: fmtHours(s.attributedHours, locale) })
                        : s.sharedHours > 0
                          ? t("growthBasisSkillInvolved", { skill: s.name, hours: fmtHours(s.sharedHours, locale) })
                          : // backed only by untimed entries — counted, not
                            // timed; NOT_MEASURED is never printed as 0 h
                            t("growthBasisSkillUntimed", { skill: s.name, entries: s.entries }),
                    )
                    .join(" · ")}
                  {growth.basis.declaredOnly > 0
                    ? ` ${t("growthDeclaredOnly", { count: growth.basis.declaredOnly })}`
                    : ""}
                </p>
                {/* DERIVED — a reading of those rows, said to be one */}
                <div
                  className="flex flex-col gap-2 rounded-md border border-dashed border-border-subtle px-3 py-2"
                  data-testid="wi-growth-reading"
                >
                  <p className="text-meta leading-relaxed text-text-muted">
                    {t("growthDerivedHint")}
                  </p>
                  {growth.limitation === "insufficient_skills" && (
                    <p className="text-meta text-text-muted" data-testid="wi-growth-insufficient">
                      {t("growthInsufficient")}
                    </p>
                  )}
                  {deepen.length > 0 && (
                    <div className="flex flex-col gap-1" data-testid="wi-growth-deepen">
                      <h4 className="text-meta font-medium text-text-secondary">{t("deepenTitle")}</h4>
                      <ul className="flex flex-col gap-1">
                        {deepen.map((d) => (
                          <li
                            key={d.slug}
                            className="text-meta text-text-muted"
                            data-testid={`wi-deepen-${d.slug}`}
                            data-reasons={d.reasons.join(" ")}
                          >
                            <span className="font-medium text-text-primary">{d.name}</span>
                            {" — "}
                            {d.reasons.map((r) => t(`deepen.${r}`)).join("; ")}
                          </li>
                        ))}
                      </ul>
                      {capLine("deepen", deepen.length, growth?.deepenTotal ?? deepen.length)}
                    </div>
                  )}
                  {/* the KINDS (owner requirement 5): each skill's kind, decided
                      by a plain rule, with the facts it was decided on — the
                      evidence named on every line, never a trait; and the
                      adjacent directions, labelled as the adjacent kind. ONE
                      rendering with the station; the demand note (UNKNOWN,
                      not zero) is part of it. */}
                  <GrowthKinds
                    kinds={kinds}
                    directions={directions}
                    locale={locale}
                    t={t}
                    dayLabel={day}
                    kindsCap={capLine("kinds", kinds.length, kindsAll.length)}
                    directionsCap={capLine("directions", directions.length, directionsTotal)}
                  />
                </div>
              </div>
            )}

            {/* 8 · what the evidence feeds — the person's own consequence;
              the organization instead reads what its view is scoped to */}
            {org ? (
              <p
                className="border-t border-border/40 pt-3 text-meta leading-relaxed text-text-muted"
                data-testid="wi-org-scope"
              >
                {t("org.scopeNote")}
              </p>
            ) : (
            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/40 pt-3 text-meta text-text-muted"
              data-testid="wi-consequence"
            >
              <span>{t("feedsCv")}</span>
              <Link
                href="/cv"
                className="font-medium text-brand-blue hover:underline"
                data-testid="wi-cv-link"
              >
                {t("openCv")} →
              </Link>
              <Link
                href={"/dashboard/opportunities" as "/dashboard"}
                className="font-medium text-brand-blue hover:underline"
                data-testid="wi-opportunities-link"
              >
                {t("openOpportunities")} →
              </Link>
            </div>
            )}

          </>
        )}
      </Card>
    </section>
  );
}
