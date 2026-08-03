import { getTranslations } from "next-intl/server";
import { ConstellationBg } from "@/components/decor/constellation-bg";
import { WorkerPlayerCard } from "@/components/app/worker-player-card";
import { buildPlayerCardLabels } from "@/lib/player-card/labels";
import { buildSampleWorkerPlayerCard } from "@/lib/player-card/sample-card";

/**
 * "The Player Card" — the landing shows THE REAL CARD (owner audit §3.7 +
 * addendum §4 "landing negali meluoti"): the SAME canonical `WorkerPlayerCard`
 * component the product renders inside the journal, the profile and the
 * conversation. No medal tiers, no universal human score, no empty frames —
 * those belonged to the retired FUT-style concept cards.
 *
 * The data is ONE clearly-marked sample profile (a cook — deliberately not
 * construction, §3.3), built by the shared `buildSampleWorkerPlayerCard`
 * (S3: the SAME sample `/for-workers` shows — one persona, one card system):
 * every number is the kind of explainable fact the real card carries
 * (declared skills, journal-supported skills, real confirmations,
 * availability), and the visible line under the card says it is a sample and
 * that a real card grows from real records.
 */
export async function PlayerCardShowcase() {
  const t = await getTranslations("playercards");
  const now = new Date();

  // A fixed, honest sample — explainable dimensions only (§3.7). The dates
  // are static so the render is deterministic (no fabricated "just now").
  const sampleCard = buildSampleWorkerPlayerCard({
    sampleName: t("sample.name"),
    sampleOrganization: t("sample.organization"),
    now,
  });
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
