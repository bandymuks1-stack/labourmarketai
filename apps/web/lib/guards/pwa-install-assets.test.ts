import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * WHAT THIS PROTECTS — the iOS half of "installable": Safari ignores the
 * manifest's icon list and reads `<link rel="apple-touch-icon">`, which Next
 * emits from the file convention `app/apple-icon.png`. Without that file an
 * iPhone "Add to Home Screen" gets a screenshot thumbnail of the page, and
 * nothing fails, logs, or goes red — the same silent class as
 * `pwa-installability.test.ts`.
 *
 * The guard reads the PNG's real IHDR pixels (Apple's 180x180), not a
 * filename in a source file, and pins the file's provenance to the one
 * generator over `public/app-icon.svg` — a hand-made copy at this name is a
 * second mark and is forbidden (visual-system-black-gold).
 */

const WEB_ROOT = resolve(__dirname, "../..");
const APPLE_ICON = resolve(WEB_ROOT, "app/apple-icon.png");
const APPLE_TOUCH_SIZE = 180;

function pngSize(absPath: string): { width: number; height: number } {
  const buf = readFileSync(absPath);
  const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(buf.subarray(0, 8).equals(SIGNATURE), `${absPath} is not a PNG`).toBe(true);
  expect(buf.subarray(12, 16).toString("latin1"), "first chunk must be IHDR").toBe("IHDR");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("PWA — iOS home-screen install asset", () => {
  it("app/apple-icon.png exists (Next emits <link rel=apple-touch-icon> from it)", () => {
    expect(
      existsSync(APPLE_ICON),
      "app/apple-icon.png is missing: iOS Add-to-Home-Screen falls back to a page screenshot. Run `pnpm -F web icons:generate`.",
    ).toBe(true);
  });

  it("its real pixels are 180x180", () => {
    expect(pngSize(APPLE_ICON)).toEqual({ width: APPLE_TOUCH_SIZE, height: APPLE_TOUCH_SIZE });
  });

  it("is produced by the one icon generator, from the owner's vector", () => {
    const script = readFileSync(resolve(WEB_ROOT, "scripts/generate-icons.mts"), "utf8");
    expect(script).toContain("app/apple-icon.png");
    expect(script).toMatch(/APPLE_TOUCH_SIZE = 180/);
    expect(existsSync(resolve(WEB_ROOT, "public/app-icon.svg"))).toBe(true);
  });
});
