import { getTranslations } from "next-intl/server";

import type { IntelligenceTimelineV1 } from "@/lib/intelligence/timeline";
import { createUtcFormatter } from "@/lib/time/display";

/**
 * Intelligence TIMELINE renderer (Trust Layer v1) — shows how an insight
 * came to exist: source → observation → validation → aggregation → insight
 * → visible. Every stage renders its timestamp, actor, provenance reference
 * and explanation — the four audit facts the timeline contract requires.
 *
 * Pure server renderer over an IntelligenceTimelineV1 that was ALREADY
 * validated by lib/intelligence/timeline.ts (buildTimeline refuses malformed
 * flows) — no computation, no invented stages, no fetching here.
 */

export async function IntelligenceTimeline({
  timeline,
  locale,
}: {
  timeline: IntelligenceTimelineV1;
  locale: string;
}) {
  const t = await getTranslations("intelligence");
  const tc = (code: string) =>
    t(code.replace(/^intelligence\./, "") as never) as string;

  const dateFmt = createUtcFormatter(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const fmtIso = (iso: string): string => {
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? (dateFmt(ms) ?? iso) : iso;
  };

  return (
    <ol
      className="flex flex-col gap-0"
      data-testid="intelligence-timeline"
      aria-label={t("timeline.title")}
    >
      {timeline.stages.map((stage, index) => (
        <li
          key={`${stage.stage}-${index}`}
          className="relative flex gap-3 pb-4 last:pb-0"
          data-timeline-stage={stage.stage}
        >
          {/* Rail + node — pure decoration; the facts are in the text. */}
          <div className="flex flex-col items-center" aria-hidden="true">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full border border-brand-orange bg-brand-orange/30" />
            {index < timeline.stages.length - 1 ? (
              <span className="w-px flex-1 bg-ink-500" />
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-meta uppercase tracking-label text-text-primary">
                {t(`timeline.stage.${stage.stage}`)}
              </span>
              <span className="text-meta text-text-muted">
                {fmtIso(stage.timestampIso)}
              </span>
            </p>
            <p className="text-xs text-text-secondary">
              {tc(stage.explanationCode)}
            </p>
            <p className="flex flex-wrap gap-2 text-meta text-text-muted">
              <span>
                {t("timeline.actorLabel")}: {tc(stage.actorCode)}
              </span>
              <span className="break-all font-mono">
                {t("timeline.provenanceLabel")}: {stage.provenanceRef}
              </span>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
