import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { LiveMarketLanding } from "./live-market-review/live-market-page";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: "" });
}

export default function LandingPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  return <LiveMarketLanding params={params} />;
}
