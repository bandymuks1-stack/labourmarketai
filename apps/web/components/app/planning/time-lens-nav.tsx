import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { lensHref, TIME_LENSES, type TimeLens } from "@/lib/planning/time-lens";
import { cn } from "@/lib/utils";

/**
 * THE THREE PERSPECTIVES — MY TIME · PEOPLE IN TIME · PROJECTS IN TIME.
 *
 * Plain links (the URL is the state), 44px targets. The two manager
 * perspectives are offered only to someone who manages a team or a project;
 * for everyone else the bar is not drawn at all, so a worker is never handed
 * two tabs that can only apologise.
 */
export async function TimeLensNav({
  active,
  date,
  today,
  lenses,
}: {
  readonly active: TimeLens;
  readonly date: string;
  readonly today: string;
  readonly lenses: readonly TimeLens[];
}) {
  const t = await getTranslations("workInTime");
  if (lenses.length < 2) return null;
  return (
    <nav aria-label={t("lens.label")} className="flex flex-col gap-2" data-testid="wit-lens-nav">
      <ul className="flex flex-wrap gap-2">
        {TIME_LENSES.filter((l) => lenses.includes(l)).map((l) => (
          <li key={l}>
            <Link
              href={lensHref({ lens: l, date: l === "me" ? null : date, today }) as "/dashboard"}
              aria-current={active === l ? "page" : undefined}
              data-testid={`wit-lens-${l}`}
              className={cn(
                "inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                active === l
                  ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                  : "border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary",
              )}
            >
              {t(`lens.${l}`)}
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-support text-text-muted" data-testid="wit-lens-hint">
        {t(`lens.hint.${active}`)}
      </p>
    </nav>
  );
}
