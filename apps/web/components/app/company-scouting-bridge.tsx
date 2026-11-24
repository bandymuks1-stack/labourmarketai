import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";

/**
 * Company demand → scouting bridge (Step 6). Sets honest expectations before a
 * company opens scouting and gives a clear path there:
 *   - matches are deterministic signals for THIS need, never a guarantee;
 *   - worker contacts stay hidden — connect in-app, only when available;
 *   - any estimate is preliminary and non-binding.
 *
 * Pure server component, copy via i18n (LT/EN/RU). No data, no fake claims.
 */
const POINTS = ["matches", "contacts", "estimate"] as const;

export async function CompanyScoutingBridge() {
  const t = await getTranslations("roleDashboards.company.scoutingBridge");
  return (
    <section
      data-testid="company-scouting-bridge"
      className="card-border flex flex-col gap-3 p-5"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-sm leading-relaxed text-text-secondary">{t("intro")}</p>
      </header>
      <ul className="flex flex-col gap-2">
        {POINTS.map((k) => (
          <li
            key={k}
            className="flex items-start gap-2 text-xs leading-relaxed text-text-secondary"
          >
            <span aria-hidden className="mt-0.5 text-brand-blue">
              •
            </span>
            <span>{t(`points.${k}`)}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/dashboard/company/scouting"
        data-testid="company-scouting-bridge-cta"
        className="self-start rounded-md border border-brand-blue/40 px-3 py-1.5 text-sm font-medium text-brand-blue transition-colors hover:bg-brand-blue/10"
      >
        {t("cta")} →
      </Link>
    </section>
  );
}
