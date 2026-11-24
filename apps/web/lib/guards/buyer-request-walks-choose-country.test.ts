import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The buyer request form requires an ISO country (#3234). A walk that submits
 * it without choosing one is stopped by the browser's own validation: no
 * request is sent and `buyer-requests-result` never appears (prod-qa-walk
 * buyer-workspace B-2, run 44971584269). Every e2e spec that submits the form
 * chooses the country first.
 */
const E2E = resolve(__dirname, "..", "..", "tests", "e2e");
const FORM = readFileSync(resolve(__dirname, "..", "..", "components", "app", "buyer-requests-section.tsx"), "utf8");

describe("buyer request walks choose the required country", () => {
  it("the form still requires the country", () => {
    expect(FORM).toMatch(/name="country"\s+required[\s\S]*?data-testid="buyer-requests-field-country"/);
  });

  it("every submit is preceded by a country choice", () => {
    const missing: string[] = [];
    for (const f of readdirSync(E2E).filter((n) => n.endsWith(".spec.ts"))) {
      const src = readFileSync(resolve(E2E, f), "utf8");
      const parts = src.split('getByTestId("buyer-requests-submit")');
      for (let i = 0; i < parts.length - 1; i++) {
        const before = parts[i].slice(-1500);
        if (!before.includes('getByTestId("buyer-requests-field-country")')) missing.push(`${f} #${i + 1}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
