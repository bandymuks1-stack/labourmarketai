import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mobile-first room polish (v1). After the room-based IA reset, each room must
 * read as one clear space on a phone — not a compressed desktop dashboard. The
 * journey rail must not cram N labelled circles on mobile, and the room's
 * primary action must be a full-width tap target on phones.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

// The overview room (/dashboard/advanced) and its journey rail / current-space
// header were deleted whole by W3 Package 4 — that mobile posture no longer
// needs a pin. What survives of the slice is below.

describe("room primary action is a full-width tap target on mobile", () => {
  it("pilot CTA is w-full on mobile, compact at sm+", () => {
    const btn = read("components/app/demand-request-button.tsx");
    expect(btn).toMatch(/w-full sm:w-auto/);
  });
});

describe("no broad redesign / no logic change", () => {
  it("the worker keeps the inline work-card editor in its canonical home", () => {
    // WorkCard was removed (dedup v1); W3 row 1 moved the state-aware editor
    // into the workspace `player-card` result — its one home after W3
    // Package 4 deleted the second dashboard.
    expect(read("components/app/workspace/player-card-result.tsx")).toMatch(
      /<WorkCardEditor/,
    );
  });
});
