import type { Metadata } from "next";
import { MatchResult } from "@/components/matches/MatchResult";
import { PageHeader } from "@/components/ui/PageHeader";
import { rankMatches } from "@/lib/matching";
import {
  SAMPLE_NOTICE,
  sampleHiringNeeds,
  sampleProfiles,
} from "@/lib/sample-data";

export const metadata: Metadata = { title: "Matches" };

export default function MatchesPage() {
  const need = sampleHiringNeeds[0];
  const ranked = rankMatches(need, sampleProfiles);
  const byId = new Map(sampleProfiles.map((p) => [p.id, p]));

  return (
    <>
      <PageHeader
        eyebrow="Deterministic fit"
        title="Matches"
        lead={`Ranking for "${need.roleTitle}". Transparent rule-based scoring — skill overlap, availability and location. No model, no hidden ranking.`}
        actions={<span className="chip">{SAMPLE_NOTICE}</span>}
      />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {ranked.map((match) => {
          const profile = byId.get(match.profileId);
          if (!profile) return null;
          return (
            <MatchResult
              key={match.id}
              profile={profile}
              match={match}
            />
          );
        })}
      </div>
    </>
  );
}
