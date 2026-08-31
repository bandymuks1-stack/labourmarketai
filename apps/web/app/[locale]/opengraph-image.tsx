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
 * screenshot pipeline).
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
          backgroundColor: "rgb(6, 7, 13)",
          backgroundImage:
            "radial-gradient(ellipse 55% 55% at 88% 8%, rgba(0, 194, 255, 0.16), rgba(6, 7, 13, 0)), " +
            "radial-gradient(ellipse 65% 60% at 8% 100%, rgba(62, 139, 255, 0.20), rgba(6, 7, 13, 0))",
          color: "rgb(244, 246, 251)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              width: "14px",
              height: "14px",
              borderRadius: "999px",
              backgroundImage:
                "linear-gradient(135deg, rgb(62, 139, 255), rgb(0, 194, 255))",
            }}
          />
          <div
            style={{
              fontSize: "26px",
              letterSpacing: "3px",
              textTransform: "uppercase",
              color: "rgb(155, 163, 184)",
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
                "linear-gradient(90deg, rgb(62, 139, 255), rgb(0, 194, 255))",
            }}
          />
          <div style={{ display: "flex", fontSize: "92px", fontWeight: 700 }}>
            <span style={{ color: "rgb(244, 246, 251)" }}>LabourMarket</span>
            <span style={{ color: "rgb(0, 194, 255)" }}>.ai</span>
          </div>
          <div
            style={{
              fontSize: "34px",
              lineHeight: 1.35,
              maxWidth: "1000px",
              color: "rgb(155, 163, 184)",
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
            borderTop: "1px solid rgba(82, 93, 135, 0.5)",
            paddingTop: "28px",
            fontSize: "24px",
            color: "rgb(134, 144, 168)",
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
    { ...size },
  );
}
