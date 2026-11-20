import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARD — the project field, the cost calculator and the partner supply card
 * draw their controls with the one design system (owner P0 2026-11-12, as
 * #3279, #3495, #3501 and #3503 did): Button, Input, Select and ToggleChip
 * from components/ui. No hand-written select, textarea or text field, every
 * action at the 44 px tap floor. Raw <button>s stay only where a Button would
 * be wrong, each counted here:
 *   - project-field: the four object tiles (lane, token, slot, ready), which
 *     are card-shaped surfaces with their own 44 px floor (OBJECT_BUTTON);
 *   - project-cost-calculator: the step indicator, a progress stepper with
 *     done / current / ahead states, not a form action.
 * Radio and checkbox inputs stay native. Only the controls changed: no
 * behaviour, test id, element id or copy.
 */
const WEB = join(__dirname, "..", "..");
const FILES = [
  "components/app/project-field.tsx",
  "components/app/project-cost-calculator.tsx",
  "components/app/partner-supply-representation.tsx",
];
const RAW_BUTTONS: Record<string, number> = {
  "components/app/project-field.tsx": 4,
  "components/app/project-cost-calculator.tsx": 1,
};
const code = (f: string) =>
  readFileSync(join(WEB, f), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

/** Every opening <Tag …> in the source, read up to the `>` outside braces, so
 *  `onClick={() => …}` or `disabled={n > 0}` never cuts a tag short. */
const openingTags = (src: string, tag: string): string[] => {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b`, "g");
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 0;
    let i = m.index + m[0].length;
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0) break;
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
};

describe("project field, cost calculator and partner supply use the shared primitives", () => {
  it.each(FILES)("%s has no hand-written select, textarea or text field", (f) => {
    const src = code(f);
    expect(src, `${f}: <select>`).not.toMatch(/<select\b/);
    expect(src, `${f}: <textarea>`).not.toMatch(/<textarea\b/);
    expect(
      src.match(/<input\b(?![^>]*type="(?:hidden|radio|checkbox)")[^>]*>/g) ?? [],
      `${f}: text <input>`,
    ).toEqual([]);
    expect((src.match(/<button\b/g) ?? []).length, `${f}: <button>`).toBe(RAW_BUTTONS[f] ?? 0);
    expect(src).toMatch(/from "@\/components\/ui\/Button"/);
  });

  it("the raw buttons left are the field's object tiles and the calculator's stepper", () => {
    const field = openingTags(code("components/app/project-field.tsx"), "button");
    for (const b of field) expect(b).toMatch(/OBJECT_BUTTON/);
    const calc = openingTags(code("components/app/project-cost-calculator.tsx"), "button")[0] ?? "";
    expect(calc).toMatch(/aria-current=\{s === step \? "step" : undefined\}/);
  });

  it.each(FILES)("%s keeps every action at the 44 px tap floor", (f) => {
    const buttons = openingTags(code(f), "Button");
    expect(buttons.length, f).toBeGreaterThan(0);
    for (const b of buttons) expect(b, `${f}: ${b.slice(0, 80)}`).toMatch(/min-h-11/);
  });
});
