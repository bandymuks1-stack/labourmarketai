import "server-only";

import { getTranslations } from "next-intl/server";

import {
  HOME_GOALS,
  routeIsAdmitted,
  routePath,
  type GoalAdmission,
  type HomeGoalRole,
} from "@/lib/navigation/home-goals";
import { loadOrganizationGoalRole } from "@/lib/navigation/home-goals-server";
import { workAreasFor } from "@/lib/navigation/work-areas";
import { isPinnableRef } from "@/lib/workspace/pins-model";

/**
 * A destination the person may pin from the home: an existing route they are
 * admitted to, with the name the home already gives it. `onHome` marks the
 * ones the home's goal cards already offer (never repeated under "Recent").
 */
export type PinPlace = {
  readonly ref: string;
  readonly href: string;
  readonly label: string;
  readonly onHome: boolean;
};

/**
 * WHAT CAN BE PINNED FROM THIS HOME — the acting role's goals and the
 * workspace's areas, from the ONE goal model and the ONE area model (no third
 * list), filtered by the same admission the cards use and by the pin model's
 * own closed reference rule. A customer outside an organization and an
 * employee inside one have the goals-only home (`worker` / `customer` here),
 * so they are offered the same kind of list.
 */
export async function loadPinPlaces(input: {
  readonly home: "worker" | "customer" | "organization" | null;
  readonly admission: GoalAdmission;
}): Promise<readonly PinPlace[]> {
  if (!input.home) return [];
  const role: HomeGoalRole = input.home === "organization" ? await loadOrganizationGoalRole() : input.home;
  const tAll = await getTranslations();
  const out: PinPlace[] = [];
  const seen = new Set<string>();
  const add = (href: string, label: string, onHome: boolean) => {
    const ref = `link:${href}`;
    const path = routePath(href);
    if (seen.has(path) || !isPinnableRef(ref) || !routeIsAdmitted(href, input.admission)) return;
    seen.add(path);
    out.push({ ref, href, label, onHome });
  };
  for (const goal of HOME_GOALS[role]) add(goal.href, tAll(goal.labelKey), true);
  for (const area of workAreasFor(input.home === "organization" ? "organization" : "personal")) {
    add(area.href, tAll(area.labelKey), false);
  }
  return out;
}
