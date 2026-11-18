import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A SENTENCE TYPED WHILE THE PAGE LOADS IS KEPT (production walk 2026-10-21). On a slow
 * phone the journal recorder can be typed into before the page is live; its state then
 * starts empty, the button stays disabled and the next re-render drops the words. The
 * recorder must adopt the text its field already holds once it is live.
 */
const SRC = readFileSync(join(__dirname, "..", "..", "app", "[locale]", "dashboard", "journal", "quick-record.tsx"), "utf8");

describe("the journal quick recorder", () => {
  it("binds its field and adopts the field's early text once live", () => {
    expect(SRC).toMatch(/ref=\{textRef\}/);
    expect(SRC).toMatch(/textRef\.current\?\.value/);
    expect(SRC).toMatch(/setText\(\(current\) => current \|\| early\)/);
  });
});
