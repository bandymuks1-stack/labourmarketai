import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  LABOUR_MARKET_ROLES,
  ROLE_BY_ID,
  isLiveRoleId,
  roleStatusChipKey,
  roleSwitcherTargetForRole,
  type LabourMarketRoleId,
} from "@/lib/config/roles";

/**
 * P0 header role switcher parity guard (PR #98).
 *
 * Prevents the regression where the dashboard role catalogue and the
 * header role switcher render different chips for the same role —
 * e.g. catalogue shows `Pradėti` for company while the header still
 * shows `Ruošiama`. Both surfaces MUST consume the same canonical
 * helpers from `lib/config/roles.ts`. This guard pins that contract
 * at the source-text level (static probes — no DOM render needed).
 */

const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const switcherSrc = readFileSync(
  resolve(repoRoot, "apps/web/components/app/role-switcher.tsx"),
  "utf-8",
);
const catalogueSrc = readFileSync(
  resolve(repoRoot, "apps/web/components/app/role-catalogue-card.tsx"),
  "utf-8",
);

describe("Guard: header role switcher reads canonical role catalogue", () => {
  it("imports ROLE_BY_ID + roleStatusChipKey + roleSwitcherTargetForRole from lib/config/roles", () => {
    expect(switcherSrc).toContain("from \"@/lib/config/roles\"");
    expect(switcherSrc).toContain("ROLE_BY_ID");
    expect(switcherSrc).toContain("roleStatusChipKey");
    expect(switcherSrc).toContain("roleSwitcherTargetForRole");
  });

  it("dashboard catalogue card also imports roleStatusChipKey from the same module", () => {
    expect(catalogueSrc).toContain("from \"@/lib/config/roles\"");
    expect(catalogueSrc).toContain("roleStatusChipKey");
  });

  it("switcher uses the canonical Pradėti / Dalinis i18n keys (chip_start / chip_partial)", () => {
    expect(switcherSrc).toContain("chip_start");
    expect(switcherSrc).toContain("chip_partial");
  });

  it("switcher does NOT render `availability !== \"active\"` as a single Ruošiama collapse", () => {
    // Anti-regression: the previous code did
    //   const isPreview = cfg?.availability !== "active";
    //   {isPreview && <span>Ruošiama</span>}
    // which incorrectly collapsed start-available + partial + preparing
    // into one Ruošiama chip. PR #98 replaces it with the chipKey switch.
    expect(switcherSrc).not.toMatch(/const\s+isPreview\s*=\s*cfg\?\.\s*availability\s*!==\s*"active"/);
  });
});

describe("Guard: roleSwitcherTargetForRole routes start-available / partial roles to setupRoute", () => {
  it("missing company routes to /dashboard/start/company", () => {
    const t = roleSwitcherTargetForRole(ROLE_BY_ID.company, false);
    expect(t.kind).toBe("navigate");
    if (t.kind === "navigate") {
      expect(t.route).toBe("/dashboard/start/company");
    }
  });

  it("missing agency routes to /dashboard/start/agency", () => {
    const t = roleSwitcherTargetForRole(ROLE_BY_ID.agency, false);
    expect(t.kind).toBe("navigate");
    if (t.kind === "navigate") {
      expect(t.route).toBe("/dashboard/start/agency");
    }
  });

  it("missing customer routes to /dashboard/start/buyer", () => {
    const t = roleSwitcherTargetForRole(ROLE_BY_ID.customer, false);
    expect(t.kind).toBe("navigate");
    if (t.kind === "navigate") {
      expect(t.route).toBe("/dashboard/start/buyer");
    }
  });

  it("held role returns switch (workspace flip via switchRole)", () => {
    const t = roleSwitcherTargetForRole(ROLE_BY_ID.company, true);
    expect(t.kind).toBe("switch");
  });
});

describe("Guard: roleStatusChipKey is the single chip-key mapping", () => {
  it("worker (active) → roles.status.active", () => {
    expect(roleStatusChipKey("active")).toBe("roles.status.active");
  });

  it("start-available → roles.status.start", () => {
    expect(roleStatusChipKey("start-available")).toBe("roles.status.start");
  });

  it("partial → roles.status.partial", () => {
    expect(roleStatusChipKey("partial")).toBe("roles.status.partial");
  });

  it("preparing → roles.status.preparing", () => {
    expect(roleStatusChipKey("preparing")).toBe("roles.status.preparing");
  });

  it("hidden → null (no chip)", () => {
    expect(roleStatusChipKey("hidden")).toBeNull();
  });
});

describe("Guard: header chip parity with the dashboard catalogue per role", () => {
  it("company is start-available with setupRoute /dashboard/start/company", () => {
    expect(ROLE_BY_ID.company.availability).toBe("start-available");
    expect(ROLE_BY_ID.company.setupRoute).toBe("/dashboard/start/company");
  });

  it("agency is HIDDEN from add/start surfaces (company-role-simplicity-v1: agency is a companyType, not a root role)", () => {
    expect(ROLE_BY_ID.agency.availability).toBe("hidden");
    expect(ROLE_BY_ID.agency.safeToShowInRoleSurfaces).toBe(false);
    expect(ROLE_BY_ID.agency.canBeAddedLater).toBe(false);
  });

  it("customer is start-available with setupRoute /dashboard/start/buyer (PR #101: migration 0026 applied → partial flipped to start-available)", () => {
    expect(ROLE_BY_ID.customer.availability).toBe("start-available");
    expect(ROLE_BY_ID.customer.setupRoute).toBe("/dashboard/start/buyer");
  });

  it("worker stays active", () => {
    expect(ROLE_BY_ID.worker.availability).toBe("active");
  });

  it("every LIVE role rendered by the header switcher has a non-null chipKey", () => {
    const liveIds = LABOUR_MARKET_ROLES.filter(
      (r) => r.availability !== "hidden" && isLiveRoleId(r.id),
    ).map((r) => r.id as LabourMarketRoleId);
    for (const id of liveIds) {
      const cfg = ROLE_BY_ID[id];
      expect(roleStatusChipKey(cfg.availability)).not.toBeNull();
    }
  });
});
