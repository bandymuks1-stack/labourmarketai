import type { ReactNode } from "react";

import { Link } from "@/lib/i18n/navigation";
import {
  EVIDENCE_TIER_MESSAGE_KEY,
  type EvidenceTier,
} from "@/lib/evidence/evidence-tier";
import type { WorkTrend } from "@/lib/journal/work-intelligence";
import type { SkillRowView } from "@/lib/journal/work-in-numbers-view";

import { fmtHours, fmtPct, type Translate } from "./format";

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

/**
 * SHARE BARS PER SKILL — the one rendering of "kam skirtas laikas" the
 * journal page's block and the Work-in-Numbers station both use.
 *
 * Every bar's width IS the row's share of the person's own attributed
 * hours, and the number is printed beside it (state never only colour).
 * The base every % is a share OF is stated in words above the list
 * (re-audit F3). Per row: measured hours · share · entries · days ·
 * contexts · first/last worked day · confirmation share (of the row's own
 * attributed hours, named as the manager's record) · trend glyph WITH its
 * text · outputs in their recorded unit. An untimed row is entries without
 * hours (NOT_MEASURED), never "0 h"; an involved-only row names its
 * involvement, never a split.
 */
export function SkillShareList({
  rows,
  attributedHours,
  periodHours,
  periodWord,
  locale,
  t,
  tk = t,
  tTier,
  linkHref,
  unitName,
  dayLabel,
  attributionNote,
  capNote,
  title,
}: {
  rows: readonly SkillRowView[];
  /** The denominator of every share — the person's attributed hours. */
  attributedHours: number;
  /** The focus period's recorded hours — the base the attributed part is
   *  stated against. */
  periodHours: number;
  /** The scope in words. */
  periodWord: string;
  locale: string;
  /** Bound to `journal.intelligence`. */
  t: Translate;
  /** Audience-aware translator (organization wording); defaults to `t`. */
  tk?: Translate;
  /** Bound to `evidenceTier`. */
  tTier: Translate;
  /** Diary deep link for a skill (the person's own view); null = plain
   *  text (the organization view never links into someone's diary). */
  linkHref: ((slug: string) => string) | null;
  unitName: (slug: string) => string | null;
  dayLabel: (iso: string | null) => string | null;
  /** The kind-of-work attribution expectation, when one was read. */
  attributionNote?: { reason: string | null; attribution: string } | null;
  /** "Showing N of M" when the caller capped the list. */
  capNote?: ReactNode;
  /** Section heading override (the station asks the question in its own
   *  words); defaults to `skillsTitle`. */
  title?: string;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid="wi-skills">
      <h3 className="font-mono text-meta uppercase tracking-label text-text-secondary">
        {title ?? t("skillsTitle")}
      </h3>
      <p className="text-meta leading-relaxed text-text-muted">{tk("skillsHint")}</p>
      {attributionNote?.reason && (
        <p
          className="text-meta leading-relaxed text-text-secondary"
          data-testid="wi-attribution-note"
          data-attribution={attributionNote.attribution}
          data-reason={attributionNote.reason}
        >
          {t(`attribution.${attributionNote.reason}`)}
        </p>
      )}
      {/* the base every % below is a share OF — stated in words, not only
          in an aria-label (re-audit F3) */}
      {periodHours > 0 && (
        <p
          className="text-meta leading-relaxed text-text-secondary"
          data-testid="wi-skills-coverage"
          data-attributed-hours={attributedHours}
          data-period-hours={periodHours}
        >
          {t("skillsCoverage", {
            attributed: fmtHours(attributedHours, locale),
            total: fmtHours(periodHours, locale),
            period: periodWord,
          })}
        </p>
      )}
      {rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {rows.map((s) => {
            const name = s.name ?? s.slug;
            const first = dayLabel(s.firstWorkedDay);
            const last = dayLabel(s.lastWorkedDay);
            const trendText =
              s.trend === "none" ? null : t(`numbers.trendShort.${s.trend}`);
            return (
              <li
                key={s.skillId}
                className="flex flex-col gap-1"
                data-testid={`wi-skill-${s.slug}`}
                data-attributed-hours={s.attributedHours}
                data-shared-hours={s.sharedHours}
                data-share={s.share}
                data-measured={s.measured}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  {linkHref === null ? (
                    <span
                      className="text-support font-medium text-text-primary"
                      data-testid={`wi-skill-name-${s.slug}`}
                    >
                      {name}
                    </span>
                  ) : (
                    <Link
                      href={linkHref(s.slug) as "/dashboard"}
                      className="inline-flex min-h-11 items-center text-support font-medium text-text-primary underline-offset-2 hover:underline"
                      data-testid={`wi-skill-link-${s.slug}`}
                    >
                      {name}
                    </Link>
                  )}
                  <span className="flex flex-wrap items-baseline gap-x-2 text-meta tabular-nums text-text-muted">
                    {s.measured ? (
                      <span
                        className="font-medium text-text-primary"
                        data-testid={`wi-skill-share-${s.slug}`}
                      >
                        {t("hours", { hours: fmtHours(s.attributedHours, locale) })}
                        {attributedHours > 0 && s.share > 0
                          ? ` · ${t("shareOf", {
                              percent: fmtPct(s.share, locale),
                              base: fmtHours(attributedHours, locale),
                            })}`
                          : ""}
                      </span>
                    ) : s.untimed ? (
                      <span data-testid={`wi-skill-untimed-${s.slug}`}>{t("numbers.notMeasured")}</span>
                    ) : (
                      <span>{t("noAttributedHours")}</span>
                    )}
                    {s.sharedHours > 0 && (
                      <span data-testid={`wi-skill-shared-${s.slug}`}>
                        {t("sharedWithOthers", { hours: fmtHours(s.sharedHours, locale) })}
                      </span>
                    )}
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-ink-700/60"
                  role="img"
                  aria-label={t("shareAria", { name, percent: fmtPct(s.share, locale) })}
                  data-testid={`wi-skill-bar-${s.slug}`}
                  data-width={s.barWidth}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-blue to-brand-cyan"
                    style={{ width: `${s.barWidth}%` }}
                  />
                </div>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-meta text-text-muted">
                  <span
                    className={`rounded-full border px-1.5 py-px text-meta ${TIER_CHIP[s.tier]}`}
                    data-testid={`wi-skill-tier-${s.slug}`}
                    data-tier={s.tier}
                  >
                    {tTier(EVIDENCE_TIER_MESSAGE_KEY[s.tier])}
                  </span>
                  <span>
                    {t("frequency", { entries: s.entries, days: s.days, contexts: s.contexts })}
                  </span>
                  {first && first !== last && (
                    <span data-testid={`wi-skill-first-${s.slug}`}>{t("numbers.skillFirst", { day: first })}</span>
                  )}
                  {last && <span>{t("lastWorked", { day: last })}</span>}
                  {s.measured ? (
                    s.confirmedHours > 0 ? (
                      <span
                        data-testid={`wi-skill-confirmed-${s.slug}`}
                        data-confirmation-share={s.confirmationShare ?? undefined}
                      >
                        {t("numbers.confirmationShare", {
                          percent: fmtPct(s.confirmationShare ?? 0, locale),
                          confirmed: fmtHours(s.confirmedHours, locale),
                          attributed: fmtHours(s.attributedHours, locale),
                        })}
                      </span>
                    ) : (
                      <span data-testid={`wi-skill-unconfirmed-${s.slug}`}>{t("numbers.confirmationNone")}</span>
                    )
                  ) : null}
                  {trendText && (
                    <span data-testid={`wi-skill-trend-${s.slug}`} data-trend={s.trend} title={t(`trend.${s.trend}`)}>
                      {TREND_GLYPH[s.trend] ? (
                        <span aria-hidden className="mr-0.5">{TREND_GLYPH[s.trend]}</span>
                      ) : null}
                      {trendText}
                    </span>
                  )}
                  {s.outputs.map((o) => (
                    <span
                      key={o.unit}
                      className="text-text-secondary"
                      data-testid={`wi-skill-output-${s.slug}`}
                      data-unit={o.unit}
                    >
                      {t("numbers.skillOutput", {
                        value: fmtHours(o.value, locale),
                        unit: unitName(o.unit) ?? o.unit,
                      })}
                    </span>
                  ))}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {capNote}
    </div>
  );
}
