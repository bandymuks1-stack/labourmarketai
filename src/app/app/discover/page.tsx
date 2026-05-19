import type { Metadata } from "next";
import { DiscoverCard } from "@/components/discover/DiscoverCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { SAMPLE_NOTICE, sampleProfiles } from "@/lib/sample-data";

export const metadata: Metadata = { title: "Discover" };

export default function DiscoverPage() {
  return (
    <>
      <PageHeader
        eyebrow="The draft floor"
        title="Discover"
        lead="Scout the market. Every person here is the same canonical player card you build once — no separate discover profile."
        actions={<span className="chip">{SAMPLE_NOTICE}</span>}
      />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {sampleProfiles.map((profile) => (
          <DiscoverCard key={profile.id} profile={profile} />
        ))}
      </div>
    </>
  );
}
