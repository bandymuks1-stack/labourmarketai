import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  IMAGE_COMPRESS_DEFAULTS,
  isCompressibleImage,
  computeTargetDimensions,
  compressImageFile,
} from "@/lib/browser/image-compress";

/**
 * Phone photos are auto-resized/compressed BEFORE upload (owner feedback,
 * 2026-06-23). The shared utility exists and is wired into every image upload
 * path, with mobile-sane defaults (longest edge 1600–1920px, JPEG/WebP, ~0.8).
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

describe("compress defaults match the owner spec", () => {
  it("longest edge is 1600–1920px", () => {
    expect(IMAGE_COMPRESS_DEFAULTS.maxEdge).toBeGreaterThanOrEqual(1600);
    expect(IMAGE_COMPRESS_DEFAULTS.maxEdge).toBeLessThanOrEqual(1920);
  });
  it("quality is ~0.75–0.85, output is JPEG/WebP", () => {
    expect(IMAGE_COMPRESS_DEFAULTS.quality).toBeGreaterThanOrEqual(0.75);
    expect(IMAGE_COMPRESS_DEFAULTS.quality).toBeLessThanOrEqual(0.85);
    expect(["image/jpeg", "image/webp"]).toContain(IMAGE_COMPRESS_DEFAULTS.mimeType);
  });
  it("exports the API the upload paths use", () => {
    expect(typeof compressImageFile).toBe("function");
    expect(typeof computeTargetDimensions).toBe("function");
    expect(isCompressibleImage({ type: "image/jpeg" } as File)).toBe(true);
    expect(isCompressibleImage({ type: "application/pdf" } as File)).toBe(false);
  });
});

describe("wired into every image upload path", () => {
  it("journal composer compresses + shows progress before upload", () => {
    const comp = read("components/app/journal-entry-composer.tsx");
    expect(comp).toMatch(/compressImageFile/);
    expect(comp).toMatch(/data-testid="journal-photo-preparing"/);
    expect(comp).toMatch(/data-testid="journal-photo-prepared"/);
  });
  it("buyer attachment uploader compresses images before upload", () => {
    const up = read("components/app/buyer-request-attachment-uploader.tsx");
    expect(up).toMatch(/isCompressibleImage\(picked\)/);
    expect(up).toMatch(/compressImageFile\(picked\)/);
  });
});

describe("photo progress copy present (lt/en/ru)", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: journal.photo has preparing / prepared / tooLargeAfter`, () => {
      const photo = JSON.parse(read(`messages/${loc}/journal.json`)).photo;
      for (const k of ["preparing", "prepared", "tooLargeAfter"]) {
        expect(typeof photo?.[k] === "string" && photo[k].length > 0, `${loc} photo.${k}`).toBe(true);
      }
    });
  }
});