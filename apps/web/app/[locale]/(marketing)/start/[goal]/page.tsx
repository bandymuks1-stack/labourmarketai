import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { GoalNavigation } from "@/components/navigation/goal-navigation";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { PUBLIC_INTENT_IDS, isPublicIntentId } from "@/lib/navigation/public-intents";

/**
 * THE URL STATE OF THE GOAL NAVIGATOR (owner-approved structure 2026-11-12).
 *
 * Choosing a goal on the home screen pushes this address without leaving the
 * page; opening it directly (a reload, a shared link, a visitor without
 * JavaScript) renders the SAME navigator with that goal's panel open. It is
 * one component and one experience, not a second page design: the navigator
 * reads the active goal from the path, and closing the panel returns home.
 *
 * Public and static (six goals x the routed locales); an unknown goal is a
 * 404, never an empty view.
 */
export function generateStaticParams() {
  return PUBLIC_INTENT_IDS.map((goal) => ({ goal }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; goal: string }>;
}): Promise<Metadata> {
  const { locale, goal } = await params;
  if (!isPublicIntentId(goal)) return {};
  const t = await getTranslations({ locale, namespace: "siteNav" });
  return buildPageMetadata({
    locale,
    path: `/start/${goal}`,
    title: t(`intents.${goal}.title`),
    description: t(`intents.${goal}.description`),
  });
}

export default async function GoalStartPage({
  params,
}: {
  params: Promise<{ locale: string; goal: string }>;
}) {
  const { locale, goal } = await params;
  if (!isPublicIntentId(goal)) notFound();
  setRequestLocale(locale);
  return (
    <div className="mx-auto w-full max-w-container px-4 py-8 sm:px-12 sm:py-12">
      <GoalNavigation headingLevel="h1" />
    </div>
  );
}
