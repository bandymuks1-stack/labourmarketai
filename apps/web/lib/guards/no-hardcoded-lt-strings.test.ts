import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * No hardcoded Lithuanian in JSX text (train i18n rule). User-facing strings
 * must come from message files so EN never shows Lithuanian (the bug fixed for
 * the dashboard "VEIKLOS PRADŽIA" eyebrow). This scans JSX text nodes — after
 * stripping comments — for Lithuanian-specific letters, which never appear in
 * code/markup and so flag a hardcoded string.
 *
 * Scope: the user-facing product surfaces. The superadmin-only `/dashboard/admin`
 * diagnostic pages (internal operator tooling, LT operator audience) are
 * intentionally excluded — they are not part of the user-facing rooms.
 */

const webRoot = join(__dirname, "..", "..");

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) tsxFiles(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const FILES = [
  ...tsxFiles(join(webRoot, "app", "[locale]")),
  ...tsxFiles(join(webRoot, "components")),
].filter(
  // Exclude superadmin-only internal diagnostic tooling (LT operator audience).
  (f) => !f.replace(/\\/g, "/").includes("/dashboard/admin/"),
);

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// Lithuanian-specific letters that never occur in code/markup tokens.
const LT_TEXT = />[^<>{}]*[ąčęėįšųūžĄČĘĖĮŠŲŪŽ][^<>{}]*</;

describe("no hardcoded Lithuanian text in JSX", () => {
  it("every Lithuanian user string comes from message files, not inline JSX", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = stripComments(readFileSync(f, "utf8"));
      const m = src.match(LT_TEXT);
      if (m) offenders.push(`${f.replace(webRoot, "")}: ${m[0].slice(0, 60)}`);
    }
    expect(offenders, `hardcoded LT JSX text:\n${offenders.join("\n")}`).toHaveLength(0);
  });
});
