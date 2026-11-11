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
// RE-ANCHORED 2026-10-25: the header role switcher was retired with the one
// header (it was a second workspace selector). The surface that still renders
// per-role status chips is the account page, so parity is pinned there.
const switcherSrc = readFileSync(
  resolve(repoRoot, "apps/web/app/[locale]/dashboard/account/page.tsx"),
  "utf-8",
);
const catalogueSrc = readFileSync(
  resolve(repoRoot, "apps/web/components/app/role-catalogue-card.tsx"),
  "utf-8",
);

describe("Guard: header role switcher reads canonical role catalogue", () => {
  it("the account page imports ROLE_BY_ID + roleStatusChipKey from lib/config/roles", () => {
    expect(switcherSrc).toContain("from \"@/lib/config/roles\"");
    expect(switcherSrc).toContain("ROLE_BY_ID");
    expect(switcherSrc).toContain("roleStatusChipKey");
  });

  it("dashboard catalogue card also imports roleStatusChipKey from the same module", () => {
    expect(catalogueSrc).toContain("from \"@/lib/config/roles\"");
    expect(catalogueSrc).toContain("roleStatusChipKey");
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

  it("missing agency routes to the company setup form, as an agency (owner decision 2026-11-11)", () => {
    const t = roleSwitcherTargetForRole(ROLE_BY_ID.agency, false);
    expect(t.kind).toBe("navigate");
    if (t.kind === "navigate") {
      // The path production walk A-1 proved — never a separate agency start.
      expect(t.route).toBe("/dashboard/start/company?type=staffing_agency");
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

  // OWNER DECISION 2026-11-11 — agency and buyer are OFFERED to new users
  // (superseding the hiding in company-role-simplicity-v1 / systemic-ux-roles-v1).
  // Offered means START-AVAILABLE through the setup form production proved —
  // never "active" (that needs every surface proven), never a new start route.
  it("agency is start-available as a company of type staffing_agency (owner decision 2026-11-11; A-1)", () => {
    expect(ROLE_BY_ID.agency.availability).toBe("start-available");
    expect(ROLE_BY_ID.agency.entryPoint).toBe(true);
    expect(ROLE_BY_ID.agency.safeToShowInRoleSurfaces).toBe(true);
    expect(ROLE_BY_ID.agency.setupRoute).toBe("/dashboard/start/company?type=staffing_agency");
    expect(ROLE_BY_ID.agency.reason).toMatch(/owner decision 2026-11-11/);
  });

  it("customer is start-available through the one buyer setup form (owner decision 2026-11-11; J-13, C-1)", () => {
    expect(ROLE_BY_ID.customer.availability).toBe("start-available");
    expect(ROLE_BY_ID.customer.entryPoint).toBe(true);
    expect(ROLE_BY_ID.customer.safeToShowInRoleSurfaces).toBe(true);
    expect(ROLE_BY_ID.customer.setupRoute).toBe("/dashboard/start/buyer");
    expect(ROLE_BY_ID.customer.reason).toMatch(/owner decision 2026-11-11/);
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
