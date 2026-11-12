import "server-only";

import { readActiveRoleRows } from "@/lib/auth/profile-roles";
import { getWorkspaceContext } from "@/lib/company/active-organization";
import { workspaceOpensCompanySpace } from "@/lib/company/organization-authority";
import { resolveNeedsAudience } from "@/lib/company/agency-capability";
import { getTranslations } from "next-intl/server";

import type { RenderedIntent } from "@/components/layouts/intent-icons";
import {
  GOAL_FUNCTIONS,
  goalIsAdmitted,
  isDoorFor,
  signedInGoals,
  type GoalAdmission,
  type HomeGoalRole,
} from "@/lib/navigation/home-goals";
import { ASSISTANT_HREF, PUBLIC_INTENTS } from "@/lib/navigation/public-intents";
import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import { createClient } from "@/lib/supabase/server";

/**
 * The two facts the home's goals (and pins) are admitted on — read through the
 * SAME request-cached readers the dashboard layout's gate already ran for this
 * request (`readActiveRoleRows`, `getWorkspaceContext`), so this costs no new
 * query and can never disagree with the gate.
 *
 * A signed-out caller holds nothing. A roles read that never answered throws
 * (the reader's own rule) and reaches the route error boundary — an unknown
 * role state is never drawn as a confident set of goals.
 */
export async function loadGoalAdmission(): Promise<GoalAdmission> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { heldRoles: [], opensCompanySpace: false };
  const [roleRows, workspace] = await Promise.all([
    readActiveRoleRows(supabase, user.id),
    getWorkspaceContext(),
  ]);
  return {
    heldRoles: roleRows.map((r) => r.role),
    opensCompanySpace: workspaceOpensCompanySpace(workspace),
  };
}

/**
 * WHICH goal home the active organization gets: the employer's (find workers
 * first) or the staffing agency's (offer your people first).
 *
 * It is the Needs door's OWN audience rule (`resolveNeedsAudience`, the ONE
 * agency rule of ORG-2: company type OR declared role, and an organization
 * that is both keeps the default it always had) — so the home's first goal
 * and the door it opens can never name two different directions (SEP-4).
 * An organization typed `agency` with no company type counts as a staffing
 * agency, as it does for the acting role.
 *
 * One small RLS read (the declared roles); an unreadable list answers "none",
 * which is the employer home — the default every organization had before.
 */
export async function loadOrganizationGoalRole(): Promise<"company" | "agency"> {
  const workspace = await getWorkspaceContext();
  const active = workspace.workspaces.find(
    (w) => w.kind === "organization" && w.id === workspace.activeWorkspaceId,
  );
  if (!active) return "company";
  let capabilities: readonly string[] = [];
  try {
    capabilities = await readOrganizationCapabilities(active.id);
  } catch {
    capabilities = [];
  }
  const companyType =
    active.companyType ?? (active.organizationType === "agency" ? "staffing_agency" : null);
  return resolveNeedsAudience({ companyType, capabilities }).audience === "offer" ? "agency" : "company";
}

/** What the shared intent bar needs, with every label already resolved. */
export type SignedInGoalBar = {
  readonly intents: readonly RenderedIntent[];
  readonly navLabel: string;
  readonly accountLabel: string;
  readonly assistant: { readonly href: string; readonly label: string };
};

/**
 * THE SIGNED-IN GOAL BAR (one header rule, 2026-11-12): what the shared
 * intent bar (`components/layouts/intent-mega-menu.tsx`, the public header's
 * own component) shows on every signed-in page that does not draw the goal
 * cards itself — the role's goals, each opening its functions. The SAME data
 * the home's navigator draws (`signedInGoals`), under the SAME admission, so
 * the bar can never offer a destination the home would not.
 *
 * Which list: the active organization's (employer or agency) for a person who
 * governs it, the customer's for a person acting as one, otherwise the
 * person's own. `null` when there is nothing to offer (the bar is then
 * absent, never empty).
 */
export async function loadSignedInGoalBar(input: {
  readonly activeRole: string | null;
}): Promise<SignedInGoalBar | null> {
  const [admission, t, tAll] = await Promise.all([
    loadGoalAdmission(),
    getTranslations("siteNav"),
    getTranslations(),
  ]);
  const governs = admission.opensCompanySpace && (input.activeRole === "company" || input.activeRole === "agency");
  const role: HomeGoalRole = governs
    ? await loadOrganizationGoalRole()
    : input.activeRole === "customer"
      ? "customer"
      : "worker";
  const icons = new Map(PUBLIC_INTENTS.map((intent) => [intent.id, intent.iconKey]));
  const intents = signedInGoals(role, admission).map((goal) => {
    // The employer's need door is a function of its goal here: the bar has no
    // separate tracked link, and the address is the door's own.
    const door = GOAL_FUNCTIONS[goal.id].find((fn) => isDoorFor(role, fn) && goalIsAdmitted(fn, admission));
    return {
      id: goal.id,
      iconKey: icons.get(goal.id)!,
      title: t(`intents.${goal.id}.title`),
      short: t(`intents.${goal.id}.short`),
      description: t(`intents.${goal.id}.description`),
      links: [...(door ? [door] : []), ...goal.functions].map((fn) => ({
        id: fn.id,
        href: fn.href,
        label: tAll(fn.labelKey),
        account: false,
      })),
    };
  });
  if (intents.length === 0) return null;
  return {
    intents,
    navLabel: t("trigger"),
    accountLabel: t("account"),
    assistant: { href: ASSISTANT_HREF, label: t("assistant") },
  };
}
