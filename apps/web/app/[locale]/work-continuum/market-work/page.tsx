import { MarketWork } from "./market-work";
import { loadPrototypePage, prototypeMetadata } from "../_prototype-page";

export const dynamic = "force-dynamic";
export const metadata = prototypeMetadata;

export default async function MarketWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const props = await loadPrototypePage(params, searchParams);
  return <MarketWork {...props} />;
}
