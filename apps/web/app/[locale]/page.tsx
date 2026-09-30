import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { FocusLanding } from "./focus-landing/focus-landing";

/**
 * ONE canonical landing URL, ONE landing experience (owner decision
 * 2026-09-30).
 *
 * The landing used to offer two alternative experiences — FOCUS for every
 * visitor, and an optional LIVE living-market scene behind a cookie, a
 * switcher and a middleware rewrite. The owner withdrew the LIVE
 * presentation until LabourMarket.ai has enough real market signals to show
 * a living market honestly; the idea and its shared data stay.
 *
 * STATIC AND CDN-CACHED (P0 entry-point fix, 2026-08-31). The page reads no
 * per-request state, so a fresh visitor's first paint never waits on a
 * serverless function being warm. `revalidate = 300` matches the market
 * snapshot's own `unstable_cache` freshness window (owner command §9/§12:
 * one market truth, one freshness window) — the page can never be staler
 * than the data layer already allows.
 *
 * SEO: one indexed landing, no cloaking; the canonical stays `/{locale}`.
 */
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: "" });
}

export default async function LandingPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  return <FocusLanding params={params} />;
}
