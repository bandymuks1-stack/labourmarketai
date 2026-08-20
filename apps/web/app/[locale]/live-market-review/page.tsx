import { redirect } from "next/navigation";

export default async function LiveMarketReviewPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}`);
}
