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
 * Run: pnpm -F web icons:generate
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(WEB_ROOT, "public/app-icon.svg");

/** The sizes Chromium's install criteria and the Android launcher require. */
const SIZES = [192, 512] as const;

/**
 * An Android launcher crops a maskable icon to a safe zone of roughly 80% of
 * the icon's width. The mark is therefore drawn at 80% on a full-bleed plate
 * — the same reason the manifest declares maskable as its own file rather
 * than relabelling the "any" PNG.
 */
const MASKABLE_SAFE_ZONE = 0.8;

/** The ink plate behind a maskable icon: --c-ink-900, the page background. */
const PLATE = { r: 0x07, g: 0x07, b: 0x06, alpha: 1 } as const;

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

  console.log(`generate-icons: wrote ${written.length} files from public/app-icon.svg`);
  for (const f of written) console.log(`  public/${f}`);
}

main().catch((err) => {
  console.error("generate-icons failed:", err);
  process.exit(1);
});
