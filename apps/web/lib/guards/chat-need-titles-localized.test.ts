import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The chat's candidates panel lists the organization's needs. A need saved
 * without naming the role stores an English placeholder title; the needs
 * readback shows it through resolveDemandTitle with the locale's label — the
 * panel printed it raw, so a Lithuanian owner read "Hiring workers — demand"
 * (production audit 2026-10-22). The server adapter localizes it, so the panel
 * (which may import nothing from lib/demand) stays a pure renderer.
 */
describe("the chat's need titles are localized on the server", () => {
  const src = readFileSync(join(__dirname, "..", "conversation", "employer-workspace.ts"), "utf8");
  it("both the need list and the selected need go through resolveDemandTitle", () => {
    expect(src).toContain("title: resolveDemandTitle(d.title, synthetic),");
    expect(src).toContain("title: resolveDemandTitle(result.demand.title, await syntheticDemandTitleLabels()),");
    expect(src).not.toMatch(/title: d\.title,|title: result\.demand\.title,/);
  });
  it("with the same labels the needs readback uses", () => {
    expect(src).toContain('getTranslations("demandReadback.syntheticTitle")');
  });
});
