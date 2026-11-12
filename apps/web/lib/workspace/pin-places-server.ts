import "server-only";

import { getTranslations } from "next-intl/server";

import {
  HOME_GOALS,
  homeGoalLabelKey,
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
 * A destination outside `/dashboard` cannot be a `link:` pin (the pin model's
 * link rule is closed to the dashboard on purpose). Where the model already
 * has a reference for it, the home offers that one: the CV is the `cv` chip
 * the conversation has always resolved (Codex P2 on #3264 — without this the
 * worker's "My CV" was silently missing from the list of shortcuts to add).
 */
const PLACE_REF: Readonly<Record<string, string>> = {
  "/cv": "cv",
};

/**
 * WHAT CAN BE PINNED FROM THIS HOME — the acting role's goals and the
 * workspace's areas, from the ONE goal model and the ONE area model (no third
 * list), filtered by the same admission the cards use and by the pin model's
 * own closed reference rule. A person in a workspace with no goal home (a
 * customer outside an organization, an employee inside one) is offered
 * nothing here; the chat's "add it?" ask still works for them.
 */
export async function loadPinPlaces(input: {
  readonly home: "worker" | "organization" | null;
  readonly admission: GoalAdmission;
}): Promise<readonly PinPlace[]> {
  if (!input.home) return [];
  const role: HomeGoalRole = input.home === "worker" ? "worker" : await loadOrganizationGoalRole();
  const [tGoals, tAll] = await Promise.all([getTranslations("homeGoals"), getTranslations()]);
  const out: PinPlace[] = [];
  const seen = new Set<string>();
  const add = (href: string, label: string, onHome: boolean) => {
    const ref = PLACE_REF[href] ?? `link:${href}`;
    const path = routePath(href);
    if (seen.has(path) || !isPinnableRef(ref) || !routeIsAdmitted(href, input.admission)) return;
    seen.add(path);
    out.push({ ref, href, label, onHome });
  };
  for (const goal of HOME_GOALS[role]) add(goal.href, tGoals(homeGoalLabelKey(role, goal)), true);
  for (const area of workAreasFor(input.home === "worker" ? "personal" : "organization")) {
    add(area.href, tAll(area.labelKey), false);
  }
  return out;
}
