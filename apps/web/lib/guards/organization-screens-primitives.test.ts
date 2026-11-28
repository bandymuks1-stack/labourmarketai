import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARD — the organization's member, roster-link, roster-claim, performing-
 * company and historical-photo screens and the agency's worker invite draw
 * their controls with the one design system (owner P0 2026-11-12, as #3279,
 * #3495, #3501, #3503 and #3504 did): Button, Input, Select and Textarea from
 * components/ui. No hand-written button, select, textarea or text field; every
 * action at the 44 px tap floor. File, radio and checkbox inputs stay native.
 * Only the controls changed: no behaviour, test id, element id or copy.
 */
const WEB = join(__dirname, "..", "..");
const FILES = [
  "components/app/organization-members-section.tsx",
  "components/app/roster-link-end.tsx",
  "components/app/roster-claim-invite-form.tsx",
  "components/app/organization/performing-company-form.tsx",
  "components/app/organization/historical-photo-import-form.tsx",
  "components/app/agency-workers-section.tsx",
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

describe("organization screens use the shared primitives", () => {
  it.each(FILES)("%s has no hand-written button, select, textarea or text field", (f) => {
    const src = code(f);
    expect(src, `${f}: <select>`).not.toMatch(/<select\b/);
    expect(src, `${f}: <textarea>`).not.toMatch(/<textarea\b/);
    expect(
      openingTags(src, "input").filter((t) => !/type="(?:hidden|file|radio|checkbox)"/.test(t)),
      `${f}: text <input>`,
    ).toEqual([]);
    expect(openingTags(src, "button").length, `${f}: <button>`).toBe(RAW_BUTTONS[f] ?? 0);
    expect(src).toMatch(/from "@\/components\/ui\/Button"/);
  });

  it.each(FILES)("%s keeps every action at the 44 px tap floor", (f) => {
    const buttons = openingTags(code(f), "Button");
    expect(buttons.length, f).toBeGreaterThan(0);
    for (const b of buttons) expect(b, `${f}: ${b.slice(0, 80)}`).toMatch(/min-h-11/);
  });

  it("the historical photo picker stays a native file input", () => {
    const src = code("components/app/organization/historical-photo-import-form.tsx");
    expect(openingTags(src, "input").some((t) => /type="file"/.test(t))).toBe(true);
  });
});
