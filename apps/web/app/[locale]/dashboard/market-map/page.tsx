import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { MarketMapShell } from "@/components/app/market-map-shell";
import { MarketMapBase } from "@/components/app/market-map-base";
import { LabourMarketWorldMap } from "@/components/app/labour-market-world-map";
import { MarketMapCapture } from "@/components/app/market-map-capture";
import { MarketMapOwnerReadiness } from "@/components/app/market-map-owner-readiness";
import {
  listOwnPreferredLocations,
  getOwnLoginConsent,
  listOwnDemandLocations,
} from "@/lib/market-map/capture";
import {
  getOwnAvailability,
  getOwnCapabilities,
} from "@/lib/market-map/owner-readiness";
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
  const [preferred, login, demand, availability, capabilities] = await Promise.all([
    listOwnPreferredLocations(),
    getOwnLoginConsent(),
    listOwnDemandLocations(),
    getOwnAvailability(),
    getOwnCapabilities(),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <FeatureNote testId="feature-note-market-map">
        {tNote("marketplaceMap")}
      </FeatureNote>
      {/* Labour Market World Map v2 (PR #481) — the original world view is the
          FIRST impression: a map-like canvas of real owner signals (central
          Profile Hub + districts + routes), honest empty/concept states, no fake
          markers/coordinates. */}
      <LabourMarketWorldMap />
      <MarketMapShell />
      <MarketMapOwnerReadiness availability={availability} capabilities={capabilities} />
      <MarketMapCapture preferred={preferred} login={login} demand={demand} />
      {/* Secondary, FUTURE precise-location layer — the real Google Maps base
          renders only when a browser key is configured; otherwise an honest
          config-needed note. Kept BELOW the world view so it never creates a
          broken first impression. */}
      <MarketMapBase />
    </div>
  );
}
