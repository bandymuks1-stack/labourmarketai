import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The saved-jobs view on `/jobs?saved=1` (registry row 4.4) never says
 * "you saved nothing" when that is not the fact:
 *
 *  - a failed resolve of the bookmarks renders the board's own "did not
 *    answer" line (SEP-7), not the empty-state copy;
 *  - bookmarks that all point at closed ads get their own sentence;
 *  - on the saved view the tab counts what the view can show, so "Saved (3)"
 *    can no longer sit beside an empty list.
 */
const WEB = join(__dirname, "..", "..");
const page = readFileSync(join(WEB, "app", "[locale]", "(marketing)", "jobs", "page.tsx"), "utf8");

describe("the saved-jobs view states the fact it has", () => {
  it("a failed resolve is not 'nothing saved'", () => {
    expect(page).toMatch(/else savedReadFailed = true;/);
    expect(page).toMatch(/savedReadFailed \? \(/);
    expect(page).toContain('data-testid="public-jobs-saved-unavailable"');
  });

  it("all-closed bookmarks have their own sentence in every active locale", () => {
    expect(page).toMatch(/mySaved\.vacancyIds\.size > 0 \? SAVED_ALL_CLOSED\[active\] : SAVED_EMPTY\[active\]/);
    const block = page.slice(page.indexOf("const SAVED_ALL_CLOSED: L = {"));
    for (const loc of ["en", "lt", "ru", "nl", "de", "pl"]) {
      expect(block.slice(0, 900)).toMatch(new RegExp(`\\n  ${loc}: "`));
    }
  });

  it("the tab counts what the saved view can show", () => {
    expect(page).toMatch(/showSaved && !savedReadFailed \? savedPreviews\.length : mySaved\.vacancyIds\.size/);
    expect(page).toMatch(/\{SAVED_TAB\[active\]\} \(\{savedTabCount\}\)/);
  });
});
