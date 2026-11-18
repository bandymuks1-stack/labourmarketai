import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * TEXT TYPED BEFORE HYDRATION COUNTS (landing entry; production walk
 * 2026-10-25).
 *
 * The landing's entry box is server-rendered and controlled by `draft`. A
 * visitor who typed before React attached kept the characters in the DOM
 * while `draft` stayed "" — no change event replays them — so the submit
 * button (`disabled={draft.trim().length === 0}`) stayed disabled until the
 * visitor typed again. The walk had to clear and retype to get past it.
 *
 * Pinned: on mount the component adopts whatever the field already holds,
 * and the submit reads the field itself, so pre-hydration input counts.
 * Everything else — the controlled value, the empty-submit disable, the one
 * deterministic reader — stays as it was.
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const code = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const ENTRY = code(read("components/marketing/public-entry.tsx"));

describe("public entry: pre-hydration input is read, not lost", () => {
  it("a mount-only effect adopts the field's current DOM value into draft", () => {
    expect(ENTRY).toMatch(
      /useEffect\(\(\) => \{\s*const typed = inputRef\.current\?\.value \?\? "";\s*if \(typed\.length > 0\) setDraft\(typed\);\s*\}, \[\]\);/,
    );
  });

  it("the submit reads the field itself, falling back to draft", () => {
    expect(ENTRY).toMatch(
      /onSubmit=\{\(e\) => \{\s*e\.preventDefault\(\);\s*const typed = inputRef\.current\?\.value \?\? draft;[\s\S]*?ask\(typed\);/,
    );
  });

  it("the field is still the controlled, ref'd input and an empty box still cannot submit", () => {
    expect(ENTRY).toMatch(/ref=\{inputRef\}[\s\S]*?value=\{draft\}[\s\S]*?onChange=\{\(e\) => setDraft\(e\.target\.value\)\}/);
    expect(ENTRY).toMatch(/disabled=\{draft\.trim\(\)\.length === 0\}/);
  });
});
