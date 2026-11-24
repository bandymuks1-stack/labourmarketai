import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";

import { LAUNCH_BOARD } from "@/lib/admin/launch-board";

/**
 * OWNER CONTROL ROOM — LAUNCH-MINIMUM GUARDS (PR12).
 *
 * The control room must be: owner/admin-only, fed by REAL reads (unknown
 * renders as "—", never invented), and its launch board must be structurally
 * honest — every non-RED status is a CLAIM citing a proof artifact that
 * actually exists in the repo. No fake analytics, no fake launch readiness.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

describe("owner-only access", () => {
  it("the admin subtree is superadmin-gated (layout + page defense-in-depth)", () => {
    expect(read("app/[locale]/dashboard/admin/layout.tsx")).toMatch(/requireSuperadmin/);
    expect(read("app/[locale]/dashboard/admin/page.tsx")).toMatch(/requireSuperadmin/);
  });

  it("no public (marketing) surface imports the launch board", () => {
    // The board is an internal claim ledger — it must never leak to the
    // public site as marketing material.
    const marketingDir = join(APP_ROOT, "app", "[locale]", "(marketing)");
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir, { withFileTypes: true }) as Dirent[]) {
        const p = join(dir, name.name);
        if (name.isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(name.name)) out.push(p);
      }
      return out;
    };
    const offenders = walk(marketingDir).filter((f) =>
      /launch-board|AdminLaunchBoard/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});

describe("real data only — unknown stays unknown", () => {
  it("launch signals degrade to null (—), never to a fabricated number", () => {
    const src = read("lib/admin/launch-signals.ts");
    expect(src).toMatch(/return null/);
    expect(src).not.toMatch(/\?\?\s*0(?!\.)/); // no silent zero-fill of unknowns
    expect(src).toMatch(/count: "exact", head: true/);
  });

  it("the band renders '—' for unknowns", () => {
    const src = read("components/app/admin-launch-board.tsx");
    expect(src).toMatch(/"—"/);
  });

  it("'verified companies' is the REAL ladder, paired with the raw count", () => {
    // The superadmin honesty guard excludes admin.launch from its
    // verified-word ban ONLY because of this pairing + backing assertion.
    const lib = read("lib/admin/launch-signals.ts");
    expect(lib).toMatch(/eq\("verification_status", "verified"\)/);
    const band = read("components/app/admin-launch-board.tsx");
    const companiesIdx = band.indexOf('key: "companies"');
    const verifiedIdx = band.indexOf('key: "verifiedCompanies"');
    expect(companiesIdx).toBeGreaterThan(-1);
    expect(verifiedIdx).toBeGreaterThan(companiesIdx); // raw count rendered first
  });

  it("signals read only real tables through the caller's client", () => {
    const src = read("lib/admin/launch-signals.ts");
    for (const t of ["workers", "companies", "customer_requests", "demand_interest_signals"]) {
      expect(src).toContain(`"${t}"`);
    }
    expect(src).not.toMatch(/service_role|SERVICE_ROLE/);
  });
});

describe("launch board is structurally honest", () => {
  it("carries exactly the 15 launch-tree items", () => {
    expect(LAUNCH_BOARD.length).toBe(15);
    const keys = LAUNCH_BOARD.map((i) => i.key);
    expect(new Set(keys).size).toBe(15);
    for (const k of [
      "public_market_entry",
      "user_identity",
      "worker_profile_player_card",
      "skill_intelligence",
      "work_journal",
      "company_demand",
      "market_map",
      "matching_scouting",
      "trust_connect",
      "control_room",
      "first_use_ux",
      "localization",
      "sales_market_entry",
      "technical_foundation",
      "launch_readiness",
    ]) {
      expect(keys, k).toContain(k);
    }
  });

  it("every green_scoped claim cites a proof artifact THAT EXISTS", () => {
    for (const item of LAUNCH_BOARD) {
      if (item.status === "green_scoped") {
        expect(item.proof, `${item.key} has no proof`).toBeTruthy();
        expect(
          existsSync(join(REPO_ROOT, item.proof!)),
          `${item.key} cites missing proof ${item.proof}`,
        ).toBe(true);
      }
      if (item.status === "yellow") {
        expect(
          Boolean(item.pending || item.ownerDecision),
          `${item.key} is yellow without saying what is pending`,
        ).toBe(true);
      }
    }
  });

  it("unscoped 'green' does not exist before the PR16 final audit", () => {
    const src = read("lib/admin/launch-board.ts");
    expect(src).not.toMatch(/status:\s*"green"(?!_)/);
  });

  it("the board renders on the admin control room", () => {
    const page = read("app/[locale]/dashboard/admin/page.tsx");
    expect(page).toMatch(/AdminLaunchBoard/);
    expect(page).toMatch(/getLaunchSignals/);
  });
});
