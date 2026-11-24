import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { UNKNOWN_ADDRESS_SEGMENT } from "@/lib/routing/known-first-segments";

import NotFound from "../not-found";

/**
 * Unknown-route catch-all. Without it, an unmatched path renders Next's
 * default 404 OUTSIDE the [locale] layout — no font vars, no colour tokens
 * (the bare-serif page real users would see). Real routes always win: Next
 * matches static and dynamic segments before a catch-all.
 *
 * A thrown `notFound()` becomes Next's `<html id="__next_error__">` shell: no
 * `lang`, no heading, the home page's title, and the branded page only once
 * JavaScript ran (UX-9). So when the middleware already knows no route can answer
 * an address, it rewrites here with status 404 and this renders the same
 * `not-found.tsx` as an ordinary page, without throwing. Anything else that reaches
 * this route still throws, such as `/lt/auth/nera`: it fits a known first segment and
 * a known depth, and only the route tree knows it has no page.
 */
type Params = { readonly params: Promise<{ locale: string; rest: string[] }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, rest } = await params;
  if (rest[0] !== UNKNOWN_ADDRESS_SEGMENT) return {};
  const t = await getTranslations({ locale, namespace: "notFound" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function CatchAllNotFound({ params }: Params) {
  const { locale, rest } = await params;
  if (rest.length !== 1 || rest[0] !== UNKNOWN_ADDRESS_SEGMENT) notFound();
  setRequestLocale(locale);
  return <NotFound />;
}
