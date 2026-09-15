import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
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

describe("ŠIANDIEN reads as one clear page on a phone (IA 2026-09-13 §5)", () => {
  // RETIRED: the worker's phone home as the chat with the intro card and
  // results stacked as cards. What is pinned: one primary action, secondary
  // actions as text links with the 44px floor, no arbitrary type sizes, no
  // hand-rolled card surface, and the worker's 3-tab bar at a tap height
  // the primitive already guarantees.
  const files = readdirSync(join(root, "components", "app", "today")).filter((f) =>
    f.startsWith("today-"),
  );

  it("exactly one primary CTA on the whole screen", () => {
    const all = files.map((f) => read(`components/app/today/${f}`)).join("\n");
    expect(all.match(/buttonLinkClassName\("primary"\)/g)).toHaveLength(1);
    expect(all).not.toMatch(/<Button\b/);
  });

  it("every secondary action is a link with the 44px floor", () => {
    for (const f of files) {
      const src = read(`components/app/today/${f}`);
      const links = src.match(/<Link\b[\s\S]*?>/g) ?? [];
      for (const link of links) {
        expect(link, `${f}: ${link.slice(0, 60)}`).toMatch(/min-h-11|buttonLinkClassName|pillLinkClassName/);
      }
    }
  });

  it("uses the type ladder and the Card primitive, never raw sizes or raw card-border", () => {
    for (const f of files) {
      const src = read(`components/app/today/${f}`);
      expect(src, f).not.toMatch(/text-xs\b|text-sm\b|text-\[[0-9.]+(px|rem)\]/);
      expect(src, f).not.toMatch(/card-border/);
    }
  });

  it("the worker bar keeps the primitive's tap height", () => {
    expect(read("components/app/bottom-nav.tsx")).toMatch(/h-16 flex-col/);
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
