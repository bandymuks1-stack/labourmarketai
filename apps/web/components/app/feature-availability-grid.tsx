import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import {
  getVisibleFeatures,
  isFeatureActive,
  type FeatureConfig,
} from "@/lib/config/feature-availability";
import { cn } from "@/lib/utils";

/**
 * Renders the visible (active + preparing) feature catalogue as a grid of
 * cards. The dashboard uses this as the canonical "what's available and
 * what's coming" surface — so preparing features never appear as broken
 * CTAs, and adding a new feature is a one-row change in the central
 * catalogue.
 *
 * `excludeKeys` lets the caller suppress features that already appear as
 * their own cards higher on the page (e.g. profile / journal on the
 * worker dashboard).
 *
 * Token / shared discipline: tokens come from the tailwind preset, copy
 * comes from `messages/*.json` via the central feature catalogue. No
 * hardcoded colours or labels.
 */
export async function FeatureAvailabilityGrid({
  excludeKeys = [],
  showHeading = true,
  only,
  comingLater = false,
}: {
  excludeKeys?: readonly FeatureConfig["key"][];
  showHeading?: boolean;
  /** Render only active OR only preparing features. Omit to show both. */
  only?: "active" | "preparing";
  /** Use the compact "Coming later" framing (for the demoted preparing
   *  section). Implies `only = "preparing"` when `only` is unset. */
  comingLater?: boolean;
}) {
  const t = await getTranslations();
  const filterMode = only ?? (comingLater ? "preparing" : undefined);
  const features = getVisibleFeatures().filter((f) => {
    if (excludeKeys.includes(f.key)) return false;
    if (filterMode === "active") return isFeatureActive(f.key);
    if (filterMode === "preparing") return !isFeatureActive(f.key);
    return true;
  });

  if (features.length === 0) return null;

  const headingId = comingLater
    ? "feature-coming-later-title"
    : "feature-availability-title";

  return (
    <section
      aria-labelledby={showHeading ? headingId : undefined}
      className="flex flex-col gap-3"
      data-testid={comingLater ? "dashboard-coming-later" : undefined}
    >
      {showHeading && (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {comingLater
              ? t("dashboard.comingLater.eyebrow")
              : t("dashboard.featuresHeading.eyebrow")}
          </span>
          <h2
            id={headingId}
            className="font-display text-lg font-semibold text-text-primary"
          >
            {comingLater
              ? t("dashboard.comingLater.title")
              : t("dashboard.featuresHeading.title")}
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
            {comingLater
              ? t("dashboard.comingLater.body")
              : t("dashboard.featuresHeading.body")}
          </p>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => {
          const active = isFeatureActive(f.key);
          return (
            <li
              key={f.key}
              className={cn(
                "flex flex-col gap-2 rounded-md border p-4 transition-colors",
                active
                  ? "border-ink-500 bg-ink-800/50 hover:border-brand-blue"
                  : "border-ink-600 bg-ink-800/30",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-text-primary">
                  {t(f.labelKey)}
                </h3>
                {!active && (
                  <span className="shrink-0 rounded-sm border border-state-warning/40 bg-state-warning/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-state-warning">
                    {t("features.preparing_badge")}
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed text-text-secondary">
                {t(f.descriptionKey)}
              </p>
              {active && f.primaryRoute ? (
                <Link
                  href={f.primaryRoute as "/dashboard/profile"}
                  className="mt-1 inline-flex w-fit items-center gap-1 rounded-md border border-ink-500 px-2.5 py-1 text-[11px] font-semibold text-text-primary transition-colors hover:border-brand-blue"
                >
                  {t("dashboard.featuresHeading.open")} →
                </Link>
              ) : f.preparingReasonKey ? (
                <p className="mt-auto text-[11px] leading-relaxed text-text-muted">
                  {t(f.preparingReasonKey)}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
