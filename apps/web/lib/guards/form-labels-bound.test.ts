import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A visible label must NAME its control (WCAG 1.3.1 / 4.1.2). The company
 * lifecycle forms (stage, probation date, note, offboarding, ending, templates)
 * rendered every <Label> with its `htmlFor` stripped — a blank line where the
 * attribute had been — so a screen reader announced unnamed date, text and
 * select fields (production audit 2026-10-22, /dashboard/company/people).
 */
const WEB = join(__dirname, "..", "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : tsxFiles(p);
    return p.endsWith(".tsx") && !p.endsWith(".test.tsx") ? [p] : [];
  });
}

describe("labels stay bound to their controls", () => {
  it("every Label in the company lifecycle forms names an existing control id", () => {
    const src = readFileSync(
      join(WEB, "app", "[locale]", "dashboard", "company", "lifecycle-section.tsx"),
      "utf8",
    );
    const labels = [...src.matchAll(/<Label\b([^>]*)>/g)].map((m) => m[1]);
    expect(labels.length).toBeGreaterThanOrEqual(10);
    for (const attrs of labels) {
      const target = /htmlFor=(?:"([^"]+)"|\{`([^`]+)`\})/.exec(attrs);
      expect(target, `a Label without htmlFor: <Label${attrs}>`).not.toBeNull();
      const id = target![1] ?? target![2];
      expect(src, `no control carries id ${id}`).toContain(target![1] ? `id="${id}"` : `id={\`${id}\`}`);
    }
  });

  it("no Label anywhere keeps the blank line a stripped htmlFor left behind", () => {
    const offenders = [...tsxFiles(join(WEB, "app")), ...tsxFiles(join(WEB, "components"))].filter((f) =>
      /<Label\r?\n[ \t]*\r?\n/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
