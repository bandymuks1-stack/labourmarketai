import type { Metadata } from "next";
import { connection } from "next/server";
import { setRequestLocale } from "next-intl/server";
import { resolveActiveLocale } from "@/lib/seo/metadata";
import { readLivingPrototypeMarket } from "./_prototype-data";

export const prototypeMetadata: Metadata = {
  title: "Living Labour Market — owner review",
  description:
    "Isolated coded visual directions for labourmarket.ai's living labour market.",
  robots: { index: false, follow: false },
};

export async function loadPrototypePage(
  params: Promise<{ locale: string }>,
  searchParams: Promise<Record<string, string | string[] | undefined>>,
) {
  await connection();
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const activeLocale = resolveActiveLocale(locale);
  setRequestLocale(activeLocale);
  return {
    locale: activeLocale,
    worldOnly: query.view === "world-only",
    market: await readLivingPrototypeMarket(),
  };
}
