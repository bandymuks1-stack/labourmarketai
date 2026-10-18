import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import manifest from "@/app/manifest";

/**
 * WHAT THIS PROTECTS — that this product is actually INSTALLABLE as a PWA,
 * which is one of the six distribution surfaces and the foundation of the
 * Play TWA route.
 *
 * THE DEFECT THIS WAS WRITTEN FOR. The manifest shipped with SVG icons only.
 * That is valid manifest JSON, it renders correctly everywhere a developer
 * would look, and Chromium will NOT offer to install it: the install criteria
 * require a raster icon of at least 192x192 (and 512x512 for the splash).
 * Nothing fails, nothing logs, no test goes red — the browser simply never
 * shows the prompt. A capability that exists, is correct, and cannot be
 * reached by a person: the same class as `work-verification-state.ts`.
 *
 * THIS GUARD EXECUTES THE MANIFEST AND READS THE IMAGE BYTES. It calls the
 * real `manifest()` and parses the actual PNG headers off disk. It does not
 * assert that a filename appears in a source file — that assertion would have
 * passed with a 1x1 transparent pixel, or with a file that does not exist.
 */

const WEB_ROOT = resolve(__dirname, "../..");

/**
 * Read a PNG's true dimensions from its IHDR chunk. Eight-byte signature,
 * then a 25-byte IHDR whose width and height are big-endian uint32 at offsets
 * 16 and 20. Deliberately dependency-free: the point is to measure the file
 * that ships, not to trust a library that might normalise it.
 */
function pngSize(absPath: string): { width: number; height: number } {
  const buf = readFileSync(absPath);
  const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(
    buf.subarray(0, 8).equals(SIGNATURE),
    `${absPath} is not a PNG. The manifest declares it as image/png; a browser that cannot decode it treats the icon as absent.`,
  ).toBe(true);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const m = manifest();
const icons = m.icons ?? [];

/** Every icon the manifest declares, with its file resolved on disk. */
const declared = icons.map((i) => ({
  ...i,
  abs: resolve(WEB_ROOT, "public", String(i.src).replace(/^\//, "")),
}));

describe("PWA — the manifest describes an app a browser will install", () => {
  it("declares the fields the install criteria require", () => {
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBeTruthy();
    expect(["standalone", "fullscreen", "minimal-ui"]).toContain(m.display);
    expect(m.background_color).toBeTruthy();
    expect(m.theme_color).toBeTruthy();
  });

  it("every declared icon file actually exists", () => {
    for (const i of declared) {
      // `/favicon.ico` is served by Next from `app/favicon.ico` (file-based
      // metadata), not from `public/`. Both locations are legitimate; what
      // may never happen is a manifest pointing at neither.
      const inApp = resolve(WEB_ROOT, "app", String(i.src).replace(/^\//, ""));
      expect(
        existsSync(i.abs) || existsSync(inApp),
        `Manifest declares ${i.src} and no such file exists in public/ or app/. A missing icon is not a broken image on screen — it is a PWA that silently stops being installable.`,
      ).toBe(true);
    }
  });

  it("carries a raster icon of at least 192x192 — the installability floor", () => {
    const raster = declared.filter((i) => i.type === "image/png" && existsSync(i.abs));
    expect(
      raster.length,
      "No PNG icon is declared. Chromium requires a raster icon to offer installation; an SVG-only icon list is silently not installable.",
    ).toBeGreaterThan(0);
    const sizes = raster.map((i) => pngSize(i.abs));
    expect(sizes.some((s) => s.width >= 192 && s.height >= 192)).toBe(true);
  });

  it("carries a 512x512 raster icon — the splash-screen requirement", () => {
    const raster = declared.filter((i) => i.type === "image/png" && existsSync(i.abs));
    const sizes = raster.map((i) => pngSize(i.abs));
    expect(sizes.some((s) => s.width >= 512 && s.height >= 512)).toBe(true);
  });

  it("each PNG's real pixels match the size it declares", () => {
    // A `sizes` string is a CLAIM about a file. An icon declared 512x512 that
    // is really 192x192 is upscaled into mush on the splash screen, and the
    // manifest reads as correct the whole time.
    for (const i of declared) {
      if (i.type !== "image/png" || !existsSync(i.abs)) continue;
      const [w, h] = String(i.sizes).split("x").map(Number);
      if (!Number.isFinite(w) || !Number.isFinite(h)) continue;
      const real = pngSize(i.abs);
      expect(
        real,
        `${i.src} declares ${i.sizes} and its pixels are ${real.width}x${real.height}.`,
      ).toEqual({ width: w, height: h });
    }
  });

  it("declares a maskable icon, and not by relabelling the plain one", () => {
    // An Android launcher crops a maskable icon to roughly 80% of its width.
    // Pointing `purpose: "maskable"` at an icon drawn edge-to-edge is how a
    // logo arrives on a home screen with its edges sliced off — and it looks
    // perfectly correct in every preview that does not crop.
    const maskable = declared.filter((i) => String(i.purpose).includes("maskable"));
    expect(maskable.length, "No maskable icon: Android will letterbox the icon in a white circle.").toBeGreaterThan(0);
    const plainSrcs = new Set(
      declared.filter((i) => i.purpose === "any").map((i) => String(i.src)),
    );
    for (const i of maskable) {
      expect(
        plainSrcs.has(String(i.src)),
        `${i.src} is declared both "any" and "maskable". A maskable icon needs its own rendering with a safe zone; the same file cannot honestly be both.`,
      ).toBe(false);
    }
  });

  it("the icons are derivations of the owner's mark, and regenerable", () => {
    // The PNGs are binary: nothing in a diff shows whether they still match
    // the brand source. The generator is what makes that checkable, so its
    // absence is a real regression even though every icon still renders.
    expect(existsSync(resolve(WEB_ROOT, "public/app-icon.svg"))).toBe(true);
    expect(existsSync(resolve(WEB_ROOT, "scripts/generate-icons.mts"))).toBe(true);
    const pkg = JSON.parse(readFileSync(resolve(WEB_ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["icons:generate"]).toBeTruthy();
  });
});
