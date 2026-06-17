import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { MarketMapShell } from "@/components/app/market-map-shell";
import { MarketMapCapture } from "@/components/app/market-map-capture";
import {
  listOwnPreferredLocations,
  getOwnLoginConsent,
  listOwnDemandLocations,
} from "@/lib/market-map/capture";
import { FeatureNote } from "@/components/app/feature-note";

/**
 * Live market map — FOUNDATION route (v1). Authenticated (under /dashboard,
 * which the middleware gates; the explicit getUser check is belt-and-suspenders
 * and mirrors the other dashboard rooms). Renders the honest map shell — no
 * fake markers, no external map API / key, no DB geo reads yet (none exist).
 */
export default async function MarketMapPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const tNote = await getTranslations("featureNotes");
  // Owner-scoped current state for the capture forms (RLS — caller's own rows).
  const [preferred, login, demand] = await Promise.all([
    listOwnPreferredLocations(),
    getOwnLoginConsent(),
    listOwnDemandLocations(),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <FeatureNote testId="feature-note-market-map">
        {tNote("marketplaceMap")}
      </FeatureNote>
      <MarketMapShell />
      <MarketMapCapture preferred={preferred} login={login} demand={demand} />
    </div>
  );
}
