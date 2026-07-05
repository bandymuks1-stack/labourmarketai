import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { TextFirstPreview } from "./preview";
import { FeatureAvailabilityGrid } from "@/components/app/feature-availability-grid";
import { RoleCatalogueGrid } from "@/components/app/role-catalogue-card";
import { getVisibleRoleOptions } from "@/lib/config/roles";
import { designGalleryEnabled } from "@/lib/env";

/**
 * Dev-only mobile preview for the text-first composers + suggestion list.
 * Gated by `designGalleryEnabled` (same gate as /[locale]/design) — never
 * renders in a production build (PR15 hardening). Exists so the team can
 * capture mobile screenshots of the new flow without authenticating
 * against the real Supabase project. NOT linked from nav.
 */
export default async function TextFirstDesignPreview({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!designGalleryEnabled) {
    notFound();
  }
  // The capture script targets this page; render the FeatureAvailabilityGrid
  // here (server component) below the client preview so mobile evidence
  // shows the new config-driven dashboard surface alongside the existing
  // text-first composers.
  return (
    <>
      <TextFirstPreview />
      <div
        data-testid="preview-feature-grid"
        className="mx-auto max-w-container px-4 pb-6"
      >
        <FeatureAvailabilityGrid
          excludeKeys={["profile_text_first", "journal_text_first"]}
        />
      </div>
      <div
        data-testid="preview-role-grid"
        className="mx-auto max-w-container px-4 pb-10"
      >
        <RoleCatalogueGrid roles={getVisibleRoleOptions()} />
      </div>
    </>
  );
}
