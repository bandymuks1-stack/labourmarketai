import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARD — the project screens draw their controls with the one design system
 * (owner P0 2026-11-12, as #3279 for teams, #3495 for the agency and #3501 for
 * the company): Button, Input, Select and ToggleChip from components/ui. No
 * hand-written select or visible input, every action at the 44 px tap floor.
 * The operations board keeps ONE raw <button>: its card-shaped counter tile,
 * which is a surface, not a form action. Only the controls changed: no
 * behaviour, test id, element id or copy.
 */
const WEB = join(__dirname, "..", "..");
const FILES = [
  "components/app/project-facts-form.tsx",
  "components/app/project-stages-panel.tsx",
  "components/app/project-defects-panel.tsx",
  "components/app/project-operations-board.tsx",
];
const RAW_BUTTONS: Record<string, number> = { "components/app/project-operations-board.tsx": 1 };
const code = (f: string) =>
  readFileSync(join(WEB, f), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

describe("project screens use the shared primitives", () => {
  it.each(FILES)("%s has no hand-written select, textarea or visible input", (f) => {
    const src = code(f);
    expect(src, `${f}: <select>`).not.toMatch(/<select\b/);
    expect(src, `${f}: <textarea>`).not.toMatch(/<textarea\b/);
    expect(src.match(/<input\b(?![^>]*type="hidden")[^>]*>/g) ?? [], `${f}: visible <input>`).toEqual([]);
    expect((src.match(/<button\b/g) ?? []).length, `${f}: <button>`).toBe(RAW_BUTTONS[f] ?? 0);
    expect(src).toMatch(/from "@\/components\/ui\/Button"/);
  });

  it("the one raw button left is the operations board's counter tile", () => {
    const tile = /<button\b(?:=>|[^>])*>/.exec(code("components/app/project-operations-board.tsx"))?.[0] ?? "";
    expect(tile).toMatch(/\$\{surface\}/);
  });

  it.each(FILES)("%s keeps every action at the 44 px tap floor", (f) => {
    const buttons = code(f).match(/<Button\b(?:=>|[^>])*>/g) ?? [];
    expect(buttons.length, f).toBeGreaterThan(0);
    for (const b of buttons) expect(b, `${f}: ${b.slice(0, 80)}`).toMatch(/min-h-11/);
  });
});
