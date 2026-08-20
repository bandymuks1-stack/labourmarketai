import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { reviewUnconfirmedWorkTime } from "@/lib/journal/unconfirmed-work-time";

/**
 * GUARD — the hours a worker wrote must never be discarded silently.
 *
 * Measured in production 2026-08-20 across the 26 live journal entries:
 * SIXTEEN stated hours in the worker's own words; FOUR reached a time metric;
 * FOURTEEN were lost, every one of them with not a single confirmed fragment.
 * Two entries in the entire database had ever had confirmed fragments.
 *
 * The cause was not parsing. The composer posts fragments only when their
 * status is `confirmed`, and the entry-level duration only when its status is
 * `confirmed` — so anything still `pending` was dropped while the entry saved
 * and looked successful. One real worker logged twelve entries in the correct
 * organization context and their August timesheet computed 0.00.
 *
 * The fix must never become "confirm it for them" (doctrine §7: inferred data
 * is not a human assertion). It must stay "refuse to lose it quietly".
 */

const APP = join(__dirname, "..", "..");
const COMPOSER = readFileSync(
  join(APP, "components/app/journal-entry-composer.tsx"),
  "utf8",
);
const MESSAGES = join(APP, "messages");
const LOCALES = ["en", "lt", "lv", "et", "pl", "ru", "de", "nl", "da", "no", "sv"];

describe("the save path refuses to drop reviewed-pending durations", () => {
  it("submit is blocked while a written duration is unreviewed", () => {
    expect(COMPOSER).toMatch(/if \(unconfirmedTime\.wouldSilentlyDiscard\) \{/);
    // It must RETURN — a warning that still saves is the same bug with a label.
    const at = COMPOSER.indexOf("if (unconfirmedTime.wouldSilentlyDiscard) {");
    const block = COMPOSER.slice(at, at + 400);
    expect(block).toContain("return;");
    expect(block).toContain("unconfirmedTimeBlocked");
  });

  it("the block sits BEFORE the request is built", () => {
    const guard = COMPOSER.indexOf("unconfirmedTime.wouldSilentlyDiscard");
    const build = COMPOSER.indexOf('fd.set("fragments_json"');
    expect(guard).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(build);
  });

  it("nothing auto-confirms on save — the worker still decides", () => {
    // `confirmAllPending` exists as a one-tap CONTROL. It must never be called
    // from the save path, which would manufacture assertions nobody made.
    const submitAt = COMPOSER.indexOf("async function submit() {");
    const submitEnd = COMPOSER.indexOf("\n  function ", submitAt);
    const submitBody = COMPOSER.slice(submitAt, submitEnd > 0 ? submitEnd : undefined);
    expect(submitBody).not.toContain("confirmAllPending(");
    // Clearing state AFTER a successful save is fine; promoting a pending
    // suggestion to `confirmed` inside the save path is not.
    expect(submitBody).not.toMatch(/status:\s*"confirmed"/);
    expect(submitBody).not.toMatch(/setTimeStatus\(\s*"confirmed"/);
  });

  it("only CONFIRMED work still ships — the fix did not loosen the filter", () => {
    expect(COMPOSER).toMatch(/fragments\s*\n?\s*\.filter\(\(f\) => f\.status === "confirmed"\)/);
    expect(COMPOSER).toMatch(/timeStatus === "confirmed" && timeValue/);
  });

  it("the message exists in all 11 locales and names the count", () => {
    for (const loc of LOCALES) {
      const raw = JSON.parse(
        readFileSync(join(MESSAGES, loc, "journal.json"), "utf8"),
      ) as Record<string, Record<string, string>>;
      const node = raw.journal ?? (raw as unknown as Record<string, string>);
      const msg = (node as Record<string, string>).unconfirmedTimeBlocked;
      expect(msg, `${loc} unconfirmedTimeBlocked`).toBeTruthy();
      expect(msg, `${loc} must name the count`).toContain("{count}");
      expect(msg, `${loc} must not be a placeholder`).not.toMatch(/^\[EN\]/);
    }
  });
});

describe("the rule itself", () => {
  it("blocks on a pending duration, and only on a REAL one", () => {
    expect(
      reviewUnconfirmedWorkTime({
        fragments: [{ status: "pending", timeValue: 6.5 }],
        entryTimeStatus: "confirmed",
        entryTimeValue: "",
      }).wouldSilentlyDiscard,
    ).toBe(true);
    // A pending fragment the pipeline could not time is not a lost duration.
    expect(
      reviewUnconfirmedWorkTime({
        fragments: [{ status: "pending", timeValue: null }],
        entryTimeStatus: "confirmed",
        entryTimeValue: "",
      }).wouldSilentlyDiscard,
    ).toBe(false);
  });

  it("DISCARD stays a real answer — deciding to drop is not a defect", () => {
    expect(
      reviewUnconfirmedWorkTime({
        fragments: [{ status: "discarded", timeValue: 8 }],
        entryTimeStatus: "discarded",
        entryTimeValue: "9",
      }).wouldSilentlyDiscard,
    ).toBe(false);
  });
});
