import type { MetadataRoute } from "next";

/**
 * PWA web app manifest (audit PR9 — mobile app readiness baseline).
 * Served by Next at /manifest.webmanifest and auto-linked from every page.
 *
 * Honest baseline only: install metadata + icons. There is NO service
 * worker / offline mode yet (decision + notification spine pending — see
 * docs/mobile/mobile-app-readiness-v1.md), so nothing here promises
 * offline capability.
 *
 * start_url is "/" — the locale middleware redirects to the visitor's
 * locale, and an authenticated user continues to their dashboard exactly
 * like a normal visit (no special app entry that could bypass auth).
 *
 * theme/background use the ink-900 page token (#000000, black + metallic gold;
 * see app/globals.css --c-ink-900).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LabourMarket.ai",
    short_name: "LabourMarket",
    description:
      "One work world for workers, employers, agencies and institutions: real work, evidence, skills, demand, matching and workforce operations.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Store taxonomy (readiness v2) — helps install-prompt + Play listing
    // classification; purely descriptive, no capability claim.
    categories: ["business", "productivity"],
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      // THE PNGs ARE NOT A FALLBACK — THEY ARE THE INSTALLABILITY REQUIREMENT.
      //
      // Chromium's install criteria require a raster icon of at least
      // 192x192, and a 512x512 for the splash. An SVG-only icon list is
      // valid manifest JSON and is NOT installable: the browser simply never
      // offers to install, with no error anywhere a developer would look.
      // This manifest shipped SVG-only, so the PWA has not been installable
      // on Android or desktop Chrome — the same silent-failure class as a
      // green test over an unreachable capability.
      //
      // All four are rasterizations of `public/app-icon.svg` — the owner's
      // own mark, geometry verbatim. Nothing here is a new design, and no
      // brand decision was taken to generate them. Regenerate with
      // `pnpm -F web icons:generate`.
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Maskable is a SEPARATE rendering, not the same file relabelled: an
      // Android launcher crops a maskable icon to ~80% of its width, so the
      // mark is drawn at 80% on a full-bleed ink plate. Declaring the "any"
      // PNG as maskable would let the launcher clip the glyph.
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      // The vector stays FIRST-CLASS for anything that can scale it.
      { src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
    ],
  };
}
