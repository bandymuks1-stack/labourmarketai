import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { Link } from "@/lib/i18n/navigation";
import {
  EVIDENCE_TIER_MESSAGE_KEY,
  type EvidenceTier,
} from "@/lib/evidence/evidence-tier";
import {
  WORK_PERIOD_KEYS,
  type WorkIntelligence,
  type WorkPeriodKey,
  type WorkTrend,
} from "@/lib/journal/work-intelligence";
import { deriveGrowthReading } from "@/lib/journal/growth-reading";
import { deriveAttributionExpectation } from "@/lib/journal/attribution-expectation";
import { JournalWorkTimeCheckAck } from "@/components/app/journal-work-time-check-ack";
import { skillsForProfession } from "@/lib/taxonomy/profession-skills";
import { formatUtcDate } from "@/lib/time/display";

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

function fmtHours(hours: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    hours,
  );
}

function fmtPct(share: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(share);
}

const TIER_CHIP: Record<EvidenceTier, string> = {
  manager_confirmed: "border-state-success/50 text-state-success",
  work_journal: "border-brand-blue/50 text-brand-blue",
  self_declared: "border-ink-500 text-text-muted",
};

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
  const periodHref = (key: WorkPeriodKey): string =>
    labels.periodHref?.(key) ??
    `/dashboard/journal?period=${key}#work-intelligence`;
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
  const directions = (growth?.expand ?? [])
    .map((d) => ({
      ...d,
      name: labels.professionName(d.professionId),
      total: skillsForProfession(d.professionId).length,
      missingNames: d.missingSkills
        .map((s) => labels.skillName(s))
        .filter((n): n is string => n !== null)
        .slice(0, 3),
    }))
    .filter((d) => d.name !== null)
    .slice(0, MAX_DIRECTIONS);

  // Every list below is CAPPED for the page; the totals above them are not.
  // Where a cap cuts, the surface says so ("Rodoma 8 iš 12") — a silent cut
  // read as "these are all my skills" (#1689, REMAINING 2 of the receipts).
  const skillsAll = wi.skills.filter(
    (s) => s.attributedHours > 0 || s.sharedHours > 0 || s.entries > 0,
  );
  const skills = skillsAll.slice(0, MAX_SKILLS);
  const activities = wi.activities.slice(0, MAX_ACTIVITIES);
  const mainActivity = activities[0] ?? null;
  const otherActivities = activities.slice(1);
  const months = wi.months.slice(-MAX_MONTHS);
  const directionsTotal = (growth?.expand ?? []).filter(
    (d) => labels.professionName(d.professionId) !== null,
  ).length;
  const capLine = (
    kind: "skills" | "activities" | "months" | "directions" | "deepen",
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
  const openChecks = wi.checks.filter((c) => c.acknowledged === null);
  const ackedChecks = wi.checks.filter((c) => c.acknowledged !== null);
  const checkSentence = (c: (typeof wi.checks)[number]) =>
    t(`checks.${c.code}`, {
      hours: fmtHours(c.hours, locale),
      day: day(c.day) ?? c.day,
      entries: c.entryIds.length,
      title: c.title ?? t("checks.untitled"),
      ignored: c.ignored
        ? `${fmtHours(c.ignored.value, locale)} ${labels.unitName(c.ignored.unit) ?? c.ignored.unit}`
        : "",
    }) +
    // which ledger doubled the day — the organization's records on top of
    // the journal's lines are named, so the person knows what to compare
    (c.organizationHours > 0
      ? ` ${t("checks.organizationHours", { hours: fmtHours(c.organizationHours, locale) })}`
      : "");
  const periodHasEntries = period.entries > 0;

  // ── 1b · the organization's own hour records (owner §19) ──────────────
  // A ledger beside the journal: shown when it holds anything at all, with
  // the focus period's figure (and the all-time one when the period is
  // empty). `null` = the ledger could not be read → nothing is claimed.
  const orgRecords = wi.organizationRecords;
  const orgPeriod = orgRecords?.find((p) => p.key === wi.focus) ?? null;
  const orgAll = orgRecords?.find((p) => p.key === "all") ?? null;
  const showOrgRecords =
    orgAll !== null && (orgAll.hours > 0 || orgAll.rejectedHours > 0);

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
            <nav
              aria-label={t("periodLabel")}
              className="grid grid-cols-3 gap-2 sm:grid-cols-5"
              data-testid="wi-period-nav"
            >
              {WORK_PERIOD_KEYS.map((key: WorkPeriodKey) => {
                const p = wi.periods.find((x) => x.key === key)!;
                const active = key === wi.focus;
                return (
                  <Link
                    key={key}
                    href={periodHref(key) as "/dashboard"}
                    aria-current={active ? "page" : undefined}
                    data-testid={`wi-period-${key}`}
                    data-hours={p.hours}
                    className={`flex flex-col gap-0.5 rounded-md border px-3 py-2.5 transition-colors ${
                      active
                        ? "border-brand-blue bg-brand-blue/10"
                        : "border-border-subtle bg-surface-1/50 hover:border-brand-blue/60"
                    }`}
                  >
                    <span className="font-mono text-meta uppercase tracking-label text-text-secondary">
                      {t(`period.${key}`)}
                    </span>
                    <span
                      className="font-display text-xl font-bold tabular-nums text-text-primary"
                      data-testid={`wi-period-hours-${key}`}
                    >
                      {h(p.hours)}
                    </span>
                    <span className="text-meta tabular-nums text-text-muted">
                      {p.entries > 0
                        ? t("glance", {
                            days: p.daysWorked,
                            entries: p.entries,
                          })
                        : t("glanceNone")}
                      {p.dayUnits > 0
                        ? ` · ${t("plusDayUnits", { days: fmtHours(p.dayUnits, locale) })}`
                        : ""}
                    </span>
                  </Link>
                );
              })}
            </nav>

            {/* 1a · plausibility checks (owner §13) — warn, never corrupt:
              every figure above and below is exactly what was recorded. */}
            {!org && wi.checks.length > 0 && (
              <div
                className="flex flex-col gap-2"
                data-testid="wi-checks"
                data-open-checks={openChecks.length}
              >
                <h3 className="font-mono text-meta uppercase tracking-label text-text-secondary">
                  {t("checks.title")}
                </h3>
                <p className="text-meta leading-relaxed text-text-muted">
                  {t("checks.hint")}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {openChecks.map((c) => (
                    <li
                      key={c.key}
                      className="flex flex-col gap-1.5 rounded-md border border-state-warning/40 bg-state-warning/5 px-3 py-2"
                      data-testid={`wi-check-${c.code}`}
                      data-check-key={c.key}
                      data-check-day={c.day}
                    >
                      <span className="text-sm leading-relaxed text-text-primary">
                        {checkSentence(c)}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Link
                          href={
                            `/dashboard/journal?date=${c.day}#journal-entries` as "/dashboard"
                          }
                          className="text-meta font-medium text-brand-blue hover:underline"
                          data-testid={`wi-check-open-${c.code}`}
                        >
                          {t("checks.openRecords", { entries: c.entryIds.length })} →
                        </Link>
                        <JournalWorkTimeCheckAck
                          entryId={c.entryIds[0]!}
                          code={c.code}
                          day={c.day}
                          checkKey={c.key}
                        />
                      </span>
                    </li>
                  ))}
                  {ackedChecks.map((c) => (
                    <li
                      key={c.key}
                      className="flex flex-col gap-0.5 rounded-md border border-border-subtle bg-surface-1/40 px-3 py-2"
                      data-testid={`wi-check-acked-${c.code}`}
                      data-check-key={c.key}
                    >
                      <span className="text-meta leading-relaxed text-text-muted">
                        {checkSentence(c)}
                      </span>
                      <span className="text-meta text-text-secondary">
                        {t("checks.acknowledged", {
                          reason: c.acknowledged!.reason,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 1b · the organization's hour records — the second ledger,
              named beside the journal, added to nothing, reaching no skill */}
            {showOrgRecords && orgPeriod && orgAll && (
              <div
                className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface-1/50 px-3 py-2.5"
                data-testid="wi-org-records"
                data-hours={orgPeriod.hours}
                data-all-hours={orgAll.hours}
                data-imported-hours={orgPeriod.importedHours}
                data-linked-hours={orgPeriod.linkedHours}
              >
                <span className="font-mono text-meta uppercase tracking-label text-text-secondary">
                  {tk("orgRecords.title")}
                </span>
                <span
                  className="text-sm leading-relaxed text-text-primary"
                  data-testid="wi-org-records-hours"
                >
                  {orgPeriod.hours > 0
                    ? tk("orgRecords.body", {
                        hours: fmtHours(orgPeriod.hours, locale),
                        days: orgPeriod.daysWorked,
                        period: t(`period.${wi.focus}`),
                        organizations: orgPeriod.organizations,
                      })
                    : tk("orgRecords.periodEmpty", {
                        period: t(`period.${wi.focus}`),
                        hours: fmtHours(orgAll.hours, locale),
                        days: orgAll.daysWorked,
                      })}
                </span>
                {(orgPeriod.importedHours > 0 ||
                  orgPeriod.approvedHours > 0 ||
                  orgPeriod.linkedHours > 0 ||
                  orgPeriod.rejectedHours > 0) && (
                  <span
                    className="text-meta leading-relaxed text-text-muted"
                    data-testid="wi-org-records-provenance"
                  >
                    {[
                      orgPeriod.importedHours > 0
                        ? t("orgRecords.imported", { hours: fmtHours(orgPeriod.importedHours, locale) })
                        : null,
                      orgPeriod.approvedHours > 0
                        ? t("orgRecords.approved", { hours: fmtHours(orgPeriod.approvedHours, locale) })
                        : null,
                      orgPeriod.linkedHours > 0
                        ? t("orgRecords.linked", { hours: fmtHours(orgPeriod.linkedHours, locale) })
                        : null,
                      orgPeriod.rejectedHours > 0
                        ? t("orgRecords.rejected", { hours: fmtHours(orgPeriod.rejectedHours, locale) })
                        : null,
                    ]
                      .filter((x): x is string => x !== null)
                      .join(" · ")}
                  </span>
                )}
                <span
                  className="text-meta leading-relaxed text-text-muted"
                  data-testid="wi-org-records-rule"
                >
                  {tk("orgRecords.rule")}
                </span>
              </div>
            )}

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
                  ) : skills[0] && skills[0].attributedHours > 0 ? (
                    <span
                      className="text-base font-semibold text-text-primary"
                      data-testid="wi-main-skill"
                    >
                      {labels.skillName(skills[0].slug) ?? skills[0].slug}
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

            {/* 4 · skills — attributed practice time vs involvement */}
            {(skills.length > 0 ||
              wi.unattributedHours > 0 ||
              wi.sharedHours > 0 ||
              wi.multiActivityHours > 0) && (
              <div className="flex flex-col gap-2" data-testid="wi-skills">
                <h3 className="font-mono text-meta uppercase tracking-label text-text-secondary">
                  {t("skillsTitle")}
                </h3>
                <p className="text-meta leading-relaxed text-text-muted">
                  {tk("skillsHint")}
                </p>
                {/* the base every % below is a share OF — stated in words,
                  not only in an aria-label: "5 h · 100 %" over 95 unlinked
                  hours was a full bar with no visible base (re-audit F3) */}
                {attribution?.reason && (
                  <p
                    className="text-meta leading-relaxed text-text-secondary"
                    data-testid="wi-attribution-note"
                    data-attribution={attribution.attribution}
                    data-reason={attribution.reason}
                  >
                    {t(`attribution.${attribution.reason}`)}
                  </p>
                )}
                {period.hours > 0 && (
                  <p
                    className="text-meta leading-relaxed text-text-secondary"
                    data-testid="wi-skills-coverage"
                    data-attributed-hours={wi.attributedHours}
                    data-period-hours={period.hours}
                  >
                    {t("skillsCoverage", {
                      attributed: fmtHours(wi.attributedHours, locale),
                      total: fmtHours(period.hours, locale),
                      period: t(`period.${wi.focus}`),
                    })}
                  </p>
                )}
                {skills.length > 0 && (
                  <ul className="flex flex-col gap-1.5">
                    {skills.map((s) => {
                      const name = labels.skillName(s.slug) ?? s.slug;
                      const last = day(s.lastWorkedDay);
                      return (
                        <li
                          key={s.skillId}
                          className="flex flex-col gap-1"
                          data-testid={`wi-skill-${s.slug}`}
                          data-attributed-hours={s.attributedHours}
                          data-shared-hours={s.sharedHours}
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                            {org ? (
                              <span
                                className="text-sm font-medium text-text-primary"
                                data-testid={`wi-skill-name-${s.slug}`}
                              >
                                {name}
                              </span>
                            ) : (
                              <Link
                                href={
                                  `/dashboard/journal?skill=${s.slug}#journal-entries` as "/dashboard"
                                }
                                className="text-sm font-medium text-text-primary underline-offset-2 hover:underline"
                                data-testid={`wi-skill-link-${s.slug}`}
                              >
                                {name}
                              </Link>
                            )}
                            <span className="flex flex-wrap items-baseline gap-x-2 text-meta tabular-nums text-text-muted">
                              {s.attributedHours > 0 ? (
                                <span
                                  className="font-medium text-text-primary"
                                  data-testid={`wi-skill-share-${s.slug}`}
                                >
                                  {h(s.attributedHours)}
                                  {wi.attributedHours > 0 && s.share > 0
                                    ? ` · ${t("shareOf", {
                                        percent: fmtPct(s.share, locale),
                                        base: fmtHours(wi.attributedHours, locale),
                                      })}`
                                    : ""}
                                </span>
                              ) : (
                                <span>{t("noAttributedHours")}</span>
                              )}
                              {s.sharedHours > 0 && (
                                <span data-testid={`wi-skill-shared-${s.slug}`}>
                                  {t("sharedWithOthers", {
                                    hours: fmtHours(s.sharedHours, locale),
                                  })}
                                </span>
                              )}
                            </span>
                          </div>
                          <div
                            className="h-1.5 w-full overflow-hidden rounded-full bg-ink-700/60"
                            role="img"
                            aria-label={t("shareAria", {
                              name,
                              percent: fmtPct(s.share, locale),
                            })}
                          >
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-brand-blue to-brand-cyan"
                              style={{
                                width: `${Math.round(Math.min(1, s.share) * 100)}%`,
                              }}
                            />
                          </div>
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-meta text-text-muted">
                            <span
                              className={`rounded-full border px-1.5 py-px text-[0.65rem] ${TIER_CHIP[s.tier]}`}
                              data-testid={`wi-skill-tier-${s.slug}`}
                              data-tier={s.tier}
                            >
                              {tTier(EVIDENCE_TIER_MESSAGE_KEY[s.tier])}
                            </span>
                            <span>
                              {t("frequency", {
                                entries: s.entries,
                                days: s.days,
                                contexts: s.contexts,
                              })}
                            </span>
                            {last && (
                              <span>{t("lastWorked", { day: last })}</span>
                            )}
                            {s.confirmedHours > 0 && (
                              <span
                                data-testid={`wi-skill-confirmed-${s.slug}`}
                              >
                                {t("skillConfirmed", {
                                  hours: fmtHours(s.confirmedHours, locale),
                                })}
                              </span>
                            )}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {capLine("skills", skills.length, skillsAll.length)}
                {/* the honest remainder — what no skill can claim yet */}
                {wi.sharedHours > 0 && (
                  <p
                    className="text-meta leading-relaxed text-text-muted"
                    data-testid="wi-shared-hours"
                  >
                    {t("sharedHours", {
                      hours: fmtHours(wi.sharedHours, locale),
                      count: wi.sharedEntries,
                    })}
                  </p>
                )}
                {wi.multiActivityHours > 0 && (
                  <p
                    className="text-meta leading-relaxed text-text-muted"
                    data-testid="wi-multi-activity-hours"
                  >
                    {t("multiActivityHours", {
                      hours: fmtHours(wi.multiActivityHours, locale),
                      count: wi.multiActivityEntries,
                    })}
                  </p>
                )}
                {wi.unattributedHours > 0 && (
                  <p
                    className="text-meta leading-relaxed text-text-muted"
                    data-testid="wi-unattributed-hours"
                  >
                    {tk("unattributedHours", {
                      hours: fmtHours(wi.unattributedHours, locale),
                      count: wi.unattributedEntries,
                    })}
                  </p>
                )}
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
                  {directions.length > 0 && (
              <div
                className="flex flex-col gap-1.5"
                data-testid="wi-directions"
              >
                <h4 className="text-meta font-medium text-text-secondary">
                  {t("directionsTitle")}
                </h4>
                <p className="text-meta leading-relaxed text-text-muted">
                  {t("directionsHint")}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {directions.map((d) => (
                    <li
                      key={d.professionId}
                      className="flex flex-col gap-0.5 rounded-md border border-border-subtle bg-surface-1/40 px-3 py-2"
                      data-testid={`wi-direction-${d.professionId}`}
                    >
                      <span className="text-sm font-medium text-text-primary">
                        {d.name}
                      </span>
                      <span className="text-meta text-text-muted">
                        {t("directionCoverage", {
                          shared: d.sharedCount,
                          total: d.total,
                        })}
                        {d.missingNames.length > 0
                          ? ` · ${t("directionMissing", { skills: d.missingNames.join(", ") })}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                {capLine("directions", directions.length, directionsTotal)}
              </div>
                  )}
                  {/* demand is not read on this page — the board is where
                      real needs are; said, not implied (UNKNOWN ≠ ZERO) */}
                  <p className="text-meta text-text-muted" data-testid="wi-growth-demand-note">
                    {t("growthDemandNote")}{" "}
                    <Link
                      href={"/dashboard/opportunities" as "/dashboard"}
                      className="font-medium text-brand-blue hover:underline"
                    >
                      {t("openOpportunities")} →
                    </Link>
                  </p>
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

            {/* 9 · provenance — where every hour came from */}
            {hasAnyHours && (
              <p
                className="text-meta leading-relaxed text-text-muted"
                data-testid="wi-provenance"
              >
                {tk("provenance", {
                  worker: fmtHours(wi.provenance.workerInput, locale),
                  extracted: fmtHours(wi.provenance.aiExtracted, locale),
                  corrected: fmtHours(wi.provenance.managerCorrected, locale),
                })}{" "}
                {tk("provenanceRule")}
                {/* an entry with no stated work day is placed by the UTC day
                    it was saved — said, never silently a fact (re-audit F10) */}
                {period.entriesDayInferred > 0 ? (
                  <>
                    {" "}
                    <span data-testid="wi-day-inferred">
                      {t("dayInferred", { count: period.entriesDayInferred })}
                    </span>
                  </>
                ) : null}
              </p>
            )}
          </>
        )}
      </Card>
    </section>
  );
}
