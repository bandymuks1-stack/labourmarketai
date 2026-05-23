import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { TextFirstPreview } from "./preview";
import { env } from "@/lib/env";

/**
 * Dev-only mobile preview for the text-first composers + suggestion list.
 * Gated by `NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS` (same gate as /[locale]/design).
 * Exists so the team can capture mobile screenshots of the new flow without
 * authenticating against the real Supabase project. NOT linked from nav.
 */
export default async function TextFirstDesignPreview({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (env.NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS !== "true") {
    notFound();
  }
  return <TextFirstPreview />;
}
