import type { Metadata } from "next";
import { cookies } from "next/headers";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  LANDING_MODE_COOKIE,
  isLandingMode,
  type LandingMode,
} from "@/lib/telemetry/landing-experience";
import { LiveMarketLanding } from "./live-market-review/live-market-page";
import { FocusLanding } from "./focus-landing/focus-landing";

/**
 * ONE canonical landing URL, two alternative landing experiences.
 *
 *   LIVE  — the living European labour-market surface (default, and what an
 *           unknown visitor and every crawler receives).
 *   FOCUS — the previous production landing, restored from 7179882, the
 *           commit immediately before #1221 removed it.
 *
 * They are different component trees with different chrome, so the choice is
 * resolved HERE, on the server, from a bounded `live | focus` cookie. That
 * keeps the response to ONE landing rather than shipping both and hiding one,
 * and removes the flash a client-side swap would cause.
 *
 * SEO is deliberately unaffected: metadata is built identically for both arms
 * and the canonical stays `/{locale}`. A crawler sends no cookie, so it always
 * renders LIVE — exactly one indexed landing, no cloaking, no second surface.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: "" });
}

async function resolveLandingMode(): Promise<LandingMode> {
  const store = await cookies();
  const value = store.get(LANDING_MODE_COOKIE)?.value;
  return isLandingMode(value) ? value : "live";
}

export default async function LandingPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const mode = await resolveLandingMode();
  return mode === "focus" ? (
    <FocusLanding params={params} />
  ) : (
    <LiveMarketLanding params={params} />
  );
}
