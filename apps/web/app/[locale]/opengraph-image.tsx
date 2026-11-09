import { ImageResponse } from "next/og";
import {
  BRAND_NAME,
  BRAND_SEO,
  OG_IMAGE_SIZE,
  resolveActiveLocale,
} from "@/lib/seo/metadata";

/**
 * Generated brand share card (social-acquisition readiness v1).
 *
 * Before this file existed, buildPageMetadata declared a
 * `summary_large_image` Twitter card but shipped NO image anywhere — every
 * link shared to LinkedIn / Facebook / X / WhatsApp rendered as a bare text
 * snippet. This route gives every public page one honest, per-locale brand
 * card, drawn entirely with next/og (no external asset, no font fetch, no
 * screenshot pipeline). It carries the approved LM mark (owner 2026-11-04: the
 * approved logo at every active brand point).
 *
 * Honesty contract (doctrine §18): the card carries ONLY the brand name and
 * the SAME per-locale positioning line the SEO title already states — no
 * numbers, no claims, nothing the page itself does not say.
 *
 * Palette: the DARK-theme brand tokens from app/globals.css — ink-900
 * `6 7 13`, brand-blue `62 139 255`, brand-cyan `0 194 255`, text-primary
 * `244 246 251`, text-secondary `155 163 184` — chosen because a share card
 * has no theme switch and the dark composition carries the product's visual
 * identity. Typeface is the next/og built-in (the brand display/body faces cannot be
 * loaded here without bundling font binaries; the fallback is deliberate).
 */

/**
 * NOT next/og's default, `immutable, max-age=31536000`. That is right only for a
 * URL carrying a content hash, and `buildPageMetadata` publishes this route with
 * none, so a changed card stayed pinned for up to a year (found 2026-11-04 when
 * the approved mark was added: browsers kept showing the old card). An hour in a
 * browser, a day in a shared cache: a brand card can wait that long.
 */
const SHARE_CARD_CACHE_CONTROL = "public, no-transform, max-age=3600, s-maxage=86400";

export const alt = BRAND_NAME;
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const active = resolveActiveLocale(locale);
  const brand = BRAND_SEO[active];
  // The tagline IS the localized SEO title's positioning half — one source
  // of copy, so the card can never drift from what the page claims.
  const prefix = `${BRAND_NAME} — `;
  const tagline = brand.title.startsWith(prefix)
    ? brand.title.slice(prefix.length)
    : brand.title;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: "rgb(0, 0, 0)",
          backgroundImage:
            "radial-gradient(ellipse 55% 55% at 88% 8%, rgba(255, 217, 102, 0.14), rgba(0, 0, 0, 0)), " +
            "radial-gradient(ellipse 65% 60% at 8% 100%, rgba(212, 175, 55, 0.20), rgba(0, 0, 0, 0))",
          color: "rgb(255, 255, 255)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {/* The approved LM mark, the same geometry and gold as
              public/brand/lm-mark.svg (pinned in pwa-install-assets.test.ts):
              the owner's vector, never redrawn. Inline because next/og cannot
              load a file without a fetch, and this card makes none. */}
          <svg width="74" height="70" viewBox="0 0 700.27 660.2" role="img" aria-label={BRAND_NAME}>
            <defs>
              <linearGradient id="lm-metal" x1="89" y1="537" x2="653" y2="123" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#8C6A16" />
                <stop offset="0.28" stop-color="#D4AF37" />
                <stop offset="0.5" stop-color="#F2D675" />
                <stop offset="0.72" stop-color="#D4AF37" />
                <stop offset="1" stop-color="#8C6A16" />
              </linearGradient>
            </defs>
            <g fill="url(#lm-metal)">
              <polygon points="158.18,123.09 89.02,123.09 89.02,533.46 336.3,533.46 336.3,464.3 158.18,464.3 " />
              <polygon points="208.23,173.43 367.53,385.6 367.55,385.57 367.69,385.77 478.08,238.75 478.08,533.46 547.24,533.46 547.24,146.63 547.46,146.34 547.24,135.44 547.24,123.09 546.99,123.09 478.43,123.09 478.08,123.09 478.08,123.56 367.63,270.66 256.84,123.09 208.23,123.09 " />
              <polygon points="326.49,414.25 208.23,256.78 208.23,414.25 " />
              <circle cx="614.05" cy="497.95" r="39.16" />
            </g>
          </svg>
          <div
            style={{
              fontSize: "26px",
              letterSpacing: "3px",
              textTransform: "uppercase",
              color: "rgb(201, 201, 201)",
            }}
          >
            labourmarket.ai
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <div
            style={{
              width: "220px",
              height: "8px",
              borderRadius: "999px",
              backgroundImage:
                "linear-gradient(90deg, rgb(138, 106, 18), rgb(212, 175, 55), rgb(255, 217, 102))",
            }}
          />
          <div style={{ display: "flex", fontSize: "92px", fontWeight: 700 }}>
            <span style={{ color: "rgb(255, 255, 255)" }}>LabourMarket</span>
            <span style={{ color: "rgb(212, 175, 55)" }}>.ai</span>
          </div>
          <div
            style={{
              fontSize: "34px",
              lineHeight: 1.35,
              maxWidth: "1000px",
              color: "rgb(201, 201, 201)",
            }}
          >
            {tagline}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(42, 42, 42, 1)",
            paddingTop: "28px",
            fontSize: "24px",
            color: "rgb(154, 154, 154)",
          }}
        >
          {/* ONE template-literal child, not `text{expr}`: Satori counts
              adjacent text + interpolation as two child nodes and refuses any
              multi-child element without explicit display:flex — this exact
              line 500'd the route in production. */}
          <div>{`labourmarket.ai/${active}`}</div>
          <div>{BRAND_NAME}</div>
        </div>
      </div>
    ),
    { ...size, headers: { "cache-control": SHARE_CARD_CACHE_CONTROL } },
  );
}
