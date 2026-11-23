import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { OrganizationApprovalsCard } from "@/components/app/arena/confirm-pulse";
import { AreaSwitcher } from "@/components/app/area-switcher";
import { SignedInGoalNavigation } from "@/components/navigation/signed-in-goal-navigation";
import { NeedDoorLink } from "@/components/app/need-door-link";
import { Link } from "@/lib/i18n/navigation";
import { learnerInviteHref, ORGANIZATION_WORK_AREAS } from "@/lib/navigation/work-areas";

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
 *
 * AN EDUCATION INSTITUTION'S ONE PRIMARY (UX_GAPS 2026-11-18 I-2): for an
 * organization with the education capability (the organization doors' gate,
 * `isEducationInstitution`, decided by the page) the one primary is the
 * learner invite — the SAME address and label as the learners section's
 * `institution-learners-invite`. Every other organization keeps the need door.
 */
export async function CompanyModelScreen({
  learnerInviteOrganizationId = null,
}: {
  /** The active organization's id when it holds the education capability. */
  learnerInviteOrganizationId?: string | null;
} = {}) {
  const [t, tAll, tNav] = await Promise.all([
    getTranslations("companyModel"),
    getTranslations(),
    getTranslations("common.nav"),
  ]);
  const primaryClassName =
    "inline-flex min-h-11 w-fit items-center rounded-full bg-brand-blue px-5 text-sm font-semibold text-text-on-brand transition-colors hover:bg-brand-champagne";
  return (
    <section
      aria-label={t("title")}
      data-testid="company-model"
      // The conversation thread already gives this its column and its 16px
      // inset. A narrower max-w-2xl column with its own px-4 left the company
      // home 32px in from each edge on phones (owner phone report 2026-11-20)
      // and, from 640px up, out of line with the assistant below it (48px at
      // 768, 48px at 1024; design audit 2026-11-22). It now shares the
      // thread's column at every width.
      className="flex w-full flex-col gap-3 pb-2 pt-4 max-sm:pt-2"
    >
      <h2 className="font-display text-card-title font-semibold text-text-primary">
        {t("title")}
      </h2>
      {/* What needs the owner first: the real reviewable-entry queue, approved
          right here (honest unknown when unreadable, says why when empty). */}
      <OrganizationApprovalsCard />
      {learnerInviteOrganizationId ? (
        <Link
          href={learnerInviteHref(learnerInviteOrganizationId) as "/dashboard/network"}
          data-testid="company-model-primary"
          data-primary="learner-invite"
          className={primaryClassName}
        >
          {tAll("roleDashboards.company.learners.invite")}
        </Link>
      ) : (
        <NeedDoorLink surface="company_model" testId="company-model-primary" className={primaryClassName} />
      )}
      {/* THE SIX GOALS (owner P0 2026-11-23, CAROUSEL_NAVIGATION_SPEC N4):
          the public home's navigator, each goal opening what this
          organization may use. After the approvals and the one primary
          action, which stay on the first screen (owner P0 2026-11-07); the
          area switcher below stays until N6 retires it. */}
      <Suspense fallback={<div data-testid="signed-in-goals-pending" className="min-h-[13rem]" aria-hidden />}>
        <SignedInGoalNavigation />
      </Suspense>
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
