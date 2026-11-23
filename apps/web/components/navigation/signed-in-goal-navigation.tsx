import { getTranslations } from "next-intl/server";

import { GoalNavigation, type OwnGoalFunction } from "@/components/navigation/goal-navigation";
import { signedInGoals } from "@/lib/navigation/signed-in-goals";
import { loadGoalAdmission } from "@/lib/navigation/signed-in-goals-server";

/**
 * THE SIGNED-IN HOMES' GOALS (owner P0 2026-11-23; CAROUSEL_NAVIGATION_SPEC
 * OD-1 (a), step N4): the public home's navigator, the same six goals for
 * every role, each opening the functions this person may use. The admission
 * read goes through the request-cached readers the layout gate already ran;
 * the labels are the keys those functions already carry elsewhere.
 */
export async function SignedInGoalNavigation({ variant }: { variant?: "full" | "strip" } = {}) {
  const [admission, t] = await Promise.all([loadGoalAdmission(), getTranslations()]);
  const own = new Map<string, readonly OwnGoalFunction[]>(
    signedInGoals(admission).map((goal) => [
      goal.id,
      goal.functions.map((fn) => ({
        id: fn.id,
        href: fn.href,
        label: t(fn.labelKey as never),
        iconKey: fn.iconKey,
      })),
    ]),
  );
  return <GoalNavigation ownFunctions={own} variant={variant} />;
}
