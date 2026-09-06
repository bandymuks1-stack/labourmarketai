import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { marketDirection } from "@/lib/demand/market-direction";

/**
 * THE MARKET HAS TWO DIRECTIONS AND EVERY SURFACE MUST KNOW WHICH IT HOLDS.
 *
 * Measured on production 2026-09-06: `customer_requests` carried 2 submitted
 * `agency_offer` rows — agencies saying "turime 20 suvirintojų" — and three
 * separate surfaces rendered them as demand, because each read dropped `kind`
 * and then had no way to tell a need from a capacity.
 *
 * These guards pin the anchors that made that possible. They are source
 * assertions, not behaviour mocks: the defect was never a wrong branch, it was
 * a column nobody selected and a filter nobody applied.
 */

const WEB = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(WEB, rel), "utf8");
}

describe("market direction — the company room's kind scope is fully classified", () => {
  /**
   * The company dashboard scopes its own-rows read to a closed kind list. Every
   * kind in it must resolve to a REAL direction, because the readback renders
   * one section per direction: a kind that classified as "other" would be read
   * from the database and then silently dropped from both sections.
   *
   * Adding a kind to the room without teaching `marketDirection` about it fails
   * here rather than disappearing from a real employer's screen.
   */
  it("every kind the company room reads has a direction", () => {
    const src = read("app/[locale]/dashboard/company/page.tsx");
    const decl = /const EMPLOYER_DEMAND_KINDS = \[([^\]]*)\]/.exec(src);
    expect(decl, "EMPLOYER_DEMAND_KINDS declaration not found").not.toBeNull();
    const kinds = [...decl![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) {
      expect(marketDirection(kind), `kind "${kind}" has no direction`).not.toBe(
        "other",
      );
    }
  });

  it("the room reads BOTH directions — the supply section has rows to render", () => {
    const src = read("app/[locale]/dashboard/company/page.tsx");
    const decl = /const EMPLOYER_DEMAND_KINDS = \[([^\]]*)\]/.exec(src);
    const kinds = [...decl![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(kinds.some((k) => marketDirection(k) === "demand")).toBe(true);
    expect(kinds.some((k) => marketDirection(k) === "supply")).toBe(true);
  });
});

describe("market direction — the own-rows reads select the column that carries it", () => {
  /**
   * `kind` is selectable on both of these reads under the existing
   * `profile_id = auth.uid()` policy — it was simply never asked for. Dropping
   * it again would restore the defect with no test failing anywhere else.
   */
  it("listOwnCustomerRequests selects kind", () => {
    const src = read("lib/buyer/customer-requests.ts");
    const select = /\.select\(\s*(?:\/\/[^\n]*\n\s*)*"([^"]+)"/.exec(src);
    expect(select, "select projection not found").not.toBeNull();
    expect(select![1].split(",").map((c) => c.trim())).toContain("kind");
  });

  it("CustomerRequestRow exposes the resolved direction", () => {
    const src = read("lib/buyer/customer-requests.ts");
    expect(src).toMatch(/readonly direction: MarketDirection;/);
    expect(src).toMatch(/direction: marketDirection\(/);
  });

  it("the canonical DEMAND read selects kind and gates on it", () => {
    const src = read("lib/demand/canonical-demand.ts");
    expect(src).toMatch(/created_at, kind"/);
    // The gate is the allow-list helper, never an inline `!== "agency_offer"`
    // deny-list — a deny-list lets the next supply kind straight through.
    expect(src).toMatch(/if \(!isDemandKind\(row\.kind\)\) continue;/);
    expect(src).not.toMatch(/!==\s*"agency_offer"/);
  });
});

describe("market direction — the readback states each direction as itself", () => {
  it("the readback splits on the row's own direction", () => {
    const src = read("components/app/demand-requests-readback.tsx");
    expect(src).toMatch(/r\.direction === "demand"/);
    expect(src).toMatch(/r\.direction === "supply"/);
    expect(src).toMatch(/data-testid="supply-offers-readback"/);
  });

  it("a supply row offers no scouting link — scouting is a demand question", () => {
    const src = read("components/app/demand-requests-readback.tsx");
    // The supply section renders rows with `scoutable={false}`; the demand
    // section with the bare `scoutable` shorthand.
    expect(src).toMatch(/scoutable=\{false\}/);
  });

  it("the supply section carries an honest note, not an implied route", () => {
    const src = read("components/app/demand-requests-readback.tsx");
    expect(src).toMatch(/labels\.supplyNote/);
    expect(src).toMatch(/data-testid="supply-readback-note"/);
  });
});

describe("market direction — every shipped locale can say it", () => {
  /**
   * next-intl resolves a MISSING key to the key itself and does not throw, so
   * an unlocalised catalogue ships the literal string
   * `demandReadback.supplyHeading` onto a real employer's screen. Only a check
   * over every catalogue catches that — a green build never will.
   */
  const dir = path.join(WEB, "messages");
  const locales = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));

  it("finds the shipped catalogues", () => {
    expect(locales.length).toBeGreaterThanOrEqual(11);
  });

  for (const locale of locales) {
    it(`${locale} defines the supply-side strings`, () => {
      const data = JSON.parse(
        fs.readFileSync(path.join(dir, `${locale}.json`), "utf8"),
      ) as Record<string, Record<string, unknown>>;
      const block = data.demandReadback;
      expect(block, `${locale}: demandReadback block missing`).toBeTruthy();
      for (const key of ["supplyHeading", "supplyNote"]) {
        const value = block[key];
        expect(typeof value, `${locale}.demandReadback.${key} missing`).toBe(
          "string",
        );
        expect((value as string).trim().length).toBeGreaterThan(0);
        // A catalogue that "translated" the key by copying it is the same
        // defect wearing a translation's clothes.
        expect(value).not.toBe(key);
        expect(value).not.toBe(`demandReadback.${key}`);
      }
    });
  }
});
