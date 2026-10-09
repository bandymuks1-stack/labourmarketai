import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * AN EMPLOYER'S "REQUEST CHANGES" MUST BE ANSWERABLE (walk 2026-10-09).
 *
 * The inbox's "Request changes" writes a confirmation row with decision
 * `changes_requested`. The journal then hid Edit and Delete (the entry is
 * reviewed) and offered the correction control only for the CLIENT-review
 * phase, so the worker read "please add the room number" with no way to do it.
 * The database correction path (journal_entry_supersede -> correction_of) was
 * already there.
 *
 * Pinned: the journal offers the correction control when the latest employer
 * decision is `changes_requested` and no correction exists yet, and the row
 * renders it in the reviewed (non-deletable) branch.
 */

const APP = join(__dirname, "..", "..");
const page = readFileSync(join(APP, "app", "[locale]", "dashboard", "journal", "page.tsx"), "utf8");
const row = readFileSync(join(APP, "components", "app", "journal-entry-row.tsx"), "utf8");

describe("employer change requests are answerable", () => {
  it("the page derives the employer request from the latest decision", () => {
    expect(page).toMatch(/timeline\.at\(-1\)\?\.result === "changes_requested"/);
    expect(page).toMatch(/!correctedOriginalIds\.has\(e\.id\)/);
    expect(page).toMatch(/correctionSlot=\{\s*employerAskedChanges \?/);
  });

  it("the row renders the correction control where edit and delete are blocked", () => {
    const blocked = row.slice(row.indexOf(") : ("), row.indexOf('t("entry.deleteBlocked")'));
    expect(blocked).toMatch(/\{correctionSlot\}/);
  });
});
