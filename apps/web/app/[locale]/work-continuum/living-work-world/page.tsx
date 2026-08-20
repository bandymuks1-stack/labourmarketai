import { LivingWorkWorld } from "./living-work-world";
import { loadPrototypePage, prototypeMetadata } from "../_prototype-page";

export const dynamic = "force-dynamic";
export const metadata = prototypeMetadata;

export default async function LivingWorkWorldPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const props = await loadPrototypePage(params, searchParams);
  return <LivingWorkWorld {...props} />;
}
