import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { GoalFunctionRail, GoalRail } from "@/components/navigation/goal-rail";
import { ProfessionCarousel } from "@/components/marketing/browse-carousels";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  PUBLIC_INTENTS,
  PUBLIC_INTENT_IDS,
  isPublicIntentId,
} from "@/lib/navigation/public-intents";

/**
 * LEVEL 2 — a goal's own start view (owner concept 2026-11-12).
 *
 * A visitor chose a goal on the first screen; this page shows ONLY that
 * goal's functions, in the same card rail, each card opening the function
 * itself — the start of a function is two actions from the home screen (goal,
 * function). For "looking for work" it also carries level 3: a search field
 * that submits straight to the public board, the profession rail across every
 * sector, and a "view all" link — a catalogue is never the only way in.
 *
 * History is the browser's own: this is a real URL, Back returns to the
 * choice, the "all choices" link says where that is, and the goal rail at the
 * foot marks the active goal and lets a visitor switch without going back.
 *
 * Public and static (six goals × the routed locales). Nothing here needs a
 * session; a function that lives in the signed-in product says so on its card
 * and the visitor signs in only when they open it.
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
  const intent = PUBLIC_INTENTS.find((i) => i.id === goal)!;
  const t = await getTranslations("siteNav");

  return (
    <div className="mx-auto flex w-full max-w-container flex-col gap-10 px-4 py-8 sm:px-12 sm:py-12">
      <header className="flex flex-col gap-3">
        <Link
          href="/"
          data-testid="goal-back"
          className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary motion-reduce:transition-none"
        >
          <ChevronLeft aria-hidden className="h-4 w-4" />
          {t("start.back")}
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl">
          {t(`intents.${intent.id}.title`)}
        </h1>
        <p className="max-w-2xl text-lead text-text-secondary">
          {t(`intents.${intent.id}.description`)}
        </p>
      </header>

      <GoalFunctionRail intent={intent} />

      {intent.id === "work" && (
        <section className="flex min-w-0 flex-col gap-5" data-testid="goal-catalogue">
          {/* A plain GET form to the board — the same URL contract the board
              itself uses, so search works without client JavaScript. */}
          <form action={`/${locale}/jobs`} method="get" className="flex flex-wrap gap-2">
            <label htmlFor="goal-q" className="sr-only">
              {t("start.searchLabel")}
            </label>
            <input
              id="goal-q"
              name="q"
              type="search"
              maxLength={120}
              placeholder={t("start.searchPlaceholder")}
              className="min-h-11 min-w-0 flex-1 basis-48 rounded-control border border-ink-500 bg-ink-900 px-3 text-sm text-text-primary placeholder:text-text-muted"
            />
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-control bg-brand-blue px-5 text-sm font-semibold text-text-on-brand transition-colors hover:bg-brand-champagne motion-reduce:transition-none"
            >
              {t("start.searchSubmit")}
            </button>
          </form>
          <ProfessionCarousel />
          <Link
            href="/jobs"
            data-testid="goal-view-all"
            className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-text-primary underline underline-offset-4 hover:text-brand-blue"
          >
            {t("start.viewAll")}
          </Link>
        </section>
      )}

      <div className="border-t border-ink-600/70 pt-6">
        <GoalRail />
      </div>
    </div>
  );
}
