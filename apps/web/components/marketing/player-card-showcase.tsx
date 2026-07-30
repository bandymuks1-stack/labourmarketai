import { getTranslations } from "next-intl/server";
import { ConstellationBg } from "@/components/decor/constellation-bg";
import { WorkerPlayerCard } from "@/components/app/worker-player-card";
import { buildPlayerCardLabels } from "@/lib/player-card/labels";
import type { WorkerPlayerCard as WorkerPlayerCardData } from "@/lib/player-card/player-card";
import { EVIDENCE_TIMELINE_MONTHS } from "@/lib/player-card/player-card";
import {
  deriveEvidenceTimeline,
  deriveSkillEvidence,
} from "@/lib/player-card/evidence-visuals";

/**
 * "The Player Card" — the landing shows THE REAL CARD (owner audit §3.7 +
 * addendum §4 "landing negali meluoti"): the SAME canonical `WorkerPlayerCard`
 * component the product renders inside the journal, the profile and the
 * conversation. No medal tiers, no universal human score, no empty frames —
 * those belonged to the retired FUT-style concept cards.
 *
 * The data is ONE clearly-marked sample profile (a cook — deliberately not
 * construction, §3.3): every number is the kind of explainable fact the real
 * card carries (declared skills, journal-supported skills, real confirmations,
 * availability), and the visible line under the card says it is a sample and
 * that a real card grows from real records.
 */
/**
 * The sample's own work-journal rhythm: how many entries fall in each of the
 * trailing months, newest month first. Real zeros included — the landing chart
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

export async function PlayerCardShowcase() {
  const t = await getTranslations("playercards");
  const now = new Date();

  // A fixed, honest sample — explainable dimensions only (§3.7). The dates
  // are static so the render is deterministic (no fabricated "just now").
  const sampleCard: WorkerPlayerCardData = {
    displayName: t("sample.name"),
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
    // §5.2 on the landing too — the SAME fields the signed-in card shows.
    locationCountry: "LT",
    documents: { total: 3, expiring: 0 },
    latestEvidenceAt: "2026-07-21T09:00:00Z",
    workHistory: [
      {
        id: "sample-engagement",
        title: null,
        organizationName: t("sample.organization"),
        relationshipSlug: "employee",
        startedAt: "2025-03-01",
        endedAt: null,
        current: true,
        countryCode: "LT",
      },
    ],
    /**
     * §5.2 + addendum §4 — the landing may NOT have a different or prettier
     * card than the product. Both series go through the SAME pure derivers the
     * signed-in card uses, from the same shape of input rows, so the landing
     * physically cannot render a separately-styled marketing chart. The two
     * declared-but-unproven skills are deliberate: the honest gap a real card
     * shows must be visible here too.
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
  const labels = await buildPlayerCardLabels(sampleCard);

  return (
    <section className="relative mt-16 overflow-hidden">
      <ConstellationBg />
      <div className="relative mx-auto max-w-container px-6 sm:px-12">
        <p className="inline-flex items-center gap-2 rounded-sm border border-ink-500 px-3 py-1 font-mono text-meta uppercase tracking-label text-text-secondary">
          <span className="live-dot" aria-hidden />
          {t("eyebrow")}
        </p>
        <h2 className="mt-5 font-display text-4xl font-bold leading-[1.06] tracking-tightest sm:text-5xl">
          {t("headline.line1")}
          <br />
          <span className="text-gradient-accent">{t("headline.line2")}</span>
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-text-secondary">
          {t("subcopy")}
        </p>

        {/* THE canonical card, one instance — what a signed-in worker really
            sees, with a visibly-sample dataset. */}
        <div className="mx-auto mt-8 max-w-2xl" data-testid="playercards-canonical-card">
          <WorkerPlayerCard
            card={sampleCard}
            labels={labels}
            thermometer={null}
            avatarUrl={null}
          />
        </div>

        {/* §18 honesty line: the sample is said out loud, in words. */}
        <p
          className="mt-4 text-center font-mono text-meta uppercase tracking-label text-text-muted"
          data-testid="playercards-concept-note"
        >
          {t("conceptNote")}
        </p>
      </div>
    </section>
  );
}
