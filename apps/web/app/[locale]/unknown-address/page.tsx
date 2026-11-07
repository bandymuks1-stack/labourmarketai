import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import NotFound from "../not-found";

/**
 * THE 404 FOR AN ADDRESS NOTHING HERE CAN ANSWER, as complete HTML (UX-9).
 *
 * A thrown `notFound()` becomes Next's `<html id="__next_error__">` shell: no `lang`,
 * no heading, the home page's title, and the branded page only once JavaScript ran.
 * This renders the same `not-found.tsx` as an ordinary page, inside the locale layout.
 * The middleware rewrites here with status 404 (`lib/routing/known-first-segments.ts`).
 *
 * The address itself answers 200 if someone opens it directly, so it is noindex and
 * listed in no sitemap. A deeper unknown path (`/lt/jobs/a/b`) and a page throwing
 * `notFound()` on its own data still take the shell: no list can know those.
 */
export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "notFound" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function UnknownAddressPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <NotFound />;
}
