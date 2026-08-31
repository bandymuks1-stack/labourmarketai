import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  LANDING_MODE_COOKIE,
  isLandingMode,
} from "@/lib/telemetry/landing-experience";
import { LiveMarketLanding } from "./live-market-page";

/**
 * The LIVE landing arm's internal route. TWO ways a request arrives here,
 * both requiring the visitor's own recorded LIVE choice:
 *
 *   1. The normal path — middleware REWRITES `/{locale}` here when the
 *      landing-mode cookie says "live". The address bar stays `/{locale}`:
 *      one canonical landing URL, exactly as before the P0 entry-point fix
 *      moved the arm decision out of the root page (which is now static and
 *      CDN-cached for everyone without the cookie).
 *   2. A direct navigation. The cookie gate below preserves the owner rule
 *      ("LIVE opens ONLY after the visitor explicitly selects it"): without
 *      the explicit-choice cookie this redirects to the canonical landing,
 *      byte-for-byte the behaviour this route always had. A crawler sends
 *      no cookie, so nothing new is indexable — and the canonical metadata
 *      points at `/{locale}` regardless.
 *
 * This route stays DYNAMIC (it reads the cookie). That is the deliberate
 * asymmetry of the fix: the default entry point that every fresh visitor and
 * every crawler hits is static and immune to cold starts; the minority who
 * explicitly chose LIVE pay the SSR cost their choice implies.
 */
// The cookie gate MUST run per request. Without this, the build prerenders
// the route with an empty cookie store — freezing the no-choice redirect into
// static HTML, which would bounce even explicit-LIVE visitors back to the
// root and loop against the middleware rewrite.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Canonical stays the ONE landing URL — this route is an arm, not a page.
  return buildPageMetadata({ locale, path: "" });
}

export default async function LiveMarketReviewPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const store = await cookies();
  const mode = store.get(LANDING_MODE_COOKIE)?.value;
  if (!isLandingMode(mode) || mode !== "live") {
    redirect(`/${locale}`);
  }
  return <LiveMarketLanding params={params} />;
}
