import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARD — the booking and shortlist controls draw their controls with the one
 * design system (owner P0 2026-11-12, as #3279, #3495, #3501, #3503 and #3504
 * did): Button, Input, Select, Textarea and ToggleChip from components/ui. No
 * hand-written button, select, textarea or text field, and every action at the
 * 44 px tap floor. Only the controls changed: no behaviour, test id, element
 * id or copy.
 */
const WEB = join(__dirname, "..", "..");
const FILES = [
  "components/app/booking-respond-buttons.tsx",
  "components/app/booking-manage-controls.tsx",
  "components/app/propose-booking-button.tsx",
  "components/app/booking-withdraw-button.tsx",
  "components/app/scouting-shortlist-buttons.tsx",
];
const RAW_BUTTONS: Record<string, number> = {};
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

describe("booking and shortlist controls use the shared primitives", () => {
  it.each(FILES)("%s has no hand-written button, select, textarea or text field", (f) => {
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

  it.each(FILES)("%s keeps every action at the 44 px tap floor", (f) => {
    const buttons = openingTags(code(f), "Button");
    expect(buttons.length, f).toBeGreaterThan(0);
    for (const b of buttons) expect(b, `${f}: ${b.slice(0, 80)}`).toMatch(/min-h-11/);
  });

  it("the shortlist status choices are the shared toggle chip (pressed state kept)", () => {
    expect(code("components/app/scouting-shortlist-buttons.tsx")).toMatch(/<ToggleChip[\s\S]*?pressed=\{active\}/);
  });
});
