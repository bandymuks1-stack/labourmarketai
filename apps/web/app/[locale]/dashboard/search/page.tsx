import { getTranslations, setRequestLocale } from "next-intl/server";
import { Search, Target, ClipboardList, ArrowRight } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";

/**
 * Worker search room.
 *
 * There is no free-text "type a keyword, get a list of people" search yet —
 * building one before there is honest, consented, verified worker supply would
 * mean faking results. So instead of a dead "coming later" placeholder, this
 * page is honest about what IS the working way to reach workers today:
 *   1. pick a structured need and let the deterministic match engine surface
 *      candidates (/dashboard/company/scouting), or
 *   2. post a need and let it be structured first (/dashboard/company).
 *
 * Both CTAs link to real, existing routes. No fake filters, no fake results,
 * no milestone labels.
 */

const ROUTES = [
  {
    key: "scouting",
    href: "/dashboard/company/scouting",
    icon: Target,
  },
  {
    key: "need",
    href: "/dashboard/company",
    icon: ClipboardList,
  },
] as const;

export default async function SearchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("searchRoom");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="self-start text-xs font-medium text-brand-blue transition-colors hover:underline"
          data-testid="back-to-action-center"
        >
          ← {t("backToActions")}
        </Link>
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold tracking-tightest text-text-primary">
          <Search className="h-7 w-7 text-brand-blue" strokeWidth={1.75} aria-hidden />
          {t("title")}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
          {t("subtitle")}
        </p>
      </header>

      {/* Honest reason — why there is no free-text people search yet. */}
      <p
        className="rounded-md border border-state-warning/40 bg-state-warning/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
        data-testid="search-honest-reason"
      >
        {t("reason")}
      </p>

      {/* The two real ways to reach workers today. */}
      <div className="grid gap-3 sm:grid-cols-2" data-testid="search-real-paths">
        {ROUTES.map(({ key, href, icon: Icon }) => (
          <Link
            key={key}
            href={href as "/dashboard"}
            data-testid={`search-path-${key}`}
            className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface-1 p-4 transition-colors hover:border-brand-blue"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Icon className="h-4 w-4 shrink-0 text-brand-blue" strokeWidth={1.75} aria-hidden />
              {t(`paths.${key}.title`)}
            </span>
            <span className="text-xs leading-relaxed text-text-secondary">
              {t(`paths.${key}.body`)}
            </span>
            <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-brand-blue">
              {t(`paths.${key}.cta`)}
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </span>
          </Link>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-text-muted" data-testid="search-matching-note">
        {t("matchingNote")}
      </p>
    </div>
  );
}
