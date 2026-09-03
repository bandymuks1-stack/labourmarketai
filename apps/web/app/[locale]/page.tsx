import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/lib/i18n/routing";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { FocusLanding } from "./focus-landing/focus-landing";

/**
 * P2-1 (2026-09-03): a request like `/foo.xml` or `/llms-old.txt` skips the
 * i18n middleware (its matcher excludes dotted paths) and lands HERE with
 * `locale = "foo.xml"`. The layout rejects unknown locales with notFound(),
 * but Next renders layout and page CONCURRENTLY, so the landing had already
 * thrown `RangeError: Incorrect locale information provided` from
 * Intl.NumberFormat before the layout's 404 could win — a 500 for every
 * unknown apex path with an extension. The page must reject the locale
 * itself, before any locale-dependent work, in both entry points.
 */
function assertKnownLocale(locale: string): void {
  if (!hasLocale(routing.locales, locale)) notFound();
}

/**
 * ONE canonical landing URL, two alternative landing experiences.
 *
 *   FOCUS — the previous production landing, restored from 7179882. The
 *           PRIMARY landing: the stable, clear explanation of the product,
 *           and what every visitor without an explicit choice receives.
 *   LIVE  — the living European labour-market surface. OPTIONAL: it opens
 *           only after the visitor explicitly selects it.
 *
 * DEFAULT = FOCUS (owner command 2026-08-22 §2). No cookie means no explicit
 * choice, and no explicit choice means FOCUS. Nothing else is consulted — no
 * device class, no locale, no geography, no user agent — so no heuristic can
 * ever silently land a fresh visitor in LIVE.
 *
 * WHERE THE ARM IS RESOLVED — P0 entry-point fix, 2026-08-31. This route used
 * to read the mode cookie itself (forced dynamic rendering), which made EVERY
 * fresh visit invoke a serverless function: `cache-control: no-store`, zero
 * CDN caching, and after a deploy the first visitors paid the full cold-start +
 * SSR chain (measured 7.6 s of serial document time on a cold hit; the owner
 * observed ~60 s inside the post-deploy window). The arm is still resolved
 * on the SERVER and only one tree is shipped — but in MIDDLEWARE now: a
 * visitor whose cookie records the explicit LIVE choice is rewritten to the
 * cookie-gated LIVE route before rendering, and everyone else gets THIS
 * page, which is statically generated and CDN-cached. A fresh visitor's
 * first paint no longer depends on a function being warm.
 *
 * `revalidate = 300` matches the market snapshot's own `unstable_cache`
 * freshness window (owner command §9/§12: one market truth, one freshness
 * window) — the static page can never be staler than the data layer already
 * allowed the dynamic one to be.
 *
 * SEO is unaffected: a crawler sends no cookie, so it gets this FOCUS page —
 * one indexed landing, no cloaking, and the canonical stays `/{locale}`.
 */
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  assertKnownLocale(locale);
  return buildPageMetadata({ locale, path: "" });
}

export default async function LandingPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  assertKnownLocale(locale);
  return <FocusLanding params={params} />;
}
