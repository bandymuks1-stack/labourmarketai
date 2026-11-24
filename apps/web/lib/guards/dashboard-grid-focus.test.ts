import { describe, expect, it } from "vitest";

import {
  DASHBOARD_MODULES,
  modulePrimaryRolesAreValid,
} from "@/lib/dashboard/dashboard-module-registry";

/**
 * Dashboard grid focus guard (HUMAN-FIRST LAUNCH TRAIN v1, Agent 1).
 *
 * W3 Package 4 deleted the second dashboard and with it the collapsed
 * "Veiksmai" grid (control-room view model + grid component + fold copy), so
 * the fold-behaviour pins left with them. The registry survives, and so does
 * its contract: `primaryRoles` is presentation-only — always a subset of
 * `roles` — so a first-screen priority flag can never widen who is allowed
 * to see a module, whatever surface consumes the registry next.
 */

describe("primaryRoles is a presentation rule, never a visibility rule", () => {
  for (const m of DASHBOARD_MODULES) {
    it(`${m.id}: primaryRoles ⊆ roles`, () => {
      expect(modulePrimaryRolesAreValid(m)).toBe(true);
    });
  }
});
