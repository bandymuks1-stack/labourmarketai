import { BenefitCards } from "@/components/marketing/benefit-cards";

/**
 * THE FIVE PLAIN ANSWERS every audience page gives (owner P0 2026-11-13):
 * who the platform is for, how to start, what is free, which paid services
 * can really be ordered, and what is not available yet.
 *
 * NO NEW VISUAL PATTERN. This is the feature-grid section every audience page
 * already has (`RoleEnrichment`, block c): the same heading scale over the
 * same shared `BenefitCards`. It only fixes the ORDER and the PRESENCE of the
 * answers, so no audience page can leave one out.
 *
 * The copy lives in `pages.<audience>.facts` and states only what works
 * today; a guard (`lib/guards/audience-pages.test.ts`) checks that every
 * audience page renders it, in every catalog, and that it names no price.
 */
export type AudienceFactsCopy = {
  headline: string;
  items: { title: string; body: string }[];
};

export function AudienceFacts({ copy }: { copy: AudienceFactsCopy }) {
  return (
    <section
      data-testid="audience-facts"
      className="relative mx-auto max-w-container px-6 pb-16 pt-8 sm:px-12"
    >
      <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
        {copy.headline}
      </h2>
      <div className="mt-8">
        <BenefitCards nested items={copy.items} />
      </div>
    </section>
  );
}
