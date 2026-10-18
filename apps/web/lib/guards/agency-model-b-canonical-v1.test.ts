import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { CAPABILITY_REGISTER } from "@/lib/product-gate/capability-register";

/**
 * Model B is the canonical agency actor model (owner decision 2026-09-14,
 * confirming Agency Direction A of 2026-07-05). An agency is a TYPED
 * staffing-agency view inside the canonical company workspace — a `companies`
 * row with `company_type = 'staffing_agency'`, governed by company/org
 * authority. There is no separate agency persona, dashboard or actor model.
 *
 * `agency-direction-a.test.ts` already bans the legacy `agencies`-table modules
 * from ONE file: `/dashboard/company`'s page. That was the right fence when the
 * concern was that page. The concern the owner named on 2026-09-14 is broader —
 * that Model A could "silently become a second product model again" — and a
 * one-file ban does not stop it reappearing on any OTHER route or component.
 *
 * So this guard bans the legacy pool modules from EVERY route and component.
 * The modules stay in the tree and the database objects stay untouched (B1 is
 * retire-and-record, never delete); what is forbidden is a product surface
 * importing them, because that is what would rebuild the parallel actor model.
 */

const WEB = join(__dirname, "..", "..");

/** The legacy `agencies`-table world. `clients*` is Model B and stays allowed. */
const LEGACY_POOL_IMPORT =
  /@\/lib\/agency\/(pool|pool-actions|actions|agency-workers)\b/;

/**
 * ONE recorded exception, and it is dead code rather than a live surface.
 *
 * `agency-workers-section.tsx` is the Model A roster panel. Nothing renders it:
 * the only reference anywhere is a COMMENT in `company-workers-section.tsx`
 * saying "Mirrors AgencyWorkersSection exactly" — that file is its Model B
 * replacement, and this one was left behind when the roster moved.
 *
 * It is kept, not deleted, because B1 is retire-and-record and deleting it
 * would erase the evidence that the product once did this. But an allow-list
 * entry that only said "ignore this file" would hide a live surface just as
 * easily as a dead one, so the exception is paid for below: a second test
 * asserts this component stays ORPHANED. The day something renders it, that
 * test fails and the fence holds.
 */
const RETIRED_ORPHAN = "components/app/agency-workers-section.tsx";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === ".next") continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      if (/\.test\.(ts|tsx)$/.test(entry)) continue;
      out.push(full);
    }
  };
  walk(dir);
  return out;
}

describe("the legacy agency pool cannot become a second product model again", () => {
  const surfaces = [
    ...sourceFiles(join(WEB, "app")),
    ...sourceFiles(join(WEB, "components")),
  ];

  it("scans a real, non-trivial surface set (the guard cannot pass vacuously)", () => {
    expect(surfaces.length).toBeGreaterThan(100);
  });

  it("no route or component imports the legacy `agencies`-world modules", () => {
    const offenders: string[] = [];
    for (const file of surfaces) {
      const rel = file.slice(WEB.length + 1).split("\\").join("/");
      if (rel === RETIRED_ORPHAN) continue;
      if (LEGACY_POOL_IMPORT.test(readFileSync(file, "utf8"))) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      "Model B is canonical (owner 2026-09-14). These surfaces import the retired " +
        "Model A pool world, which rebuilds the parallel agency actor model:\n  " +
        offenders.join("\n  ") +
        "\nIf a real agency workforce need now exists, that is a Model-B-native " +
        "surface over engagement_contexts / organization_roles and an owner decision " +
        "(B2) — not an import of lib/agency/pool.",
    ).toEqual([]);
  });
});

describe("the retirement is recorded, not merely enforced", () => {
  const row = CAPABILITY_REGISTER.find((c) => c.id === "ORG-10");

  it("ORG-10 exists and is recorded as retired with a date and a reason", () => {
    expect(row, "ORG-10 (the retired agency pool) must keep its row").toBeDefined();
    expect(row!.retired?.on).toBe("2026-09-14");
    expect(row!.retired!.why.length).toBeGreaterThan(200);
  });

  it("retirement did not delete the implementation — the anchors still exist", () => {
    // B1 is retire-and-record. A retirement that deleted the code would make
    // the product's own history unreadable, which is the thing the `retired`
    // field exists to prevent.
    expect(row!.anchors).toContain("lib/agency/pool.ts");
    for (const anchor of row!.anchors) {
      expect(() => readFileSync(join(WEB, anchor), "utf8")).not.toThrow();
    }
  });

  it("the one allow-listed Model A component stays orphaned — nothing renders it", () => {
    // The exception above is only safe while this holds. `AgencyWorkersSection`
    // must appear in no JSX and no import anywhere outside its own file; a bare
    // mention in a comment is not a render, so the match is on the import/usage
    // shapes rather than on the bare word.
    const live: string[] = [];
    for (const file of [
      ...sourceFiles(join(WEB, "app")),
      ...sourceFiles(join(WEB, "components")),
    ]) {
      const rel = file.slice(WEB.length + 1).split("\\").join("/");
      if (rel === RETIRED_ORPHAN) continue;
      const src = readFileSync(file, "utf8");
      if (/<AgencyWorkersSection\b/.test(src) || /agency-workers-section/.test(src)) {
        live.push(rel);
      }
    }
    expect(
      live,
      "AgencyWorkersSection is the RETIRED Model A roster panel, allow-listed in " +
        "this guard only because nothing renders it. Something now does:\n  " +
        live.join("\n  ") +
        "\nThat is Model A returning as a product surface. Use the Model B " +
        "roster (company-workers-section.tsx) instead.",
    ).toEqual([]);
  });

  it("the Model B client module is NOT caught by the ban", () => {
    // Guarding the guard: `lib/agency/clients*` is Model B (owns_company
    // authority) and must stay importable, or this test would quietly forbid
    // the canonical model it exists to protect.
    expect(LEGACY_POOL_IMPORT.test('from "@/lib/agency/clients"')).toBe(false);
    expect(LEGACY_POOL_IMPORT.test('from "@/lib/agency/clients-actions"')).toBe(false);
    expect(LEGACY_POOL_IMPORT.test('from "@/lib/agency/pool"')).toBe(true);
  });
});
