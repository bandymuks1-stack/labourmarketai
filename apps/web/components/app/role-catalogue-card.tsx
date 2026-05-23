import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import {
  isFeatureActive,
  type FeatureKey,
} from "@/lib/config/feature-availability";
import type { LabourMarketRole } from "@/lib/config/roles";
import { cn } from "@/lib/utils";

/**
 * Single shared renderer for a labour-market role on any dashboard /
 * account surface. Reads label + description from the i18n catalogue,
 * not from inline strings. Active roles may render a navigating Link;
 * preparing roles render the `RUOŠIAMA` chip + a reason line and NEVER
 * a navigating CTA.
 *
 * Feature ↔ role bridge: if the role's `primaryFeatureKey` points at a
 * feature that is itself NOT `active`, the role degrades to preparing
 * regardless of its own row. That way role / feature honesty stay in
 * lock-step — accidentally flipping a role to "active" without shipping
 * the matching feature is harmless visually because the feature gate
 * still applies.
 */
export async function RoleCatalogueCard({
  role,
  className,
}: {
  role: LabourMarketRole;
  className?: string;
}) {
  const t = await getTranslations();

  // Effective availability — honours the feature gate.
  const featureActive = role.primaryFeatureKey
    ? isFeatureActive(role.primaryFeatureKey as FeatureKey)
    : true;
  const effectiveAvailability =
    role.availability === "active" && featureActive ? "active" : role.availability;
  const isActive = effectiveAvailability === "active";

  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-md border p-4 transition-colors",
        isActive
          ? "border-ink-500 bg-ink-800/50 hover:border-brand-blue"
          : "border-ink-600 bg-ink-800/30",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-text-primary">
          {t(role.labelKey)}
        </h3>
        <span
          className={cn(
            "shrink-0 rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label",
            isActive
              ? "border-state-success/40 bg-state-success/5 text-state-success"
              : "border-state-warning/40 bg-state-warning/5 text-state-warning",
          )}
        >
          {isActive ? t("roles.status.active") : t("roles.status.preparing")}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-text-secondary">
        {t(role.descriptionKey)}
      </p>
      {isActive && role.primaryRoute ? (
        <Link
          href={role.primaryRoute as "/dashboard"}
          className="mt-1 inline-flex w-fit items-center gap-1 rounded-md border border-ink-500 px-2.5 py-1 text-[11px] font-semibold text-text-primary transition-colors hover:border-brand-blue"
        >
          {t("dashboard.featuresHeading.open")} →
        </Link>
      ) : (
        <p className="mt-auto text-[11px] leading-relaxed text-text-muted">
          {t(role.preparingReasonKey ?? "roles.preparingReason.default")}
        </p>
      )}
    </li>
  );
}

/**
 * Convenience grid renderer — iterates `getVisibleRoleOptions()`-style
 * input and emits a `RoleCatalogueCard` per row inside a `<ul>` with
 * the non-locking intro paragraph above.
 */
export async function RoleCatalogueGrid({
  roles,
  className,
  showIntro = true,
}: {
  roles: readonly LabourMarketRole[];
  className?: string;
  showIntro?: boolean;
}) {
  const t = await getTranslations();
  if (roles.length === 0) return null;
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {showIntro && (
        <p className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs leading-relaxed text-text-secondary">
          {t("roles.nonLockingIntro")}
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((r) => (
          <RoleCatalogueCard key={r.id} role={r} />
        ))}
      </ul>
    </section>
  );
}
