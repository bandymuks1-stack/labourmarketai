import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard for the dark role/context switcher slice. The worker + journal
 * role/context selectors must use the ONE canonical dark listbox
 * (`components/ui/DarkListbox`) — not a native/styled-native select that
 * opens the white OS picker and breaks the dark UI. Pure control-layer swap:
 * options, selected value and submitted name are unchanged.
 */

const APP = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

describe("DarkListbox is the canonical dark control", () => {
  const src = read("components/ui/DarkListbox.tsx");
  const code = stripComments(src);
  it("is a custom listbox, not a native select", () => {
    expect(src).toMatch(/role="listbox"/);
    expect(code).not.toMatch(/<select\b/);
  });
  it("is mobile-portrait safe (outside-click + escape close, scrollable)", () => {
    expect(src).toMatch(/Escape/);
    expect(src).toMatch(/mousedown/);
    expect(src).toMatch(/overflow-auto/);
  });
  it("supports form submission without changing FormData (hidden input on name)", () => {
    expect(code).toMatch(/name \? <input type="hidden" name=\{name\} value=\{value\}/);
  });
});

describe("worker + journal flows use DarkListbox, not native selects", () => {
  const targets = [
    "components/app/journal-entry-composer.tsx",
    "components/app/worker-trade-profile.tsx",
    "components/app/worker-operations-role-form.tsx",
  ];
  for (const rel of targets) {
    it(`${rel} replaced native/styled-native selects with DarkListbox`, () => {
      const code = stripComments(read(rel));
      expect(code).toMatch(/from\s+["']@\/components\/ui\/DarkListbox["']/);
      expect(code).toMatch(/<DarkListbox\b/);
      expect(code).not.toMatch(/<select\b/);
      expect(code).not.toMatch(/<Select\b/);
    });
  }

  it("the journal role/context switcher is the DarkListbox", () => {
    expect(read("components/app/journal-entry-composer.tsx")).toMatch(
      /testId="journal-engagement-switcher"/,
    );
  });

  it("the worker ops-role form still submits operationsRole unchanged", () => {
    const src = read("components/app/worker-operations-role-form.tsx");
    expect(src).toMatch(/name="operationsRole"/);
    expect(src).toMatch(/testId=\{`worker-ops-role-select-\$\{workerId\}`\}/);
  });
});
