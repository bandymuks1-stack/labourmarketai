"use client";

import { useTranslations } from "next-intl";
import type { ExperienceCountsState } from "@/lib/trust/experience-records";

/**
 * W6 slice 3B — the ONE count-only reputation surface.
 *
 * Renders EXACTLY: published positive count, published negative count, and a
 * disputed marker. Never a score, never a percentage, never stars, never a
 * `confidence_bin`, never evidence or skill verification. "Not enough
 * published experiences yet" renders as ABSENCE — never as `0 reputation`.
 *
 * When negatives outnumber positives the block carries a plain caution line
 * (owner rule 4): a signal to look closer, never a verdict or a block.
 *
 * A CLIENT component, and deliberately so: after W6 slice 3B's route removal
 * the counts render inside the `experiences` Workspace Result, which is a
 * client tree. Rather than grow a second counts renderer for that tree — the
 * duplication this file exists to prevent — the ONE renderer moved. It stays
 * purely presentational: `counts` arrives already read, and nothing here
 * touches supabase, so the server tree can hand it a value just as before.
 */
export function ExperienceCountsBlock({
  counts,
  testId = "experience-counts",
}: {
  counts: ExperienceCountsState;
  testId?: string;
}) {
  const t = useTranslations("experience");

  if (counts.state === "needs_migration" || counts.state === "error") {
    // Product-level unavailability. No SQL text, no migration jargon.
    return (
      <section
        className="rounded-md border border-border-subtle bg-surface-1/40 p-3"
        data-testid={`${testId}-unavailable`}
        data-state={counts.state}
        role="status"
      >
        <p className="text-meta leading-relaxed text-text-secondary">
          {t("counts.unavailable")}
        </p>
      </section>
    );
  }

  if (counts.state === "none") {
    return (
      <section
        className="rounded-md border border-border-subtle bg-surface-1/40 p-3"
        data-testid={`${testId}-empty`}
      >
        <p className="text-meta leading-relaxed text-text-secondary">
          {t("counts.notEnough")}
        </p>
      </section>
    );
  }

  const { positive, negative, disputed } = counts.counts;
  const cautioned = negative > positive;

  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-1/40 p-3"
      data-testid={testId}
      data-positive={positive}
      data-negative={negative}
      data-disputed={disputed}
    >
      <span className="font-mono text-meta uppercase tracking-label text-text-muted">
        {t("counts.title")}
      </span>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <li className="text-basis text-text-primary" data-testid={`${testId}-positive`}>
          <span className="font-mono tabular-nums">{positive}</span>{" "}
          <span className="text-text-secondary">{t("counts.positive")}</span>
        </li>
        <li className="text-basis text-text-primary" data-testid={`${testId}-negative`}>
          <span className="font-mono tabular-nums">{negative}</span>{" "}
          <span className="text-text-secondary">{t("counts.negative")}</span>
        </li>
        {disputed > 0 ? (
          <li
            className="text-meta leading-relaxed text-state-warning"
            data-testid={`${testId}-disputed`}
          >
            {t("counts.disputed", { count: disputed })}
          </li>
        ) : null}
      </ul>
      {cautioned ? (
        <p
          className="text-meta leading-relaxed text-state-warning"
          data-testid={`${testId}-caution`}
        >
          {t("counts.caution")}
        </p>
      ) : null}
      {/* Said in words, every time: these are subjective experiences, not a
          professional-ability fact and not a platform verdict. */}
      <p className="text-meta leading-relaxed text-text-muted" data-testid={`${testId}-meaning`}>
        {t("counts.meaning")}
      </p>
    </section>
  );
}
