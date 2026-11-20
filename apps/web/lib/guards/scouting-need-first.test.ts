import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARD — UX gaps 2026-11-18, E-1. Opened from the need just saved, candidate
 * search led with four explanatory cards; the need's own state sat about
 * 1,700 px down and offered no action. With a need shown, its state and its
 * people follow the picker; the general explanation comes after them. A need
 * with no structure and no hand raised yet offers the available workforce as
 * the action, directly under its status card. Order only: no read, rule or
 * copy changed (structuring a need without an admin is an owner decision).
 */
const page = readFileSync(join(__dirname, "../../app/[locale]/dashboard/company/scouting/page.tsx"), "utf8");
const at = (needle: string) => {
  const i = page.indexOf(needle);
  expect(i, needle).toBeGreaterThan(-1);
  return i;
};

describe("scouting: the chosen need comes first", () => {
  it("the explanation renders above the picker only when no need is shown", () => {
    expect(page).toMatch(/\{selected \? null : \(\s*<>\s*\{guidanceTop\}\s*\{supply\}\s*\{guidanceBottom\}/);
    expect(at("{/* Demand picker */}")).toBeLessThan(at('data-testid="scouting-not-structured"'));
  });

  it("with a need shown, the explanation follows the results", () => {
    const tail = page.lastIndexOf("{guidanceTop}");
    expect(tail).toBeGreaterThan(at('data-testid="scouting-not-structured"'));
    expect(tail).toBeGreaterThan(at('data-testid="scouting-hand-raisers-unassessed"'));
    expect(page.slice(tail - 200, tail)).toMatch(/\{selected \? \(/);
  });

  it("an unstructured need with no hand raised offers the available workforce right under its card", () => {
    expect(page).toMatch(/const supplyIsTheAction = result\?\.kind === "not-structured" && handRaisers\.length === 0;/);
    const card = at('data-testid="scouting-not-structured"');
    const action = at("{supplyIsTheAction ? supply : null}");
    expect(action).toBeGreaterThan(card);
    expect(action - card).toBeLessThan(200);
  });

  it("every explanatory card is still on the page", () => {
    for (const id of ["scouting-status-note", "scouting-privacy-note", "scouting-visibility-note", "scouting-how"]) {
      expect(page.split(`"${id}"`).length - 1, id).toBe(1);
    }
    expect(page.split("<AvailableSupplySection").length - 1).toBe(1);
  });
});
