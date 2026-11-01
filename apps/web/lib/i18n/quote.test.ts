import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { quoteText } from "./quote";

describe("quoteText — each language quotes in its own convention", () => {
  it.each([
    ["lt", "„x“"],
    ["de", "„x“"],
    ["pl", "„x”"],
    ["nl", "„x”"],
    ["ru", "«x»"],
    ["en", "“x”"],
    ["en-GB", "“x”"],
    ["sv", "“x”"],
  ])("%s → %s", (locale, expected) => {
    expect(quoteText(locale, "x")).toBe(expected);
  });
});

describe("no component wraps the person's words in a hard-coded Lithuanian „…“ pair", () => {
  // These surfaces render in every locale; a literal „ before a JSX
  // expression showed English readers Lithuanian quotes.
  const FILES = [
    "components/app/journal-entry-compact-editor.tsx",
    "components/app/journal-entry-composer.tsx",
    "components/app/work-entry-skill-review.tsx",
    "components/app/workflow-timeline.tsx",
  ];
  it.each(FILES)("%s", (file) => {
    const src = readFileSync(join(__dirname, "..", "..", file), "utf8");
    expect(src).not.toMatch(/„\{|„\$\{/);
  });
});

describe("English catalog never opens a quote with the low-9 mark", () => {
  it("en.json", () => {
    const raw = readFileSync(join(__dirname, "..", "..", "messages", "en.json"), "utf8");
    expect(raw).not.toContain("„");
  });
});
