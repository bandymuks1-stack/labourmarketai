import { describe, expect, it } from "vitest";
import {
  computeTargetDimensions,
  isCompressibleImage,
} from "@/lib/browser/image-compress";

/** Pure dimension math for client-side photo resize (orientation-preserving
 *  canvas path runs only in the browser; the math is deterministic + tested). */
describe("computeTargetDimensions", () => {
  it("never upscales when already within the cap", () => {
    expect(computeTargetDimensions(800, 600, 1920)).toEqual({ width: 800, height: 600 });
    expect(computeTargetDimensions(1920, 1080, 1920)).toEqual({ width: 1920, height: 1080 });
  });
  it("scales the longest edge to the cap, preserving aspect ratio", () => {
    expect(computeTargetDimensions(4000, 3000, 1920)).toEqual({ width: 1920, height: 1440 });
    expect(computeTargetDimensions(3000, 4000, 1920)).toEqual({ width: 1440, height: 1920 });
  });
  it("handles square + portrait + landscape", () => {
    expect(computeTargetDimensions(4000, 4000, 1600)).toEqual({ width: 1600, height: 1600 });
    expect(computeTargetDimensions(6000, 2000, 1920)).toEqual({ width: 1920, height: 640 });
  });
  it("degrades safely on zero/negative input", () => {
    expect(computeTargetDimensions(0, 0, 1920)).toEqual({ width: 0, height: 0 });
    expect(computeTargetDimensions(-5, 100, 1920)).toEqual({ width: 0, height: 0 });
  });
  it("rounds to whole pixels and never below 1", () => {
    const r = computeTargetDimensions(2001, 1000, 1920);
    expect(Number.isInteger(r.width)).toBe(true);
    expect(Number.isInteger(r.height)).toBe(true);
    expect(r.width).toBe(1920);
    expect(r.height).toBeGreaterThanOrEqual(1);
  });
});

describe("isCompressibleImage", () => {
  it("accepts jpeg/png/webp only", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(isCompressibleImage({ type } as File)).toBe(true);
    }
    for (const type of ["application/pdf", "text/plain", "image/gif", "image/svg+xml", ""]) {
      expect(isCompressibleImage({ type } as File)).toBe(false);
    }
  });
});