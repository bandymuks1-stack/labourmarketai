import type {
  SkillEvidenceBar,
  SkillEvidenceTier,
} from "@/lib/player-card/evidence-visuals";

/**
 * §5.2 SKILL EVIDENCE STRENGTH + EVIDENCE SOURCES — how much of the person's
 * own recorded work backs each skill, and where that backing comes from.
 *
 * This is the audit's "įgūdžių projekcijos ir įrodymų ryšiai": the bar length
 * is a COUNT of the worker's own journal entries linked to that skill, and the
 * tier says who stands behind it. It is deliberately NOT a rating: a skill with
 * no entries yet renders at the floor with the words "no records yet", because
 * the missing evidence is the useful signal, not something to hide.
 *
 * Bars are CSS widths (percentages of the real maximum), so they reflow at
 * every viewport with no distortion and no library.
 */

export interface SkillEvidenceLabels {
  readonly title: string;
  readonly hint: string;
  readonly empty: string;
  /** Localized skill names, index-aligned with `skills`. */
  readonly skillNames: readonly string[];
  /** "{count} records" per bar, index-aligned with `skills`. */
  readonly entryLabels: readonly string[];
  /** Shown instead of a count when a skill has no linked entries. */
  readonly noEvidence: string;
  readonly legendTitle: string;
  readonly tierLabels: Readonly<Record<SkillEvidenceTier, string>>;
  readonly ariaLabel: string;
}

/** Tier → token. Three visually distinct rungs, and none of them is gold:
 *  gold stays the reserved trust accent (DESIGN_SOUL §1), never a tier. */
const TIER_BAR: Record<SkillEvidenceTier, string> = {
  verified: "bg-brand-cyan",
  journal: "bg-brand-blue",
  declared: "bg-ink-500",
};
const TIER_DOT: Record<SkillEvidenceTier, string> = {
  verified: "bg-brand-cyan",
  journal: "bg-brand-blue",
  declared: "bg-ink-500",
};

export function SkillEvidenceChart({
  skills,
  labels,
}: {
  skills: readonly SkillEvidenceBar[];
  labels: SkillEvidenceLabels;
}) {
  if (skills.length === 0) {
    return (
      <section
        className="flex flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-800/40 p-3"
        data-testid="player-card-skill-chart"
        data-chart-state="empty"
      >
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {labels.title}
        </span>
        <p className="text-meta leading-relaxed text-text-secondary">
          {labels.empty}
        </p>
      </section>
    );
  }

  const max = skills.reduce((m, s) => (s.entries > m ? s.entries : m), 0);
  // Tiers that actually occur — the legend explains what is on screen, and
  // never advertises a rung this person has not reached.
  const tiersPresent = (["verified", "journal", "declared"] as const).filter(
    (t) => skills.some((s) => s.tier === t),
  );

  return (
    <section
      className="flex flex-col gap-2.5 rounded-md border border-ink-600 bg-ink-800/40 p-3"
      data-testid="player-card-skill-chart"
      data-chart-state="live"
      data-chart-bars={skills.length}
    >
      <span className="font-mono text-meta uppercase tracking-label text-text-muted">
        {labels.title}
      </span>

      <ul className="flex flex-col gap-2" aria-label={labels.ariaLabel}>
        {skills.map((s, i) => {
          // A real zero keeps a hairline so the row is readable as "declared,
          // nothing behind it yet" — the width still encodes the real count.
          const pct = max > 0 && s.entries > 0 ? (s.entries / max) * 100 : 0;
          return (
            <li
              key={s.slug}
              className="flex flex-col gap-1"
              data-skill={s.slug}
              data-entries={s.entries}
              data-tier={s.tier}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="line-clamp-2 min-w-0 text-basis text-text-primary">
                  {labels.skillNames[i] ?? s.slug.replace(/-/g, " ")}
                </span>
                <span className="shrink-0 font-mono text-meta uppercase tracking-label text-text-muted">
                  {s.entries > 0
                    ? (labels.entryLabels[i] ?? String(s.entries))
                    : labels.noEvidence}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
                <div
                  className={`h-full rounded-full ${TIER_BAR[s.tier]}`}
                  style={{ width: `${pct === 0 ? 2 : Math.max(4, pct)}%` }}
                  data-testid="player-card-skill-bar"
                />
              </div>
            </li>
          );
        })}
      </ul>

      {/* §5.2 "įrodymų šaltinių paaiškinimas" — what each rung really means. */}
      <div
        className="flex flex-col gap-1 border-t border-ink-600 pt-2"
        data-testid="player-card-evidence-legend"
      >
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {labels.legendTitle}
        </span>
        <ul className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-4">
          {tiersPresent.map((t) => (
            <li
              key={t}
              className="flex items-center gap-2 text-meta leading-relaxed text-text-secondary"
            >
              <span
                aria-hidden
                className={`h-1.5 w-4 shrink-0 rounded-full ${TIER_DOT[t]}`}
              />
              {labels.tierLabels[t]}
            </li>
          ))}
        </ul>
        <p className="text-meta leading-relaxed text-text-muted">{labels.hint}</p>
      </div>
    </section>
  );
}
