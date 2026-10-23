import "server-only";

import { createClient } from "@/lib/supabase/server";
import { billingPilotPassEnabled, getBillingConfigFor } from "@/lib/billing/config";
import { resolveBillingSubject } from "@/lib/billing/billing-subject";
import { getEffectiveEntitlements } from "@/lib/billing/effective-entitlements";
import { evaluatePilotPass, type PilotPassGate } from "@/lib/billing/pilot-pass-core";
import { getWorkspaceContext } from "@/lib/company/active-organization";

/**
 * Where the organization pilot pass (pilot-pass-core) is offered to the
 * person on THIS request — the one reading the account section, the pricing
 * page and the employer home share, so a person can find the pass without
 * knowing its URL and every surface agrees on it.
 *
 *   hidden    — the switch is off, nobody is signed in, or no organization
 *               this person can act for has billing active.
 *   here      — the active workspace's organization has billing active; the
 *               gate decides between the pay control and the reason it is
 *               withheld (no billing authority, plan already active, …).
 *   elsewhere — the person is in another workspace, but owns or administers
 *               an organization with billing active: name it, so they know
 *               which workspace to choose. A display hint only — the route
 *               re-resolves the workspace and authority before any session.
 */
export type PilotPassOffer =
  | { readonly kind: "hidden" }
  | {
      readonly kind: "here";
      readonly organizationId: string;
      readonly mode: "live" | "test";
      readonly gate: PilotPassGate;
    }
  | { readonly kind: "elsewhere"; readonly organizationName: string };

const HIDDEN: PilotPassOffer = { kind: "hidden" };

function billingActive(organizationId: string | null): "live" | "test" | null {
  const state = getBillingConfigFor(organizationId).state;
  return state === "stripe_live" ? "live" : state === "stripe_test" ? "test" : null;
}

export async function readPilotPassOffer(): Promise<PilotPassOffer> {
  if (!billingPilotPassEnabled()) return HIDDEN;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return HIDDEN;

  const subject = await resolveBillingSubject();
  if (subject.subject?.type === "organization") {
    const organizationId = subject.subject.id;
    const mode = billingActive(organizationId);
    if (mode) {
      const ent = await getEffectiveEntitlements();
      const gate = evaluatePilotPass({
        enabled: true,
        authenticated: true,
        organizationId,
        billingAuthority: subject.billingAuthority,
        billingState: mode === "live" ? "stripe_live" : "stripe_test",
        planActive: ent.source === "subscription" && ent.active,
      });
      return { kind: "here", organizationId, mode, gate };
    }
  }

  const workspace = await getWorkspaceContext();
  const other = workspace.workspaces.find(
    (w) =>
      w.kind === "organization" &&
      w.id !== workspace.activeWorkspaceId &&
      (w.relationship === "owner" || w.governanceRole === "owner" || w.governanceRole === "admin") &&
      billingActive(w.id) !== null,
  );
  return other?.name ? { kind: "elsewhere", organizationName: other.name } : HIDDEN;
}
