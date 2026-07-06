import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PWA baseline guard (audit PR9 — mobile app readiness v1).
 *
 * Pins the installable-app baseline: a real manifest with honest fields, a
 * published brand icon, scheme-aware theme color + safe-area viewport, and
 * Apple add-to-home-screen metadata. Also pins what must NOT exist yet: no
 * service worker (offline needs its own explicit cache-policy PR — never
 * cache authenticated HTML by accident) and no create-next-app demo assets.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

describe("web app manifest", () => {
  const manifest = read("app/manifest.ts");

  it("declares the honest install baseline", () => {
    expect(manifest).toMatch(/name: "LabourMarket\.ai"/);
    expect(manifest).toMatch(/short_name: "LabourMarket"/);
    expect(manifest).toMatch(/start_url: "\/"/);
    expect(manifest).toMatch(/display: "standalone"/);
    expect(manifest).toMatch(/background_color: "#06070D"/);
    expect(manifest).toMatch(/theme_color: "#06070D"/);
  });

  it("carries the store taxonomy (readiness v2) — descriptive only", () => {
    expect(manifest).toMatch(/categories: \["business", "productivity"\]/);
    // Taxonomy is not a capability claim: still no screenshots field until
    // real product screenshots exist (a placeholder array would be a lie).
    expect(manifest).not.toMatch(/screenshots/);
  });

  it("references only icons that exist at stable URLs", () => {
    expect(manifest).toMatch(/\/app-icon\.svg/);
    expect(existsSync(join(ROOT, "public/app-icon.svg"))).toBe(true);
    expect(existsSync(join(ROOT, "app/favicon.ico"))).toBe(true);
  });

  it("makes no offline promise (no SW exists yet)", () => {
    expect(existsSync(join(ROOT, "public/sw.js"))).toBe(false);
    expect(existsSync(join(ROOT, "public/service-worker.js"))).toBe(false);
  });
});

describe("layout viewport + apple metadata", () => {
  const layout = read("app/[locale]/layout.tsx");

  it("exports a safe-area-aware viewport with scheme-aware theme color", () => {
    expect(layout).toMatch(/export const viewport: Viewport/);
    expect(layout).toMatch(/viewportFit: "cover"/);
    expect(layout).toMatch(/prefers-color-scheme: dark[^}]*#06070D/);
    expect(layout).toMatch(/prefers-color-scheme: light[^}]*#F4F6FB/);
  });

  it("declares Apple add-to-home-screen chrome", () => {
    expect(layout).toMatch(/appleWebApp: \{/);
    expect(layout).toMatch(/capable: true/);
  });
});

describe("no create-next-app demo assets in public/", () => {
  for (const f of ["next.svg", "vercel.svg", "globe.svg", "window.svg", "file.svg"]) {
    it(`public/${f} stays deleted`, () => {
      expect(existsSync(join(ROOT, "public", f))).toBe(false);
    });
  }
});
