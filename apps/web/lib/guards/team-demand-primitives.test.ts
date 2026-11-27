import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARD — the team and need screens draw their controls with the one design
 * system (owner P0 2026-11-12, as #3279, #3495, #3501, #3503 and #3504 did):
 * Button, Input, Select and Textarea from components/ui. No hand-written
 * select, textarea or text field, every action at the 44 px tap floor. Raw
 * <button>s stay only where a Button would be wrong, each counted here:
 *   - demand-advanced-sections: the multi-select and requirement-tier chips
 *     (they carry data-value / data-tier and tier colours; now at min-h-11),
 *     and the full-width section disclosure header (aria-expanded);
 *   - offer-demand-recognizer: the four intent tiles (a 2×2 / 4-up grid of
 *     card choices, 44 px) and the carry-to-demand action, which shares its
 *     Link sibling's exact class so a button and a link look the same.
 * Radio, checkbox and file inputs stay native. Only the controls changed: no
 * behaviour, test id, element id or copy.
 */
const WEB = join(__dirname, "..", "..");
const FILES = [
  "components/app/team-details-form.tsx",
  "components/app/team-demand-offer-form.tsx",
  "components/app/team-offer-terms.tsx",
  "components/app/team-enquiry-entry.tsx",
  "components/app/need-structure-row.tsx",
  "components/app/demand-draft-form.tsx",
  "components/app/structure-need-form.tsx",
  "components/app/demand-advanced-sections.tsx",
  "components/app/demand-location-capture.tsx",
  "components/app/project-economics-panel.tsx",
  "components/app/market/offer-demand-recognizer.tsx",
];
const RAW_BUTTONS: Record<string, number> = {
  "components/app/demand-advanced-sections.tsx": 3,
  "components/app/market/offer-demand-recognizer.tsx": 2,
};
const code = (f: string) =>
  readFileSync(join(WEB, f), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

/** Every opening <Tag …>, read up to the `>` outside braces, so
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

describe("team and need screens use the shared primitives", () => {
  it.each(FILES)("%s has no hand-written select, textarea or text field", (f) => {
    const src = code(f);
    expect(src, `${f}: <select>`).not.toMatch(/<select\b/);
    expect(src, `${f}: <textarea>`).not.toMatch(/<textarea\b/);
    const text = openingTags(src, "input").filter((t) => !/type="(?:hidden|radio|checkbox|file)"/.test(t));
    expect(text, `${f}: text <input>`).toEqual([]);
    expect(openingTags(src, "button").length, `${f}: <button>`).toBe(RAW_BUTTONS[f] ?? 0);
    expect(src).toMatch(/from "@\/components\/ui\/Button"/);
  });

  it("the raw buttons left are the chips, the disclosure header and the recognizer's tiles and hand-off", () => {
    const adv = openingTags(code("components/app/demand-advanced-sections.tsx"), "button");
    expect(adv.filter((b) => /aria-pressed=/.test(b))).toHaveLength(2);
    expect(adv.filter((b) => /aria-expanded=/.test(b))).toHaveLength(1);
    const rec = openingTags(code("components/app/market/offer-demand-recognizer.tsx"), "button");
    expect(rec.filter((b) => /recognizer-intent-/.test(b))).toHaveLength(1);
    expect(rec.filter((b) => /className=\{style\}/.test(b))).toHaveLength(1);
  });

  it("the pressed chips carry the 44 px floor", () => {
    const src = code("components/app/demand-advanced-sections.tsx");
    expect(src.match(/"inline-flex min-h-11 items-center rounded-full border/g) ?? []).toHaveLength(2);
  });

  it.each(FILES)("%s keeps every action at the 44 px tap floor", (f) => {
    const buttons = openingTags(code(f), "Button");
    expect(buttons.length, f).toBeGreaterThan(0);
    for (const b of buttons) expect(b, `${f}: ${b.slice(0, 80)}`).toMatch(/min-h-11/);
  });
});
