import { getTranslations } from "next-intl/server";

import { ConfirmPulse } from "@/components/app/arena/confirm-pulse";
import { AreaSwitcher } from "@/components/app/area-switcher";
import { NeedDoorLink } from "@/components/app/need-door-link";
import { ORGANIZATION_WORK_AREAS } from "@/lib/navigation/work-areas";

/**
 * THE COMPANY CONTEXT'S CENTRE (owner order 2026-10-01): the company home is
 * COMPANY MANAGEMENT, not a generic chip chat and not the owner's personal CV.
 * It is the model of what a company IS in this product, every entry a door
 * to an EXISTING canonical surface (no new surface, no second marketplace):
 *
 *   what we offer · what we need · marketplace · clients & suppliers ·
 *   people & team · projects & objects · candidates · messages · calendar ·
 *   capacity · work & hours · results · history
 *
 * ONE obvious next action leads (describe a need — the shared, tracked
 * `NeedDoorLink`; it saves a need for the company, it publishes nothing, so
 * the label no longer says "publish"); every door follows in the
 * light 3D area switcher, by priority (the everyday six first) — the doors
 * themselves live in the ONE area model (`ORGANIZATION_WORK_AREAS`,
 * lib/navigation/work-areas.ts). Server component, props-free of identity:
 * it renders only inside an organization workspace (the dashboard decides),
 * and each destination re-checks its own rights under RLS. The calendar
 * entry is the ONE calendar (/dashboard/planning); "capacity" is the
 * workforce zone, which the context-parity guard records as a different
 * capability, not a calendar.
 */
export async function CompanyModelScreen() {
  const [t, tAll, tNav] = await Promise.all([
    getTranslations("companyModel"),
    getTranslations(),
    getTranslations("common.nav"),
  ]);
  return (
    <section
      aria-label={t("title")}
      data-testid="company-model"
      className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pb-2 pt-4"
    >
      <h2 className="font-display text-card-title font-semibold text-text-primary">
        {t("title")}
      </h2>
      {/* What needs the owner first: the real reviewable-entry queue (honest
          unknown when unreadable, calm when empty) — the existing pulse the
          project surfaces already use, not a second counter. */}
      <ConfirmPulse />
      <NeedDoorLink
        surface="company_model"
        testId="company-model-primary"
        className="inline-flex min-h-11 w-fit items-center rounded-full bg-brand-blue px-5 text-sm font-semibold text-text-on-brand transition-colors hover:bg-brand-champagne"
      />
      {/* Every door of the company, by priority (the everyday six first),
          as the light 3D area switcher — one source: ORGANIZATION_WORK_AREAS.
          The carousel replaces the six-tile grid + "More" disclosure: the
          rest is one arrow, swipe or Tab away instead of behind a fold. */}
      <AreaSwitcher
        title={t("areasTitle")}
        prevLabel={tNav("previous")}
        nextLabel={tNav("next")}
        hereLabel={tNav("youAreHere")}
        testId="company-model-areas"
        items={ORGANIZATION_WORK_AREAS.map((a) => ({
          id: a.id,
          href: a.href,
          iconKey: a.iconKey,
          label: tAll(a.labelKey),
          testId: `company-model-${a.id}`,
        }))}
      />
    </section>
  );
}
