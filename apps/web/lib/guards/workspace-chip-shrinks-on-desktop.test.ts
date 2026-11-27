import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * prod-qa-walk mobile-surfaces M-6 (run 44977749659): at 1280 px the
 * workspace chip ran into the first core nav link ("Apžvalga") on the
 * projects page — 124–348 against 299–429 — and in Russian on most company
 * pages. The header's chip slot is `min-w-0` so the chip TRUNCATES on a narrow
 * bar, but the chip and its button were `sm:flex-none` (no shrink), so the
 * slot shrank and the 224 px chip spilled into the nav. From `sm` they are
 * `sm:flex-initial` (no grow, may shrink to the slot); the name truncates.
 * And "More" carrying the active page names it only from `2xl`, so at
 * 1280–1535 px the chip keeps room for its name.
 * Measured on the page by `header-desktop-fit-isolated.spec.ts`.
 */
const HEADER = readFileSync(
  resolve(__dirname, "..", "..", "components", "app", "conversation", "chat", "conversation-header.tsx"),
  "utf8",
);
const CHIP = readFileSync(
  resolve(__dirname, "..", "..", "components", "app", "conversation", "chat", "workspace-chip.tsx"),
  "utf8",
);

describe("the workspace chip shrinks with its header slot on a desktop", () => {
  it("no part of the chip is flex-none from sm", () => {
    expect(CHIP).not.toMatch(/sm:flex-none/);
  });

  it("More names the active overflow page only from 2xl, where the row fits it", () => {
    expect(HEADER).toMatch(/const OVERFLOW_ACTIVE_LABEL = "hidden 2xl:inline";/);
    expect(HEADER).toMatch(/<span className=\{activeItem \? OVERFLOW_ACTIVE_LABEL : WIDE_LABEL\}>\{triggerLabel\}<\/span>/);
  });

  it("the chip, its button and its static badge may shrink and truncate", () => {
    expect(CHIP).toMatch(/className="relative flex min-w-0 flex-1 sm:flex-initial" data-testid="workspace-chip"/);
    expect(CHIP.match(/min-w-0 flex-1 sm:max-w-56 sm:flex-initial/g)?.length).toBe(2);
    // The name truncates on one line from `lg` (the desktop this guard is
    // about); below it, it may take two lines — at 768 px one line cut
    // "Persönlicher Ber…" in de/nl/pl/ru (owner P0 2026-11-23).
    expect(CHIP.match(/max-lg:line-clamp-2 max-lg:break-words max-lg:leading-tight lg:truncate/g)?.length).toBe(2);
    expect(CHIP).not.toMatch(/sm:truncate/);
  });
});
