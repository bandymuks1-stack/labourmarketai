"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/lib/i18n/navigation";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { NEED_DOOR_HREF, type NeedDoorSurface } from "@/lib/company/need-door";

/**
 * THE door into the company demand intake (activation audit 2026-10-26 §2).
 *
 * One component so the three things that drifted apart cannot drift again:
 *   - the ADDRESS is always `NEED_DOOR_HREF` (no hash into a section the
 *     current page does not hold);
 *   - the CLICK always reports `company_demand_action_clicked` with the door's
 *     `surface` (fire-and-forget; navigation is never delayed);
 *   - the LABEL is always `roleDashboards.company.needDoor.label` — one
 *     wording per locale, and an honest one: describing a need saves it for
 *     the company, it does not publish anything.
 *
 * Styling stays with the caller (`buttonLinkClassName(...)` or the surface's
 * own link grammar), so each screen keeps exactly one primary action.
 */
export function NeedDoorLink({
  surface,
  className,
  testId,
  icon,
}: {
  surface: NeedDoorSurface;
  className?: string;
  testId?: string;
  /** Optional leading icon (the home's action row carries one per action). */
  icon?: ReactNode;
}) {
  const t = useTranslations("roleDashboards.company.needDoor");
  return (
    <Link
      href={NEED_DOOR_HREF as "/dashboard"}
      className={className}
      data-testid={testId}
      data-need-door={surface}
      onClick={() =>
        trackFunnel(FUNNEL_EVENTS.companyDemandActionClicked, {
          surface,
          role_context: "company",
        })
      }
    >
      {icon}
      {t("label")}
    </Link>
  );
}
