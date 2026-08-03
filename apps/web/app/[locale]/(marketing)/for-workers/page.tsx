import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPageMetadataFor } from "@/lib/seo/metadata";
import { BenefitCards } from "@/components/marketing/benefit-cards";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadataFor("workers", locale, "/for-workers");
}
import { PageHero } from "@/components/marketing/page-hero";
import { RoleEnrichment } from "@/components/marketing/role-enrichment";
import { ExamplePreviewFrame } from "@/components/marketing/example-preview-frame";
import { WorkerPlayerCard } from "@/components/app/worker-player-card";
import { buildPlayerCardLabels } from "@/lib/player-card/labels";
import { buildSampleWorkerPlayerCard } from "@/lib/player-card/sample-card";

export default async function ForWorkersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.workers");
  const benefits = t.raw("benefits") as { title: string; body: string }[];

  /**
   * S3 player-card honesty: the public worker page shows THE REAL CARD — the
   * SAME canonical `WorkerPlayerCard` the product renders in the journal and
   * the profile, fed by the ONE shared sample persona the landing showcase
   * uses. The retired FUT-style concept card (OVR ring, gold/silver/bronze
   * tiers, 0–99 stat bars) may never come back to a public surface.
   */
  const tCards = await getTranslations("playercards");
  const sampleCard = buildSampleWorkerPlayerCard({
    sampleName: tCards("sample.name"),
    sampleOrganization: tCards("sample.organization"),
    now: new Date(),
  });
  const cardLabels = await buildPlayerCardLabels(sampleCard);

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        accent={t("titleAccent")}
        subcopy={t("subcopy")}
        ctaKind="signup"
        ctaLabel={t("cta")}
        ctaSource="workers_hero"
      />
      <BenefitCards items={benefits} />
      <RoleEnrichment
        root="workers"
        previewKey="profile"
        preview={
          <ExamplePreviewFrame>
            <div
              className="w-full max-w-2xl text-left"
              data-testid="playercards-canonical-card"
            >
              <WorkerPlayerCard
                card={sampleCard}
                labels={cardLabels}
                thermometer={null}
                avatarUrl={null}
              />
            </div>
          </ExamplePreviewFrame>
        }
        ctaSource="workers_cta"
        ctaKind="signup"
      />
    </>
  );
}
