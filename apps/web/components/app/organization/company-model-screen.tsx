import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { OrganizationApprovalsCard } from "@/components/app/arena/confirm-pulse";
import { HomeAreaRail } from "@/components/app/home/home-area-rail";
import { NeedDoorLink } from "@/components/app/need-door-link";
import { ORGANIZATION_WORK_AREAS } from "@/lib/navigation/work-areas";
import { HOME_GOALS, areasBeyondGoals } from "@/lib/navigation/home-goals";
import { loadOrganizationGoalRole } from "@/lib/navigation/home-goals-server";
import { HomeGoalCards } from "@/components/app/home/home-goal-cards";
import { HomeQuickAccess } from "@/components/app/home/home-quick-access";

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
 * THE GOALS LEAD (owner P0 No. 1, 2026-11-12): what the organization came to
 * do, as large cards from the ONE goal model (`lib/navigation/home-goals.ts`)
 * — an employer's "find workers" is the shared, tracked `NeedDoorLink`
 * (it saves a need for the company, it publishes nothing); a staffing agency
 * opens on what it OFFERS and is never shown the need door (SEP-4). The
 * doors the goals do not already offer follow in the light 3D area switcher
 * — the doors themselves live in the ONE area model
 * (`ORGANIZATION_WORK_AREAS`, lib/navigation/work-areas.ts). Server
 * component, props-free of identity: it renders only inside an organization
 * workspace (the dashboard decides), which goal home the organization gets is
 * the Needs door's own audience rule (`loadOrganizationGoalRole`), and each
 * destination re-checks its own rights under RLS. The calendar
 * entry is the ONE calendar (/dashboard/planning); "capacity" is the
 * workforce zone, which the context-parity guard records as a different
 * capability, not a calendar.
 */
export async function CompanyModelScreen() {
  const [t, tAll, role] = await Promise.all([
    getTranslations("companyModel"),
    getTranslations(),
    loadOrganizationGoalRole(),
  ]);
  return (
    <section
      aria-label={t("title")}
      data-testid="company-model"
      className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 pb-2 pt-4"
    >
      <h2 className="font-display text-card-title font-semibold text-text-primary">
        {t("title")}
      </h2>
      {/* The employer's ONE need door — the shared, tracked link (address,
          click event and wording are one thing by contract). An agency is
          never shown it: its goals open on what it offers (SEP-4). */}
      {role === "company" ? (
        <NeedDoorLink
          surface="company_model"
          testId="company-model-primary"
          className="inline-flex min-h-11 w-fit items-center rounded-full bg-brand-blue px-5 text-sm font-semibold text-text-on-brand transition-colors hover:bg-brand-champagne"
        />
      ) : null}
      {/* THE GOALS — the shared goal navigator, in this role's order, opening
          the product's own functions. */}
      <HomeGoalCards role={role} />
      {/* What needs the owner: the real reviewable-entry queue, approved right
          here, directly under the goals (the goals lead so they are whole on
          a phone's first screen) (honest unknown when unreadable, says why when empty). */}
      <OrganizationApprovalsCard />
      {/* Every other door of the company on the ONE shared rail (V2: one
          rail, one card) — one source: ORGANIZATION_WORK_AREAS, minus the
          doors the goals above already offer (a destination is shown once). */}
      <HomeAreaRail
        title={t("areasTitle")}
        testId="company-model-areas"
        areas={areasBeyondGoals(ORGANIZATION_WORK_AREAS, HOME_GOALS[role]).map((a) => ({
          id: a.id,
          href: a.href,
          iconKey: a.iconKey,
          label: tAll(a.labelKey),
        }))}
      />
      {/* QUICK ACCESS — the organization's active projects and open needs, by
          name. It closes the screen and streams on its own: its two reads are
          the slowest thing here, it is absent when there is nothing to list,
          and arriving last it cannot push the goals or the doors down. */}
      <Suspense fallback={null}>
        <HomeQuickAccess />
      </Suspense>
    </section>
  );
}
