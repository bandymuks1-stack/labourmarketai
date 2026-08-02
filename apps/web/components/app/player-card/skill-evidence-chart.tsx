import type {
  SkillEvidenceBar,
  SkillEvidenceTier,
} from "@/lib/player-card/evidence-visuals";
import { Link } from "@/lib/i18n/navigation";

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
 * Bars are CSS widths on a FIXED scale, so they reflow at every viewport with
 * no distortion and no library.
 *
 * WHY A FIXED SCALE AND NOT THE MAXIMUM (owner command §4.4).
 * These bars used to be normalized to the person's own busiest skill
 * (`entries / max`). That is a relative chart wearing the clothes of an
 * absolute one: the top skill ALWAYS rendered as a completely full bar, so a
 * worker with 3 records on their best skill saw the same "full" bar as one with
 * 300. A full bar reads as "100 %", and next to the word "skill" that reads as
 * mastery — a competence score this platform must never fabricate.
 *
 * The scale is now absolute: `EVIDENCE_SCALE_MAX` records fill the bar, for
 * everyone. A short bar now honestly means "not much recorded yet", the same
 * length means the same quantity on every person's card, and the exact count is
 * always printed beside it. `labels.scaleNote` states outright that this is a
 * record count and not a skill score.
 */

/**
 * Records that fill the bar. A deliberate product constant, not a tuning knob:
 * it is the point past which "this person really does this work regularly" is
 * already established, so pushing further should not keep growing the bar.
 * Counts above it print in full beside a full bar — the number is never hidden.
 */
export const EVIDENCE_SCALE_MAX = 20;

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
  /**
   * REQUIRED (owner command §4.4): states in words that the bar is a count of
   * records, not a score for the skill. The visual alone cannot carry this —
   * any bar next to a skill name invites being read as a rating.
   */
  readonly scaleNote: string;
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
  linkBarsToJournal = false,
}: {
  skills: readonly SkillEvidenceBar[];
  labels: SkillEvidenceLabels;
  /**
   * W5 slice 3 — evidence drill-down. When set (the worker's OWN card only),
   * a bar with at least one linked record links to the journal filtered to
   * that skill, so the count is inspectable, not just stated. Bars with no
   * records stay plain — there is nothing to drill into, and a dead link
   * would dress the honest zero up as a feature.
   */
  linkBarsToJournal?: boolean;
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

      {/* §4.4 — said before the bars are read, not buried under them. */}
      <p
        className="text-meta leading-relaxed text-text-secondary"
        data-testid="player-card-skill-scale-note"
      >
        {labels.scaleNote}
      </p>

      <ul className="flex flex-col gap-2" aria-label={labels.ariaLabel}>
        {skills.map((s, i) => {
          // ABSOLUTE, not relative: the same width means the same number of
          // records on every person's card. Counts past the scale clamp to a
          // full bar and still print their exact value beside it.
          // A real zero keeps a hairline so the row is readable as "declared,
          // nothing behind it yet".
          const pct =
            s.entries > 0
              ? Math.min(s.entries / EVIDENCE_SCALE_MAX, 1) * 100
              : 0;
          const row = (
            <>
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
            </>
          );
          const drilldown = linkBarsToJournal && s.entries > 0;
          return (
            <li
              key={s.slug}
              data-skill={s.slug}
              data-entries={s.entries}
              data-tier={s.tier}
            >
              {drilldown ? (
                <Link
                  href={`/dashboard/journal?skill=${encodeURIComponent(s.slug)}`}
                  className="flex min-h-[2.75rem] flex-col justify-center gap-1 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue [&:hover_span:first-child]:underline"
                  data-testid="player-card-skill-drilldown"
                >
                  {row}
                </Link>
              ) : (
                <div className="flex flex-col gap-1">{row}</div>
              )}
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
