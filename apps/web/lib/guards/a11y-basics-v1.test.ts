import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * J3 (FINAL COMPLETION, 2026-09-02) — accessibility basics found by a real
 * browser walk of production and fixed. Each rule below pins one defect so it
 * cannot return:
 *  - the marketing layout owns the ONE `<main id="main-content">`; a page or
 *    article inside it must not open a second `<main>` (nested landmarks);
 *  - the chat surface renders WITHOUT the dashboard chrome, so its root is
 *    the main landmark;
 *  - the chat composer's textarea carries an accessible name;
 *  - the timesheet form labels are bound to their controls;
 *  - the first heading after a marketing page h1 is an h2, not an h3.
 */
const web = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

describe("a11y basics v1", () => {
  it("only the marketing layout renders a <main> landmark", () => {
    const root = join(web, "app", "[locale]", "(marketing)");
    // The two /jobs pages are owner-waiver-scoped (product gate
    // `public-acquisition-route-jobs`), so their <main> -> <div> fix travels
    // in PR #1433; until that merges they are excluded here, NOT accepted.
    const JOBS_PAGES_PENDING_1433 = [join("jobs", "page.tsx"), join("jobs", "[id]", "page.tsx")];
    const offenders = walk(root)
      .filter((p) => !p.endsWith(join("(marketing)", "layout.tsx")))
      .filter((p) => !JOBS_PAGES_PENDING_1433.some((j) => p.endsWith(j)))
      .filter((p) => /<main[\s>]/.test(readFileSync(p, "utf8")))
      .map((p) => p.slice(root.length + 1));
    expect(offenders).toEqual([]);
    expect(read("app/[locale]/(marketing)/layout.tsx")).toMatch(/<main id="main-content"/);
    expect(read("components/marketing/answer-article.tsx")).not.toMatch(/<main[\s>]/);
  });

  it("the chat root is the main landmark in conversation mode", () => {
    const src = read("components/app/conversation/chat/conversation-chat.tsx");
    expect(src).toMatch(/role="main"[\s\S]{0,200}data-testid="conversation-chat"/);
  });

  it("the composer textarea has an accessible name", () => {
    const src = read("components/app/conversation/chat/composer.tsx");
    expect(src).toMatch(/<textarea[\s\S]{0,400}aria-label=\{placeholder\}/);
  });

  it("timesheet form labels are bound to their controls", () => {
    const src = read("app/[locale]/dashboard/planning/timesheets-section.tsx");
    for (const id of ["timesheet-org", "timesheet-start", "timesheet-end"]) {
      expect(src).toContain(`<Label htmlFor="${id}">`);
      expect(src).toContain(`id="${id}"`);
    }
    expect(src).toContain("<Label htmlFor={`reopen-note-${sheet.id}`}>");
  });

  it("benefit cards use h2 (first heading level after the page h1)", () => {
    const src = read("components/marketing/benefit-cards.tsx");
    expect(src).not.toMatch(/<h3/);
    expect(src).toMatch(/<h2/);
  });
});
