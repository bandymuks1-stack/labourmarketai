import { describe, expect, it } from "vitest";
import {
  compressImageFile,
  computeTargetDimensions,
  isCompressibleImage,
  isTooLargeToDecode,
  MAX_DECODE_BYTES,
} from "@/lib/browser/image-compress";

/** A File stand-in with a declared size — enough for every branch that runs
 *  before the canvas, which is all of the logic under test here. */
const fileOf = (bytes: number, type = "image/jpeg"): File =>
  ({ size: bytes, type, name: "photo.jpg", lastModified: 0 }) as File;

const MB = 1024 * 1024;

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

/**
 * MEMORY SAFETY (W7 slice 2). Decoding is where the memory goes: a 100 MB JPEG
 * materialises as ~1.2 GB of RGBA, and on a phone that is a tab crash — a worse
 * answer than a refusal. The byte size is therefore judged BEFORE anything is
 * handed to a decoder.
 */
describe("oversized input never reaches the decoder", () => {
  it("the ceiling sits far above a real phone photo but well under a crash", () => {
    // Real phone photos are 4–12 MB; the upload ceiling downstream is 5 MB.
    expect(MAX_DECODE_BYTES).toBeGreaterThan(12 * MB);
    expect(MAX_DECODE_BYTES).toBeLessThanOrEqual(64 * MB);
  });

  it("isTooLargeToDecode is an exclusive boundary", () => {
    expect(isTooLargeToDecode(MAX_DECODE_BYTES)).toBe(false);
    expect(isTooLargeToDecode(MAX_DECODE_BYTES + 1)).toBe(true);
    expect(isTooLargeToDecode(0)).toBe(false);
  });

  it("a 100 MB image is refused by size, not by decoding it", async () => {
    const res = await compressImageFile(fileOf(100 * MB));
    expect(res.skipped).toBe("too-large-to-decode");
    expect(res.resized).toBe(false);
    // The ORIGINAL comes back untouched, so the caller's own size validation
    // is what rejects it — one authority for "too big", not two.
    expect(res.file.size).toBe(100 * MB);
    expect(res.outputBytes).toBe(100 * MB);
  });

  it("size is judged before the environment, so the guard cannot be skipped", async () => {
    // Under vitest `document` is undefined. A 100 MB file must still report
    // the SIZE reason — if this ever returns "no-browser" the ordering
    // regressed and a browser build would decode before checking.
    const huge = await compressImageFile(fileOf(100 * MB));
    expect(huge.skipped).toBe("too-large-to-decode");
    // A normal photo in the same environment reports the environment.
    const normal = await compressImageFile(fileOf(3 * MB));
    expect(normal.skipped).toBe("no-browser");
  });

  it("a non-image is refused before size or environment are consulted", async () => {
    const res = await compressImageFile(fileOf(100 * MB, "application/pdf"));
    expect(res.skipped).toBe("not-an-image");
  });

  it("every non-resized result states WHY, and a resize states none", async () => {
    // `skipped` is the honesty contract: callers must be able to tell "we chose
    // not to shrink it" from "we could not even look at it".
    for (const f of [fileOf(3 * MB), fileOf(100 * MB), fileOf(1 * MB, "text/plain")]) {
      const res = await compressImageFile(f);
      expect(res.resized).toBe(false);
      expect(res.skipped).not.toBeNull();
    }
  });
});