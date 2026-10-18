import type { OpenNeedsGate } from "@/lib/billing/open-needs-gate";

/**
 * OPEN-NEEDS USAGE — display model (pure).
 *
 * Shows the acting workspace's used / limit / remaining BEFORE a submit. It
 * adds NO count logic and NO rule: it only reshapes the verdict of the ONE
 * server gate (`gateOpenNeeds`), so what is displayed can never disagree with
 * what is enforced. While billing is not enforced (pilot) the gate says
 * `enforced: false` and nothing is displayed — no number, no CTA.
 */
export type OpenNeedsUsageView =
  | { readonly visible: false }
  | {
      readonly visible: true;
      readonly used: number;
      readonly limit: number;
      readonly remaining: number;
      readonly atLimit: boolean;
      /** Only meaningful when atLimit: FREE → upgrade, paid ceiling → contact. */
      readonly next: "upgrade" | "individual_plan" | null;
    };

export function openNeedsUsageView(gate: OpenNeedsGate | null): OpenNeedsUsageView {
  if (!gate) return { visible: false };
  if (!gate.allowed) {
    // A blocked verdict exists only while billing is enforced.
    return { visible: true, used: gate.used, limit: gate.limit, remaining: 0, atLimit: true, next: gate.next };
  }
  if (!gate.enforced || gate.limit === null) return { visible: false };
  return {
    visible: true,
    used: gate.used,
    limit: gate.limit,
    remaining: Math.max(0, gate.limit - gate.used),
    atLimit: false,
    next: null,
  };
}
