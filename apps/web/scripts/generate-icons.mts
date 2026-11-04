/**
 * ICON GENERATION — rasterize the owner's brand mark into the PNG sizes the
 * distribution surfaces require.
 *
 * WHY THIS EXISTS AS A SCRIPT AND NOT A ONE-OFF. The manifest's PNGs are an
 * installability requirement (Chromium will not offer to install a PWA whose
 * icon list has no raster >= 192px, and says nothing when it declines). Four
 * binary files that nobody can regenerate are four files that drift from the
 * brand source the first time the mark changes, and the drift is invisible in
 * a diff. `icons:generate` + `icon-assets.test.ts` make the relationship
 * checkable: the guard asserts the sizes and formats, this script produces
 * them, and the SOURCE is the owner's own vector.
 *
 * NO BRAND DECISION IS TAKEN HERE. Every output is a rasterization of
 * `public/app-icon.svg` — geometry verbatim, the owner's mark and the owner's
 * colours. Choosing new art, or approving art for a STORE listing, is an
 * owner gate (see docs/mobile/STORE_RELEASE_READINESS_2026-09-13.md §4.1) and
 * this script neither performs nor implies it.
 *
 * `app/favicon.ico` is written here too (owner defect 2026-11-04): it sat outside
 * this script, kept the old ascending bars for four months after the mark
 * changed, and Chrome chose it for the browser tab.
 *
 * Run: pnpm -F web icons:generate
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(WEB_ROOT, "public/app-icon.svg");

/** The sizes Chromium's install criteria and the Android launcher require. */
const SIZES = [192, 512] as const;

/**
 * iOS "Add to Home Screen" reads `<link rel="apple-touch-icon">`, which Next
 * emits from the file convention `app/apple-icon.png`. Safari ignores the
 * manifest icons, composites onto an OPAQUE plate (transparent pixels turn
 * black) and rounds the corners itself — so this is the maskable composition
 * (ink plate, mark in the safe zone) at Apple's 180 px, not a new drawing.
 */
const APPLE_TOUCH_SIZE = 180;

/**
 * An Android launcher crops a maskable icon to a safe zone of roughly 80% of
 * the icon's width. The mark is therefore drawn at 80% on a full-bleed plate
 * — the same reason the manifest declares maskable as its own file rather
 * than relabelling the "any" PNG.
 */
const MASKABLE_SAFE_ZONE = 0.8;

/** The ink plate behind a maskable icon: --c-ink-900, the page background. */
const PLATE = { r: 0x07, g: 0x07, b: 0x06, alpha: 1 } as const;

/**
 * The favicon's source is `app/icon.svg`: the same geometry in the flat form on
 * the rounded tile, drawn for 16px, where a metallic ramp resolves into mud.
 */
const FAVICON_SOURCE = resolve(WEB_ROOT, "app/icon.svg");
const FAVICON_SIZES = [16, 32, 48] as const;

/** An ICO is a directory of images; each entry here is a whole PNG. */
function icoFromPngs(images: readonly { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

/** High density so the vector resolves cleanly before it is downsampled. */
const DENSITY = 600;

async function main(): Promise<void> {
  const svg = readFileSync(SOURCE);
  const written: string[] = [];

  for (const size of SIZES) {
    const out = resolve(WEB_ROOT, `public/icon-${size}.png`);
    await sharp(svg, { density: DENSITY })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
    written.push(`icon-${size}.png`);
  }

  for (const size of SIZES) {
    const inner = Math.round(size * MASKABLE_SAFE_ZONE);
    const pad = Math.round((size - inner) / 2);
    const mark = await sharp(svg, { density: DENSITY })
      .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const out = resolve(WEB_ROOT, `public/icon-maskable-${size}.png`);
    await sharp({ create: { width: size, height: size, channels: 4, background: PLATE } })
      .composite([{ input: mark, top: pad, left: pad }])
      .png({ compressionLevel: 9 })
      .toFile(out);
    written.push(`icon-maskable-${size}.png`);
  }

  {
    const size = APPLE_TOUCH_SIZE;
    const inner = Math.round(size * MASKABLE_SAFE_ZONE);
    const pad = Math.round((size - inner) / 2);
    const mark = await sharp(svg, { density: DENSITY })
      .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background: PLATE } })
      .composite([{ input: mark, top: pad, left: pad }])
      .png({ compressionLevel: 9 })
      .toFile(resolve(WEB_ROOT, "app/apple-icon.png"));
    written.push("../app/apple-icon.png");
  }

  {
    const source = readFileSync(FAVICON_SOURCE);
    const images = await Promise.all(
      FAVICON_SIZES.map(async (size) => ({
        size,
        png: await sharp(source, { density: DENSITY })
          .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png({ compressionLevel: 9 })
          .toBuffer(),
      })),
    );
    writeFileSync(resolve(WEB_ROOT, "app/favicon.ico"), icoFromPngs(images));
    written.push("../app/favicon.ico");
  }

  console.log(`generate-icons: wrote ${written.length} files from the owner's vector`);
  for (const f of written) console.log(`  public/${f}`);
}

main().catch((err) => {
  console.error("generate-icons failed:", err);
  process.exit(1);
});
