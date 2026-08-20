import type { Metadata } from "next";
import { cookies } from "next/headers";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  LANDING_MODE_COOKIE,
  isLandingMode,
  type LandingMode,
} from "@/lib/telemetry/landing-experience";
import { LiveMarketLanding } from "./live-market-review/live-market-page";
import { StableLanding } from "./stable-landing/stable-landing";

/**
 * ONE canonical landing URL, two experiment arms.
 *
 *   LIVE  — the living European labour-market surface (default, and what an
 *           unknown visitor and every crawler receives).
 *   FOCUS — the STABLE BASELINE: the previous production landing recovered
 *           from 7179882, the commit before #1221 removed it.
 *
 * The arms are different component trees with different chrome, so the choice
 * is resolved here, on the server, from a bounded `live | focus` cookie. That
 * keeps the response to ONE landing rather than shipping both and hiding one,
 * and removes the flash a client-side switch would cause.
 *
 * SEO is deliberately unaffected: metadata is built identically for both arms
 * and the canonical stays `/{locale}`. A crawler sends no cookie, so it always
 * renders LIVE — one indexed landing, no cloaking, no duplicate surface.
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
    <StableLanding params={params} />
  ) : (
    <LiveMarketLanding params={params} />
  );
}
