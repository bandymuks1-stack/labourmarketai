import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { Link } from "@/lib/i18n/navigation";
import {
  EVIDENCE_TIER_MESSAGE_KEY,
  type EvidenceTier,
} from "@/lib/evidence/evidence-tier";
import {
  evidencedSkillSlugs,
  WORK_PERIOD_KEYS,
  type WorkIntelligence,
  type WorkPeriodKey,
  type WorkTrend,
} from "@/lib/journal/work-intelligence";
import { computeAdjacentDirections } from "@/lib/opportunities/adjacent-directions";
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
 *   7. Where could it lead?     adjacent directions from EVIDENCED skills only
 *   8. What does it feed?       the Living CV and the opportunities board
 *   9. Where do the numbers come from?  provenance footnote
 *
 * ── HONESTY ───────────────────────────────────────────────────────────────
 *   · a skill's hours are the entries where it was the ONLY linked skill;
 *     involvement (shared) hours are listed, never summed — an 8-hour entry
 *     with four skills is 8 hours, not 32 (owner rule §5);
 *   · a share is a fraction of the person's OWN attributed hours — no score,
 *     no rating, no rank, no person tier (the tier word is the skill row's
 *     evidence ladder, from the one `evidenceTier` namespace);
 *   · a direction is "your recorded work already covers N of M skills of X",
 *     never "you are qualified for X";
 *   · confirmed hours light up ONLY from an approved confirmation row; zero
 *     is shown as zero of the total, never hidden;
 *   · an unreadable model renders nothing (the caller passes null) — it never
 *     renders a zero that reads as "no work" (SEP-7).
 *
 * No internal vocabulary reaches the person: no `journal_entry_skills`, no
 * `fragment_time`, no provenance enum names — every word is an i18n key.
 */

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
}: {
  wi: WorkIntelligence;
  locale: string;
  labels: WorkIntelligenceLabels;
}) {
  const t = await getTranslations("journal.intelligence");
  const tTier = await getTranslations("evidenceTier");
  const period =
    wi.periods.find((p) => p.key === wi.focus) ??
    wi.periods[wi.periods.length - 1]!;
  const h = (n: number) => t("hours", { hours: fmtHours(n, locale) });
  const day = (iso: string | null) =>
    iso
      ? (formatUtcDate(iso, locale, { month: "short", day: "numeric" }) ?? iso)
      : null;
  const activityName = (key: string) => labels.professionName(key) ?? key;

  // ── growth: adjacent directions from EVIDENCED skills only ────────────
  const evidenced = evidencedSkillSlugs(wi);
  const adjacency = computeAdjacentDirections({
    workerSkillSlugs: evidenced,
    primaryProfessionSlug: labels.primaryProfessionSlug,
  });
  const directions = adjacency.directions
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

  const skills = wi.skills
    .filter((s) => s.attributedHours > 0 || s.sharedHours > 0 || s.entries > 0)
    .slice(0, MAX_SKILLS);
  const activities = wi.activities.slice(0, MAX_ACTIVITIES);
  const mainActivity = activities[0] ?? null;
  const otherActivities = activities.slice(1);
  const months = wi.months.slice(-MAX_MONTHS);
  const monthMax = Math.max(0, ...months.map((m) => m.hours));
  const hasAnyHours = wi.totalHours > 0;
  const noEntriesAtAll = wi.totalEntries === 0;
  const periodHasEntries = period.entries > 0;

  return (
    <section
      id="work-intelligence"
      className="scroll-mt-20"
      data-testid="journal-work-intelligence"
      data-period={wi.focus}
      data-total-hours={wi.totalHours}
    >
      <Card compact className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {t("title")}
          </h2>
          <p className="text-meta leading-relaxed text-text-muted">
            {t("subtitle")}
          </p>
        </header>

        {noEntriesAtAll ? (
          <p
            className="text-sm leading-relaxed text-text-secondary"
            data-testid="wi-empty"
          >
            {t("emptyNoEntries")}
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
                    href={
                      `/dashboard/journal?period=${key}#work-intelligence` as "/dashboard"
                    }
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

            {!hasAnyHours && (
              <p
                className="text-sm leading-relaxed text-text-secondary"
                data-testid="wi-empty-hours"
              >
                {t("emptyNoHours", { count: wi.totalEntries })}
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
                        <span className="ml-2 font-normal tabular-nums text-text-secondary">
                          {h(mainActivity.hours)}
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
                  >
                    {period.hours > 0
                      ? t("confirmedOf", {
                          confirmed: fmtHours(period.confirmedHours, locale),
                          total: fmtHours(period.hours, locale),
                        })
                      : t("confirmedNone")}
                  </span>
                  <span
                    className="text-meta leading-relaxed text-text-muted"
                    data-testid="wi-evidence-strength"
                  >
                    {t("evidenceStrength", {
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
                  {t("skillsHint")}
                </p>
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
                            <Link
                              href={
                                `/dashboard/journal?skill=${s.slug}#journal-entries` as "/dashboard"
                              }
                              className="text-sm font-medium text-text-primary underline-offset-2 hover:underline"
                              data-testid={`wi-skill-link-${s.slug}`}
                            >
                              {name}
                            </Link>
                            <span className="flex flex-wrap items-baseline gap-x-2 text-meta tabular-nums text-text-muted">
                              {s.attributedHours > 0 ? (
                                <span className="font-medium text-text-primary">
                                  {h(s.attributedHours)}
                                  {wi.attributedHours > 0 && s.share > 0
                                    ? ` · ${fmtPct(s.share, locale)}`
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
                    {t("unattributedHours", {
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
                    <ul className="flex flex-col gap-1">
                      {activities.map((a) => (
                        <li
                          key={a.key}
                          className="flex items-baseline justify-between gap-3 text-sm"
                          data-testid="wi-activity"
                          data-trend={a.trend}
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
                            {h(a.hours)} ·{" "}
                            {t("activityMeta", {
                              entries: a.entries,
                              contexts: a.contexts,
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
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
                            key={o.unit}
                            className="flex items-baseline justify-between gap-3 text-sm"
                            data-testid="wi-output"
                          >
                            <span className="min-w-0 truncate text-text-primary">
                              {fmtHours(o.value, locale)}{" "}
                              {labels.unitName(o.unit) ?? o.unit}
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
              </div>
            )}

            {/* 7 · where the evidenced work already points */}
            {directions.length > 0 && (
              <div
                className="flex flex-col gap-1.5"
                data-testid="wi-directions"
              >
                <h3 className="font-mono text-meta uppercase tracking-label text-text-secondary">
                  {t("directionsTitle")}
                </h3>
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
              </div>
            )}

            {/* 8 · what the evidence feeds */}
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

            {/* 9 · provenance — where every hour came from */}
            {hasAnyHours && (
              <p
                className="text-meta leading-relaxed text-text-muted"
                data-testid="wi-provenance"
              >
                {t("provenance", {
                  worker: fmtHours(wi.provenance.workerInput, locale),
                  extracted: fmtHours(wi.provenance.aiExtracted, locale),
                  corrected: fmtHours(wi.provenance.managerCorrected, locale),
                })}{" "}
                {t("provenanceRule")}
              </p>
            )}
          </>
        )}
      </Card>
    </section>
  );
}
