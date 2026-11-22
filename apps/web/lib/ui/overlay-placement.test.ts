import { describe, expect, it } from "vitest";
import { chooseSide, placeOverlay, OVERLAY_EDGE } from "./overlay-placement";

// The cases the responsive sweep of 2026-11-21 measured on the isolated stack.
describe("overlay placement", () => {
  it("a header menu on a phone on its side scrolls inside the room below the trigger", () => {
    // account menu trigger in a 56 px header, 460 px menu, 568 × 320 screen
    const p = placeOverlay({ top: 6, bottom: 50, left: 512, right: 556 }, { width: 288, height: 460 }, { width: 568, height: 320 }, "right");
    expect(p.top).toBe(58);
    expect(p.bottom).toBeUndefined();
    expect(p.maxHeight).toBe(320 - 50 - 8 - OVERLAY_EDGE);
    expect(p.scroll).toBe(true);
    expect((p.top ?? 0) + p.maxHeight).toBeLessThanOrEqual(320 - OVERLAY_EDGE);
  });

  it("a menu that fits keeps its natural height and does not scroll", () => {
    const p = placeOverlay({ top: 6, bottom: 50, left: 1200, right: 1244 }, { width: 288, height: 300 }, { width: 1280, height: 800 }, "right");
    expect(p.scroll).toBe(false);
    expect(p.left).toBe(1244 - 288);
  });

  it("a trigger low on the screen opens upward when there is more room above", () => {
    const p = placeOverlay({ top: 500, bottom: 544, left: 20, right: 120 }, { width: 200, height: 300 }, { width: 375, height: 667 }, "left");
    expect(p.bottom).toBe(667 - 500 + 8);
    expect(p.top).toBeUndefined();
    expect(p.scroll).toBe(false);
  });

  it("never runs past either side edge, and is never wider than the screen", () => {
    const right = placeOverlay({ top: 6, bottom: 50, left: 4, right: 48 }, { width: 288, height: 100 }, { width: 320, height: 568 }, "right");
    expect(right.left).toBe(OVERLAY_EDGE);
    const left = placeOverlay({ top: 6, bottom: 50, left: 280, right: 312 }, { width: 288, height: 100 }, { width: 320, height: 568 }, "left");
    expect((left.left ?? 0) + 288).toBeLessThanOrEqual(320 - OVERLAY_EDGE);
    expect(left.maxWidth).toBe(320 - 2 * OVERLAY_EDGE);
  });

  it("a list just above a fixed bottom bar opens above its field", () => {
    // onboarding country field (bottom 420) over the 125 px Finish bar, 568 px screen
    expect(chooseSide({ top: 376, bottom: 420 }, 300, 568, 56, 125, 4, 8).side).toBe("above");
    // the same field with room below keeps opening downward
    expect(chooseSide({ top: 120, bottom: 164 }, 300, 844, 56, 69, 4, 8).side).toBe("below");
  });
});
