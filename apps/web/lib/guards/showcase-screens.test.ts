import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PRODUCTION SHOWCASE SCREENS USE ONLY THE SYNTHETIC CAST (owner order 2026-11-24).
 *
 * `prod-showcase-screens` photographs production pages for the patent announcement. It must use
 * only the allowlisted synthetic sessions the walk already mints, stay read-only, and publish only
 * through the same encrypted step as living-cv-screens.
 */
const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");
const spec = read("tests/e2e/prod-showcase-screens.spec.ts");
const workflow = read("../../.github/workflows/prod-qa-walk.yml");

describe("showcase screens", () => {
  it("uses only synthetic session slots the walk mints", () => {
    const slots = [...spec.matchAll(/slot: "([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect(["worker", "worker2", "owner", "agency", "buyer"]).toContain(s);
  });

  it("is read-only: clicks only the workspace chip and the navigation triggers", () => {
    expect(spec).not.toMatch(/getByTestId\([^)]*(save|send|submit|confirm|delete|approve|create|export)/i);
    expect(spec).not.toMatch(/\.fill\(|\.type\(|\.check\(|selectOption\(/);
    expect((spec.match(/\.click\(/g) ?? []).length).toBeLessThanOrEqual(3);
  });

  it("writes metadata-free PNGs outside the repository and never logs page text", () => {
    expect(spec).toMatch(/stripPngMetadata\(/);
    expect(spec).toMatch(/PROD_QA_LCV_DIR must be an absolute directory outside the repository/);
    expect(spec).not.toMatch(/console\.|hasText|getByText|innerText|textContent/);
  });

  it("is published only through the encrypted step, with the buyer minted only when it exists", () => {
    expect(workflow).toMatch(/showcase-screens\) SPEC=tests\/e2e\/prod-showcase-screens\.spec\.ts/);
    expect(workflow).toMatch(/spec == 'living-cv-screens' \|\| needs\.debounce\.outputs\.spec == 'showcase-screens'/);
    expect(workflow).toMatch(/"showcase-screens" \]; then\n\s+# The buyer of the showcase[^\n]*\n\s+mint_existing "qa\.buyer\+act1@labourmarket\.ai" buyer/);
  });
});
