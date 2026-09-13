import type { ReactNode } from "react";

import { Link } from "@/lib/i18n/navigation";
import type { GrowthDirection } from "@/lib/journal/growth-reading";

import { fmtHours, fmtPct, type Translate } from "./format";

/** The skill-kinds of the growth reading — every direction except the
 *  adjacent one, which is rendered by the directions block. */
export type GrowthSkillDirection = Exclude<GrowthDirection, { kind: "adjacent_opportunity" }>;

export type GrowthKindRow = GrowthSkillDirection & { readonly name: string };

export type GrowthDirectionRow = {
  readonly professionId: string;
  readonly name: string;
  readonly sharedCount: number;
  readonly total: number;
  readonly missingNames: readonly string[];
};

/**
 * WHY, in figures — every kind sentence names the evidence it was decided
 * on: hours and share (or involvement, or "entries without a duration" —
 * NOT_MEASURED is never 0 h), entries and contexts, dormancy, last day,
 * trend. Self-stated says its zeros. Shared by the section and the station
 * so one kind reads the same everywhere.
 */
export function growthKindWhy(
  d: GrowthSkillDirection,
  locale: string,
  t: Translate,
  dayLabel: (iso: string | null) => string | null,
): string {
  if (d.kind === "self_stated") return t("growthWhySelfStated");
  const w = d.why;
  const parts: string[] = [
    w.attributedHours > 0
      ? t("growthWhyHours", { hours: fmtHours(w.attributedHours, locale), percent: fmtPct(w.share, locale) })
      : w.sharedHours > 0
        ? t("growthWhyInvolved", { hours: fmtHours(w.sharedHours, locale) })
        : t("growthWhyUntimed"),
    t("growthWhyCounts", { entries: w.entries, contexts: w.contexts }),
  ];
  if (d.kind === "underused") parts.push(t("growthWhyDormant", { days: d.why.dormantDays }));
  const last = dayLabel(w.lastWorkedDay);
  if (last) parts.push(t("growthWhyLastDay", { day: last }));
  if (w.trend !== "none") parts.push(t(`growthWhyTrend.${w.trend}`));
  return parts.join(" · ");
}

/**
 * GROWTH KINDS (owner requirement 5, #1689 — lane D): CORE STRENGTH ·
 * GROWING · UNDERUSED · SELF-STATED (not evidenced) · ADJACENT OPPORTUNITY,
 * each with its WHY in figures. A formal-qualification gap is not emitted
 * by the model and is therefore not shown — nothing is invented. Never a
 * score, a rank or a tier of the person; the reading is labelled derived
 * by the caller's hint above it.
 */
export function GrowthKinds({
  kinds,
  directions,
  locale,
  t,
  dayLabel,
  kindsCap,
  directionsCap,
}: {
  kinds: readonly GrowthKindRow[];
  directions: readonly GrowthDirectionRow[];
  locale: string;
  /** Bound to `journal.intelligence`. */
  t: Translate;
  dayLabel: (iso: string | null) => string | null;
  kindsCap?: ReactNode;
  directionsCap?: ReactNode;
}) {
  if (kinds.length === 0 && directions.length === 0) return null;
  return (
    <>
      {kinds.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="wi-growth-kinds">
          <h4 className="text-meta font-medium text-text-secondary">{t("growthKindsTitle")}</h4>
          <p className="text-meta leading-relaxed text-text-muted">{t("growthKindsHint")}</p>
          <ul className="flex flex-col gap-1.5">
            {kinds.map((d) => (
              <li
                key={`${d.kind}:${d.slug}`}
                className="flex flex-col gap-0.5 text-meta text-text-muted"
                data-testid={`wi-kind-${d.slug}`}
                data-kind={d.kind}
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="rounded-md border border-border-subtle px-1.5 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary">
                    {t(`growthKind.${d.kind}`)}
                  </span>
                  <span className="text-support font-medium text-text-primary">{d.name}</span>
                </span>
                <span className="leading-relaxed">{growthKindWhy(d, locale, t, dayLabel)}</span>
              </li>
            ))}
          </ul>
          {kindsCap}
        </div>
      )}
      {directions.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="wi-directions" data-kind="adjacent_opportunity">
          <h4 className="flex flex-wrap items-center gap-x-2 text-meta font-medium text-text-secondary">
            {t("directionsTitle")}
            <span className="rounded-md border border-border-subtle px-1.5 py-0.5 font-mono text-meta font-normal uppercase tracking-label text-text-secondary">
              {t("growthKind.adjacent_opportunity")}
            </span>
          </h4>
          <p className="text-meta leading-relaxed text-text-muted">{t("directionsHint")}</p>
          <ul className="flex flex-col gap-1.5">
            {directions.map((d) => (
              <li
                key={d.professionId}
                className="flex flex-col gap-0.5 rounded-md border border-border-subtle bg-surface-1/40 px-3 py-2"
                data-testid={`wi-direction-${d.professionId}`}
              >
                <span className="text-support font-medium text-text-primary">{d.name}</span>
                <span className="text-meta text-text-muted">
                  {t("directionCoverage", { shared: d.sharedCount, total: d.total })}
                  {d.missingNames.length > 0
                    ? ` · ${t("directionMissing", { skills: d.missingNames.join(", ") })}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
          {directionsCap}
        </div>
      )}
      {/* demand is not read on this surface — the board is where real needs
          are; said, not implied (UNKNOWN ≠ ZERO) */}
      <p className="text-meta text-text-muted" data-testid="wi-growth-demand-note">
        {t("growthDemandNote")}{" "}
        <Link
          href={"/dashboard/opportunities" as "/dashboard"}
          className="inline-flex min-h-11 items-center font-medium text-brand-blue hover:underline"
        >
          {t("openOpportunities")} →
        </Link>
      </p>
    </>
  );
}
