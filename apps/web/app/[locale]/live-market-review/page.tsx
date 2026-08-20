import type { Metadata } from "next";
import { LiveMarketLanding } from "./live-market-page";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "labourmarket.ai",
  robots: { index: false, follow: false },
};

export default async function LiveMarketReviewPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  return <LiveMarketLanding params={params} />;
}
