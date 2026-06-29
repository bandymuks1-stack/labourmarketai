import { setRequestLocale } from "next-intl/server";

import { OfferDemandRecognizer } from "@/components/app/market/offer-demand-recognizer";

/**
 * Offer–Demand recognition entry (v1) — the one place to say "what do you offer or
 * need?". Authenticated (the dashboard layout guards the session). The recognizer
 * is pure and non-persisted: it runs the recognition layer on what the user types
 * and hands off to existing real surfaces. No DB write, no new submission path.
 */
export default async function MarketRecognizePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <OfferDemandRecognizer />
    </div>
  );
}
