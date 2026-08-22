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
 *   FOCUS — the previous production landing, restored from 7179882. The
 *           PRIMARY landing: the stable, clear explanation of the product,
 *           and what every visitor without an explicit choice receives.
 *   LIVE  — the living European labour-market surface. OPTIONAL: it opens
 *           only after the visitor explicitly selects it.
 *
 * DEFAULT = FOCUS (owner command 2026-08-22 §2). The fallback below is the
 * whole mechanism: no cookie means no explicit choice, and no explicit choice
 * means FOCUS. Nothing else is consulted — no device class, no locale, no
 * geography, no user agent — so no heuristic can ever silently land a fresh
 * visitor in LIVE.
 *
 * They are different component trees with different chrome, so the choice is
 * resolved HERE, on the server. That keeps the response to ONE landing rather
 * than shipping both and hiding one, and removes the flash a client-side swap
 * would cause.
 *
 * The cookie is written ONLY by an explicit switcher click (see
 * `persistLandingMode`), so its presence IS the proof of an explicit choice.
 * Ambiguous or absent state therefore resolves to FOCUS, exactly as §3 asks.
 *
 * SEO is deliberately unaffected: metadata is built identically for both arms
 * and the canonical stays `/{locale}`. A crawler sends no cookie, so it gets
 * the same FOCUS landing a fresh human gets — one indexed landing, no
 * cloaking, no second surface, and no factual difference between the two.
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
  return isLandingMode(value) ? value : "focus";
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
