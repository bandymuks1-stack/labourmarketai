import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE LIVING CV PAGE HAS ONE <main> LANDMARK.
 *
 * `/cv` renders outside the dashboard chrome (`components/app/dashboard-chrome.tsx`),
 * which is where every other signed-in page gets its `<main>`. Before this
 * guard both page roots were plain `<div className="cv-doc">`, so the Living CV
 * had no main landmark at all. A screen-reader or keyboard user could not jump
 * to the CV (WCAG 2.4.1), and the production profile walk, which reads the
 * Living CV through `getByRole("main")` like every other page, found nothing
 * (profile-cv-history runs 40086140120 and 40153545718, P-6).
 *
 * The `.cv-doc` print rules in `app/globals.css` key on the class, not the
 * tag, so the element swap changes nothing on paper.
 */
const PAGE = join(process.cwd(), "app", "[locale]", "cv", "page.tsx");

describe("/cv page landmark", () => {
  const src = readFileSync(PAGE, "utf8");

  it("every page root (the not-a-worker gate and the CV itself) is a <main>", () => {
    const mainRoots = src.match(/<main\s+className="cv-doc\b/g) ?? [];
    expect(mainRoots.length).toBe(2);
  });

  it("no page root falls back to a plain <div className=\"cv-doc\">", () => {
    expect(src).not.toMatch(/<div\s+className="cv-doc\b/);
  });

  it("each opened <main> is closed", () => {
    // Elements only (`<main className=…`), not the word in a comment.
    const opened = (src.match(/<main\s+className=/g) ?? []).length;
    const closed = (src.match(/<\/main>/g) ?? []).length;
    expect(closed).toBe(opened);
  });
});
