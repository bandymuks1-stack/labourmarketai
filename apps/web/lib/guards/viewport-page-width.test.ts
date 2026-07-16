import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Viewport width guard (Production UX Recovery Train — Wagon 1).
 *
 * Root cause of the owner-screenshot "narrow column" defect: the dashboard
 * shell already provides a 1440px `max-w-container` canvas, but a cluster of
 * page ROOTS re-constrained themselves to `max-w-xl…4xl` (≈448–896px), so
 * most of the desktop viewport sat empty. The fix is the shared
 * `max-w-content` token (1200px, tailwind-preset.ts) on pages that want a
 * bounded working width — or nothing at all to inherit the full shell.
 *
 * This guard makes the defect structurally non-recurring: no dashboard
 * page.tsx may introduce a narrow Tailwind max-width on a page-root wrapper
 * again. Inner elements (cards, paragraphs' reading measure) stay free —
 * the pattern below only matches the page-root idiom (`flex-col` container
 * carrying a stock narrow `max-w-*`).
 */

const DASHBOARD_DIR = join(process.cwd(), "app", "[locale]", "dashboard");

// Stock Tailwind widths that are too narrow for a dashboard page root.
// (`max-w-content` / `max-w-container` are the sanctioned tokens.)
const NARROW_ROOT = /max-w-(?:xs|sm|md|lg|xl|2xl|3xl|4xl|5xl)\b/;

// Page-root idiom: a column flex container. Inner cards/paragraphs don't
// carry `flex-col` together with a narrow max-w in this codebase.
const PAGE_ROOT_IDIOM = /flex-col/;

// Deliberate exceptions — each needs a reason.
const ALLOWLIST: ReadonlyArray<{ file: string; reason: string }> = [
  {
    // Focused single-input voice-capture surface: one mic button + one
    // transcript box. A deliberate narrow composer, not a workflow page.
    file: join("journal", "voice", "page.tsx"),
    reason: "single-purpose voice composer",
  },
];

function collectPageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectPageFiles(full));
    } else if (entry === "page.tsx") {
      out.push(full);
    }
  }
  return out;
}

describe("dashboard page-root viewport width (Wagon 1)", () => {
  const pages = collectPageFiles(DASHBOARD_DIR);

  it("finds a meaningful number of dashboard pages (guard not scanning nothing)", () => {
    expect(pages.length).toBeGreaterThan(20);
  });

  it("no dashboard page root re-constrains itself to a narrow stock max-width", () => {
    const violations: string[] = [];
    for (const file of pages) {
      const rel = file.slice(DASHBOARD_DIR.length + 1);
      if (ALLOWLIST.some((a) => file.endsWith(a.file))) continue;
      const lines = readFileSync(file, "utf-8").split("\n");
      lines.forEach((line, i) => {
        if (NARROW_ROOT.test(line) && PAGE_ROOT_IDIOM.test(line)) {
          violations.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(
      violations,
      `Narrow page-root wrapper(s) found — use max-w-content (1200px) or inherit the shell:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("the shared max-w-content token exists in the tailwind preset", () => {
    const preset = readFileSync(
      join(process.cwd(), "tailwind-preset.ts"),
      "utf-8",
    );
    expect(preset).toMatch(/content:\s*"1200px"/);
  });
});
