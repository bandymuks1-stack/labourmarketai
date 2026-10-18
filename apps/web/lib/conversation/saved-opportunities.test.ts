import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyIntent } from "@/lib/conversation/intent-router";

/**
 * Chat ↔ visual loop (production 2026-09-29): a job saved on the
 * opportunities page, then "Parodyk išsaugotus darbus" ran a NEW search.
 */
describe("the chat reads the person's saved opportunities", () => {
  it.each([
    ["Parodyk išsaugotus darbus.", "saved-opportunities"],
    ["Kokius darbus išsaugojau?", "saved-opportunities"],
    ["Show my saved jobs", "saved-opportunities"],
    ["Ieškau darbo Švedijoje", "find-work"],
  ])("%s → %s", (s, intent) => {
    expect(classifyIntent(s).intent).toBe(intent);
  }, 20_000);

  it("reads the board's own saved list and opens the real page section", () => {
    const src = readFileSync(join(__dirname, "saved-opportunities.ts"), "utf8");
    expect(src).toMatch(/loadWorkerOpportunityBoard\("conversation"\)/);
    expect(src).toMatch(/board\.savedVacancies/);
    expect(src).toMatch(/board\.savedRequestIds/);
    const page = readFileSync(join(__dirname, "..", "..", "app/[locale]/dashboard/opportunities/page.tsx"), "utf8");
    expect(page).toMatch(/id="opportunities-saved"/);
  });
});
