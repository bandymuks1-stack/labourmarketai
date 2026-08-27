import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

/**
 * PREMIUM LANDING EXPERIENCE LAB — isolated internal preview surface.
 *
 * Parallel design track (owner command, 2026-08-27). NOT a product surface:
 *
 *   · never linked from production chrome (no nav, no footer, no sitemap);
 *   · `robots: noindex, nofollow` on every page in the subtree;
 *   · unreachable on the production deployment — the gate below 404s unless
 *     the process is a local `next dev` or a Vercel PREVIEW deployment;
 *   · cannot be selected as the production landing: `app/[locale]/page.tsx`
 *     resolves FOCUS/LIVE from the landing-mode cookie and knows nothing
 *     about this directory.
 *
 * Nothing under `components/design-lab/` is imported by any production
 * surface, so deleting this directory + its three routes removes the whole
 * experiment with no other edit.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  title: "Design lab — internal preview",
};

/** Dev or preview only. A production deployment renders 404. */
function labIsOpen(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.VERCEL_ENV === "preview";
}

export default async function DesignLabLayout({
  children,
  params,
}: {
  readonly children: React.ReactNode;
  readonly params: Promise<{ locale: string }>;
}) {
  if (!labIsOpen()) notFound();
  const { locale } = await params;
  setRequestLocale(locale);
  return <>{children}</>;
}
