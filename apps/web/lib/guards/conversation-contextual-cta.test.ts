import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Contextual-CTA guard (PR-F).
 *
 * The four generic starter chips (CV / jobs / profile / offers) taught users
 * to ignore the chip row because they were appended to EVERY assistant turn.
 * The rule this pins: the generic menu appears only where it IS a menu — the
 * greeting and the not-understood fallback — and every specific response
 * either carries CONTEXTUAL follow-ups or none at all.
 */

const APP = join(__dirname, "..", "..");
const CHAT = readFileSync(
  join(APP, "components", "app", "conversation", "chat", "conversation-chat.tsx"),
  "utf8",
);

describe("generic starter chips appear only where a menu belongs", () => {
  it("blocked/hint answers carry NO chip row (they explain themselves)", () => {
    for (const key of [
      "calendarHint",
      "reminderBlocked",
      "translateBlocked",
      "writeEmployerHint",
    ]) {
      // assistant(labels.X) with no second argument.
      expect(CHAT, key).toMatch(new RegExp(`assistant\\(labels\\.${key}\\);`));
      expect(CHAT, key).not.toMatch(
        new RegExp(`assistant\\(labels\\.${key},\\s*starterChips\\)`),
      );
    }
  });

  it("flow closings re-read REAL state instead of dropping back to the menu", () => {
    // CV import, worker forms and the work log all end in a fresh
    // profile-summary read; the employer demand form (rebuild W4) ends in the
    // demand-specific follow-up — the user always sees a contextual next
    // step, never the generic menu.
    // Three flow closings remain (CV import, worker forms, work log); the
    // MOUNT read moved to the opening brief, which is asserted below.
    const closings = CHAT.match(/startProfileSummaryRef\.current\(/g) ?? [];
    expect(closings.length).toBeGreaterThanOrEqual(3);
    expect(CHAT).toMatch(/isEmployer\s*\?\s*companyFollowup/);
    expect(CHAT).toMatch(/assistant\(labels\.companyDemandNext/);
    expect(CHAT).not.toMatch(/onClose=\{\(\) => assistant\(labels\.fallback, starterChips\)/);
  });

  it("empty search/offers answers point at criteria/profile, not the menu", () => {
    expect(CHAT).toMatch(/assistant\(res\.message, searchChips\)/);
    expect(CHAT).toMatch(/assistant\(labels\.offersEmpty, \[/);
  });

  it("the menu still exists where it belongs: greeting and fallback", () => {
    expect(CHAT).toMatch(/chips: starterChips,?\s*\}\s*as ChatMessage/);
    expect(CHAT).toMatch(/assistant\(labels\.fallback, starterChips\)/);
  });
});

describe("history + state-aware opening", () => {
  it("restored transcript renders as ONE collapsed history block, not a dump", () => {
    expect(CHAT).toMatch(/<HistoryBlock/);
    const history = readFileSync(
      join(APP, "components", "app", "conversation", "chat", "history-block.tsx"),
      "utf8",
    );
    // Pages backwards in chunks — long history loads in parts.
    expect(history).toMatch(/const PAGE = \d+/);
    expect(history).toMatch(/setShown\(/);
  });

  it("an authenticated mount opens with the REAL opening brief (owner W2)", () => {
    expect(CHAT).toMatch(/openedWithStateRef/);
    // The brief composes new-matches / conflicts / unlogged-work / first
    // profile gap server-side; `none` leaves the greeting standing alone.
    expect(CHAT).toMatch(/loadOpeningBrief\(\)/);
    expect(CHAT).toMatch(/if \(brief\.kind !== "brief"\) return/);
  });

  it("the greeting row and every answer respect the 1-3 action cap", () => {
    // The six-chip wall is gone: the worker greeting offers exactly three
    // starts, and the profile summary slices its follow-ups to three.
    const starter = /const starterChips[\s\S]*?\],\s*\[labels/.exec(CHAT)?.[0] ?? "";
    // BOTH identity branches respect the cap: each chip-array segment holds
    // at most three entries.
    for (const segment of starter.split(": [").slice(1)) {
      const ids = segment.split("]")[0].match(/\{ id: "/g) ?? [];
      expect(ids.length).toBeLessThanOrEqual(3);
    }
    expect(CHAT).toMatch(/\.slice\(0, 3\)/);
  });
});
