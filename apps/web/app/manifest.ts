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
 * theme/background use the ink-900 page token (#06070D, dark-first product;
 * see app/globals.css --c-ink-900).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LabourMarket.ai",
    short_name: "LabourMarket",
    description:
      "Work journal, worker profiles and construction labour-market tools.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Store taxonomy (readiness v2) — helps install-prompt + Play listing
    // classification; purely descriptive, no capability claim.
    categories: ["business", "productivity"],
    background_color: "#06070D",
    theme_color: "#06070D",
    icons: [
      // The brand SVG scales to every size and carries its own background
      // plate (safe for maskable cropping). PNG 192/512 fallbacks for older
      // Android launchers are a known follow-up (needs generated assets —
      // tracked in docs/mobile/mobile-app-readiness-v1.md).
      {
        src: "/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      { src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
    ],
  };
}
