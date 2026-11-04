import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

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

/**
 * EVERY BRAND RASTER IS THE OWNER'S MARK (owner defect 2026-11-04: "visur turi
 * būti tik naujas normalus patvirtintas logo"). `app/favicon.ico` sat outside
 * the generator and kept the old ascending bars after the mark changed, so the
 * browser tab showed the old logo. A filename or a size check cannot see that:
 * these read the real pixels and compare them with a fresh rasterization of the
 * vector. A tolerance, not bytes, because the encoder differs between machines.
 */
const SOURCE_TILE = resolve(WEB_ROOT, "app/icon.svg");
const SOURCE_MARK = resolve(WEB_ROOT, "public/app-icon.svg");
const PLATE = { r: 0x07, g: 0x07, b: 0x06, alpha: 1 };
const MAX_MEAN_CHANNEL_DIFF = 6;
const DENSITY = 600;

async function rgba(input: Buffer | string, size: number): Promise<Buffer> {
  return sharp(input, typeof input === "string" ? { density: DENSITY } : undefined)
    .resize(size, size)
    .ensureAlpha()
    .raw()
    .toBuffer();
}

function meanDiff(a: Buffer, b: Buffer): number {
  expect(a.length).toBe(b.length);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
}

function icoImages(absPath: string): { size: number; png: Buffer }[] {
  const buf = readFileSync(absPath);
  expect(buf.readUInt16LE(2), "not an icon file").toBe(1);
  return Array.from({ length: buf.readUInt16LE(4) }, (_, i) => {
    const at = 6 + 16 * i;
    const start = buf.readUInt32LE(at + 12);
    return { size: buf.readUInt8(at), png: buf.subarray(start, start + buf.readUInt32LE(at + 8)) };
  });
}

/** Share of opaque pixels that are clearly blue or violet: the old bars' colours. */
async function oldBarsShare(input: Buffer | string): Promise<number> {
  const px = await rgba(input, 64);
  let opaque = 0;
  let blue = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3]! < 128) continue;
    opaque++;
    if (px[i + 2]! > 120 && px[i + 2]! > px[i]! + 40 && px[i + 2]! > px[i + 1]! + 20) blue++;
  }
  return blue / Math.max(opaque, 1);
}

describe("every brand raster is the owner's mark, read from its pixels", () => {
  const FAVICON = resolve(WEB_ROOT, "app/favicon.ico");

  it("app/favicon.ico holds 16, 32 and 48, each the rasterized app/icon.svg", async () => {
    const images = icoImages(FAVICON);
    expect(images.map((i) => i.size).sort((a, b) => a - b)).toEqual([16, 32, 48]);
    for (const { size, png } of images) {
      const diff = meanDiff(await rgba(png, size), await rgba(SOURCE_TILE, size));
      expect(diff, `favicon ${size}px has drifted from app/icon.svg. Run \`pnpm -F web icons:generate\`.`).toBeLessThan(
        MAX_MEAN_CHANNEL_DIFF,
      );
    }
  });

  it("the favicon comes from the one generator, and the two vectors are one mark", () => {
    const script = readFileSync(resolve(WEB_ROOT, "scripts/generate-icons.mts"), "utf8");
    expect(script).toContain("app/favicon.ico");
    expect(script).toContain("FAVICON_SIZES = [16, 32, 48]");
    expect(readFileSync(SOURCE_TILE, "utf8")).toBe(readFileSync(SOURCE_MARK, "utf8"));
  });

  for (const [file, size] of [
    ["public/icon-192.png", 192],
    ["public/icon-512.png", 512],
  ] as const) {
    it(`${file} is the rasterized vector`, async () => {
      const diff = meanDiff(await rgba(resolve(WEB_ROOT, file), size), await rgba(SOURCE_MARK, size));
      expect(diff).toBeLessThan(MAX_MEAN_CHANNEL_DIFF);
    });
  }

  for (const [file, size] of [
    ["public/icon-maskable-192.png", 192],
    ["public/icon-maskable-512.png", 512],
    ["app/apple-icon.png", 180],
  ] as const) {
    it(`${file} is the vector on the plate, in the safe zone`, async () => {
      const inner = Math.round(size * 0.8);
      const pad = Math.round((size - inner) / 2);
      const mark = await sharp(SOURCE_MARK, { density: DENSITY }).resize(inner, inner).png().toBuffer();
      const expected = await sharp({ create: { width: size, height: size, channels: 4, background: PLATE } })
        .composite([{ input: mark, top: pad, left: pad }])
        .png()
        .toBuffer();
      const diff = meanDiff(await rgba(resolve(WEB_ROOT, file), size), await rgba(expected, size));
      expect(diff).toBeLessThan(MAX_MEAN_CHANNEL_DIFF);
    });
  }

  for (const file of ["icon.png", "adaptive-icon.png", "adaptive-icon-monochrome.png", "splash-icon.png"]) {
    it(`mobile ${file} holds none of the old bars' colours`, async () => {
      const path = resolve(WEB_ROOT, "../mobile/assets", file);
      expect(await oldBarsShare(path)).toBeLessThan(0.01);
    });
  }

  it("the check can see the old icon: blue bars on a dark tile fail it", async () => {
    const bars = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 10, g: 14, b: 26, alpha: 1 } } })
      .composite([
        {
          input: await sharp({
            create: { width: 40, height: 40, channels: 4, background: { r: 96, g: 110, b: 250, alpha: 1 } },
          })
            .png()
            .toBuffer(),
          top: 12,
          left: 12,
        },
      ])
      .png()
      .toBuffer();
    expect(await oldBarsShare(bars)).toBeGreaterThan(0.1);
    expect(meanDiff(await rgba(bars, 32), await rgba(SOURCE_TILE, 32))).toBeGreaterThan(MAX_MEAN_CHANNEL_DIFF);
  });
});

/**
 * THE MARK IS NEVER REDRAWN (owner 2026-11-04: "Naujo logotipo neperpiešti,
 * nekeisti jo proporcijų, spalvų ar kompozicijos"). Every shipped vector carries
 * the owner's geometry byte for byte, and the raster's scale is uniform.
 *
 * The COLOUR is pinned as it stands, not as the source file has it: the source
 * is orange (#FFA100); the product shows gold under the visual direction approved
 * 2026-09-09 (#1683). The register row UX-10 names that for the owner.
 */
describe("the shipped mark is the owner's geometry", () => {
  const SOURCE = resolve(WEB_ROOT, "../../docs/brand/source/LM_Color Single.svg");
  const shapes = (text: string) => ({
    polygons: [...text.matchAll(/<polygon[^>]*points="([^"]+)"/g)].map((m) => m[1]!.trim()).sort(),
    circle: /cx="614\.05"\s+cy="497\.95"\s+r="39\.16"/.test(text),
  });

  for (const file of ["public/brand/lm-mark.svg", "app/icon.svg", "public/app-icon.svg", "components/ui/lm-logo.tsx", "app/[locale]/opengraph-image.tsx"]) {
    it(`${file}: every polygon and the dot, verbatim`, () => {
      const source = shapes(readFileSync(SOURCE, "utf8"));
      expect(source.polygons).toHaveLength(3);
      const shipped = shapes(readFileSync(resolve(WEB_ROOT, file), "utf8"));
      expect(shipped.polygons).toEqual(source.polygons);
      expect(shipped.circle).toBe(true);
    });
  }

  it("the tile places it with one uniform scale, so its proportions hold", () => {
    const tile = readFileSync(SOURCE_TILE, "utf8");
    expect(tile).toMatch(/<g transform="translate\([-\d.]+ [-\d.]+\) scale\([\d.]+\)" fill="#D4AF37">/);
    expect(tile).toContain('fill="#070706"');
  });

  it("the gold is the approved one, in the full-size mark too", () => {
    const mark = readFileSync(resolve(WEB_ROOT, "public/brand/lm-mark.svg"), "utf8");
    for (const stop of ["#8C6A16", "#D4AF37", "#F2D675"]) expect(mark).toContain(stop);
  });
});

/**
 * THE APPROVED LOGO AT THE PLACES A PERSON LANDS WHEN SOMETHING GOES WRONG (owner
 * 2026-11-04: "registracijos, prisijungimo, klaidų ir viešuosius puslapius").
 * Through the ONE component, so none of them can carry a second drawing.
 */
describe("brand pages use the one logo component", () => {
  for (const file of [
    "app/[locale]/not-found.tsx",
    "app/not-found.tsx",
    "app/[locale]/error.tsx",
    "app/global-error.tsx",
    "app/[locale]/auth/layout.tsx",
    "components/layouts/site-nav.tsx",
    "components/app/conversation/chat/conversation-header.tsx",
  ]) {
    it(`${file} renders LmLogo`, () => {
      expect(readFileSync(resolve(WEB_ROOT, file), "utf8")).toContain("<LmLogo");
    });
  }
});
