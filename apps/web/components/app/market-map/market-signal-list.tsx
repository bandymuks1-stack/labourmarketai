import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, BriefcaseBusiness, Compass, MapPin, Sparkles } from "lucide-react";

import { ServiceMark } from "@/components/app/identity/identity-family";
import { Link } from "@/lib/i18n/navigation";
import { formatUtcDate } from "@/lib/time/display";
import {
  MARKET_SIGNAL_LAYER,
  visibleMarketSignals,
  type MarketBrief,
  type MarketSignalKey,
  type PlaceSignal,
} from "@/lib/market-map/market-brief-model";
import { cn } from "@/lib/utils";

/**
 * THE MARKET SIGNALS — one list, drawn on the home (variant `home`) and in the
 * map's signals rail (variant `rail`), from ONE `MarketBrief`. The two
 * surfaces read the same sentences because they are the same component.
 *
 * Every row is a real edge: it opens the ONE canonical map on the layer that
 * shows exactly that signal (`/dashboard/market-map?layer=…`). There is no
 * decorative signal — a row exists because its reader answered (`known`),
 * answered "nothing" (`empty`, said once in words) or failed (`unknown`,
 * named; never a zero). See `lib/market-map/market-brief-model.ts` for what
 * the brief refuses to carry (no ratio, no rate, no match, no people count).
 */

const MARK_ICON: Readonly<Record<MarketSignalKey, ReactNode>> = {
  needs: <Compass className="h-[46%] w-[46%]" aria-hidden />,
  vacancies: <BriefcaseBusiness className="h-[46%] w-[46%]" aria-hidden />,
  projects: <Sparkles className="h-[46%] w-[46%]" aria-hidden />,
  territory: <MapPin className="h-[46%] w-[46%]" aria-hidden />,
};

type Row = {
  readonly key: MarketSignalKey;
  readonly label: string;
  readonly line: string;
  readonly detail: readonly string[];
  readonly state: "known" | "empty" | "unknown";
};

/** An unambiguous date ("5 Oct 2026"), never "10/5/2026" — day-month order is
 *  the reader's locale's business, the month is a word. */
const DATE_SHORT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

export function marketSignalHref(key: MarketSignalKey): string {
  return `/dashboard/market-map?layer=${MARKET_SIGNAL_LAYER[key]}`;
}

export async function MarketSignalList({
  brief,
  variant,
}: {
  readonly brief: MarketBrief;
  readonly variant: "home" | "rail";
}) {
  const [t, tProf, locale] = await Promise.all([
    getTranslations("marketMap.signals"),
    getTranslations("professions"),
    getLocale(),
  ]);
  const profession = (slug: string) => (tProf.has(slug) ? tProf(slug) : slug);

  const place = (key: "needs" | "projects", s: PlaceSignal): Row => {
    const label = t(`${key}.label`);
    if (s.state === "unknown") {
      return { key, label, line: t(`${key}.unknown`), detail: [], state: "unknown" };
    }
    if (s.state === "empty") {
      // Projects with none to name are not drawn at all; only needs says "none".
      return { key, label, line: t("needs.empty"), detail: [], state: "empty" };
    }
    const detail: string[] = [];
    if (s.places > 0) detail.push(t("places", { places: s.places }));
    const newest = formatUtcDate(s.newestAt, locale, DATE_SHORT);
    if (newest) detail.push(t("newest", { date: newest }));
    if (s.unplaced > 0) detail.push(t("unplaced", { count: s.unplaced }));
    return {
      key,
      label,
      line: t(`${key}.line`, { count: s.count, lower: s.lowerBound ? "yes" : "no" }),
      detail,
      state: "known",
    };
  };

  const rows: Row[] = [];
  for (const key of visibleMarketSignals(brief)) {
    if (key === "needs") rows.push(place("needs", brief.needs));
    else if (key === "projects") rows.push(place("projects", brief.projects));
    else if (key === "vacancies" && brief.vacancies.state !== "absent") {
      const v = brief.vacancies;
      const label = t("vacancies.label");
      if (v.state === "empty") {
        rows.push({
          key,
          label,
          line: t("vacancies.empty", { profession: profession(v.professionSlug) }),
          detail: v.derived ? [t("vacancies.derived")] : [],
          state: "empty",
        });
      } else {
        const detail = [t("vacancies.fresh", { n7: v.newAds7d, n30: v.newAds30d })];
        const measured = formatUtcDate(v.measuredAtIso, locale, DATE_SHORT);
        if (measured) detail.push(t("measured", { date: measured }));
        if (v.derived) detail.push(t("vacancies.derived"));
        rows.push({
          key,
          label,
          line: t("vacancies.line", { count: v.ads, profession: profession(v.professionSlug) }),
          detail,
          state: "known",
        });
      }
    } else if (key === "territory" && brief.territory.state === "known") {
      rows.push({
        key,
        label: t("territory.label"),
        line: t("territory.line", { places: brief.territory.places }),
        detail: [],
        state: "known",
      });
    }
  }

  return (
    <ul
      data-testid={variant === "home" ? "home-market-signals" : "market-signals-list"}
      className={cn("flex flex-col", variant === "rail" && "divide-y divide-text-primary/10")}
    >
      {rows.map((r) => (
        <li key={r.key} data-signal={r.key} data-state={r.state}>
          <Link
            href={marketSignalHref(r.key) as "/dashboard"}
            data-testid={`market-signal-${r.key}`}
            aria-label={`${r.label}: ${r.line}`}
            className={cn(
              "group grid min-h-11 items-center gap-x-4 gap-y-1 transition-colors hover:bg-text-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
              variant === "home"
                ? "grid-cols-[auto_1fr] border-t border-text-primary/10 px-5 py-4 first:border-t-0 md:grid-cols-[auto_1fr_auto] md:px-6"
                : "grid-cols-[1fr_auto] px-1 py-3",
            )}
          >
            {variant === "home" ? (
              <ServiceMark id={`market:${r.key}`} size={44} icon={MARK_ICON[r.key]} label="" />
            ) : null}
            <span className="min-w-0">
              <span className="block font-mono text-meta uppercase tracking-label text-text-muted">{r.label}</span>
              <span
                className={cn(
                  "block text-body",
                  r.state === "unknown" ? "text-state-amber" : "text-text-primary",
                )}
                role={r.state === "unknown" ? "status" : undefined}
              >
                {r.line}
              </span>
              {r.detail.length > 0 ? (
                <span className="mt-0.5 block text-support text-text-muted">{r.detail.join(" · ")}</span>
              ) : null}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-support font-medium text-brand-blue",
                variant === "home" && "max-md:col-span-2",
              )}
            >
              <span className={variant === "rail" ? "sr-only" : undefined}>{t("show")}</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
