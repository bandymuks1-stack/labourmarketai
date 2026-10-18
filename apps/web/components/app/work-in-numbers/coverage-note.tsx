import type { WorkIntelligenceCoverage } from "@/lib/journal/work-intelligence";

import type { Translate } from "./format";

/**
 * What the reads behind the figures actually covered (SEP-7): a capped
 * entry read makes every figure "from the last N entries", never a total;
 * a capped link read means some entries may read as linked to no skill.
 * Renders nothing when nothing was cut — a note about a limit that did
 * not apply would be noise.
 */
export function CoverageNote({
  coverage,
  t,
}: {
  coverage: WorkIntelligenceCoverage;
  /** Bound to `journal.intelligence`. */
  t: Translate;
}) {
  if (!coverage.truncated && !coverage.linksTruncated) return null;
  return (
    <div
      className="flex flex-col gap-1 rounded-md border border-state-warning/40 bg-state-warning/5 px-3 py-2"
      data-testid="wi-coverage"
      data-entries-read={coverage.entriesRead}
      data-truncated={coverage.truncated}
      data-links-truncated={coverage.linksTruncated}
    >
      {coverage.truncated ? (
        <p className="text-support leading-relaxed text-text-primary" data-testid="wi-coverage-truncated">
          {t("coverageTruncated", { count: coverage.entriesRead })}
        </p>
      ) : null}
      {coverage.linksTruncated ? (
        <p className="text-support leading-relaxed text-text-primary" data-testid="wi-coverage-links-truncated">
          {t("numbers.linksTruncated")}
        </p>
      ) : null}
    </div>
  );
}
