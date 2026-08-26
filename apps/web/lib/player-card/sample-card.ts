import type { WorkerPlayerCard } from "@/lib/player-card/player-card";
import { EVIDENCE_TIMELINE_MONTHS } from "@/lib/player-card/player-card";
import {
  deriveEvidenceTimeline,
  deriveSkillEvidence,
} from "@/lib/player-card/evidence-visuals";

/**
 * THE one public sample Player Card (S3 player-card honesty).
 *
 * Every public surface that demonstrates the worker card (the landing
 * `PlayerCardShowcase` and `/for-workers`) builds its sample from THIS module,
 * so there is exactly one sample persona and it can never drift into a
 * second, prettier marketing card. The rules carried over from the landing
 * showcase (owner audit §3.7 + addendum §4 "landing negali meluoti"):
 *
 *  - the sample feeds the SAME canonical `WorkerPlayerCard` component the
 *    product renders inside the journal, the profile and the conversation —
 *    no medal tiers, no universal human score, no 0–99 OVR, no empty frames;
 *  - every number is the kind of explainable fact the real card carries
 *    (declared skills, journal-supported skills, real confirmations,
 *    availability) — never a rating;
 *  - both chart series go through the SAME pure derivers the signed-in card
 *    uses, from the same shape of input rows, so a public page physically
 *    cannot render a separately-styled marketing chart;
 *  - the persona is a cook — deliberately not construction (§3.3) — and the
 *    caller must keep a visible line saying it is a sample, not a real person.
 */

/**
 * The sample's own work-journal rhythm: how many entries fall in each of the
 * trailing months, newest month first. Real zeros included — the public chart
 * must show the same honest gaps a real card shows, not a smooth marketing
 * curve. 23 entries in total, matching `evidenceEntries` below.
 */
const SAMPLE_MONTHLY_ENTRIES = [3, 4, 2, 0, 3, 1, 2, 0, 3, 2, 2, 1] as const;

/** Timestamps for the sample series, built relative to `now` so the chart's
 *  month axis stays meaningful. Deterministic within a render. */
function sampleEntryTimestamps(now: Date): string[] {
  const out: string[] = [];
  SAMPLE_MONTHLY_ENTRIES.forEach((count, monthsAgo) => {
    for (let i = 0; i < count; i += 1) {
      out.push(
        new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 2 + i * 3),
        ).toISOString(),
      );
    }
  });
  return out;
}

/** Build the fixed, honest sample card. The display strings a locale owns
 *  (persona name, organization) come in resolved — the caller reads them from
 *  the `playercards` namespace so the copy stays in the i18n catalogs. */
export function buildSampleWorkerPlayerCard(opts: {
  sampleName: string;
  sampleOrganization: string;
  now: Date;
}): WorkerPlayerCard {
  const { sampleName, sampleOrganization, now } = opts;
  return {
    displayName: sampleName,
    skillsDeclared: 9,
    journalSupportedSkills: 4,
    candidateSkills: 1,
    evidenceEntries: 23,
    attentionInstructions: 0,
    workCardConfirmed: true,
    verifiedSkills: [
      { slug: "cooking", iconSlug: null },
      { slug: "kitchen-help", iconSlug: null },
    ],
    managerConfirmations: 7,
    availabilityStatus: "available",
    availableFrom: null,
    professionSlug: "cook",
    // §5.2 on public surfaces too — the SAME fields the signed-in card shows.
    locationCountry: "LT",
    documents: { total: 3, expiring: 0 },
    latestEvidenceAt: "2026-07-21T09:00:00Z",
    workHistory: [
      {
        id: "sample-engagement",
        title: null,
        organizationName: sampleOrganization,
        relationshipSlug: "employee",
        kind: "employment",
        startedAt: "2025-03-01",
        endedAt: null,
        current: true,
        countryCode: "LT",
      },
    ],
    /**
     * §5.2 + addendum §4 — a public page may NOT have a different or prettier
     * card than the product. Both series go through the SAME pure derivers the
     * signed-in card uses. The two declared-but-unproven skills are deliberate:
     * the honest gap a real card shows must be visible here too.
     */
    evidenceTimeline: deriveEvidenceTimeline(
      sampleEntryTimestamps(now),
      now,
      EVIDENCE_TIMELINE_MONTHS,
    ),
    skillEvidence: deriveSkillEvidence(
      [
        ...Array.from({ length: 9 }, () => ({ slug: "cooking" })),
        ...Array.from({ length: 6 }, () => ({ slug: "kitchen-help" })),
        ...Array.from({ length: 4 }, () => ({ slug: "dishwashing" })),
      ],
      [
        { slug: "cooking", verified: true, source: "work_journal" },
        { slug: "kitchen-help", verified: true, source: "work_journal" },
        { slug: "dishwashing", verified: false, source: "work_journal" },
        { slug: "cleaning-services", verified: false, source: "self" },
        { slug: "customer-service", verified: false, source: "self" },
      ],
    ),
  };
}
