import { getTranslations } from "next-intl/server";
import type { ReviewTimelineEvent } from "@/lib/journal/review-status";

/**
 * Evidence Decision Timeline (v1). A compact, honest history of what actually
 * happened to a journal entry, built ONLY from data the app already stores:
 *   - "Record created"   — the entry's own created_at (always real).
 *   - "Waiting for human confirmation" — shown ONLY while there is no human
 *     decision yet (no evidence row). Never claims AI/automatic verification.
 *   - one step per REAL decision row (append-only), in order:
 *       approved          → "Confirmed"      (only with a real approved row)
 *       changes_requested → "Changes requested"
 *       rejected          → "Not confirmed"
 *     each with the confirmer ROLE (manager / owner / external (client)
 *     manager — the only roles the backend can store) and the date.
 *   - a decision's REAL reason note, shown only when one was actually given.
 *
 * No score, no fake step, no fabricated reason, no broad confirmer. The events
 * are derived by `deriveReviewTimeline`; this component only presents them.
 */

const DOT: Record<ReviewTimelineEvent["result"] | "created" | "waiting", string> = {
  created: "bg-text-muted",
  waiting: "bg-amber-500",
  approved: "bg-emerald-500",
  changes_requested: "bg-amber-500",
  rejected: "bg-state-danger",
};

const TEXT: Record<ReviewTimelineEvent["result"], string> = {
  approved: "text-emerald-700",
  changes_requested: "text-amber-700",
  rejected: "text-state-danger",
};

const SUPPORTED_ROLES = ["manager", "owner", "external_manager"] as const;

export async function EvidenceDecisionTimeline({
  createdAt,
  events,
}: {
  createdAt: string;
  events: readonly ReviewTimelineEvent[];
}) {
  const t = await getTranslations("journal");

  return (
    <ol
      className="mt-2 flex flex-col gap-1.5 border-l border-border pl-3"
      data-testid="evidence-decision-timeline"
      aria-label={t("entry.timeline.title")}
    >
      {/* Record created — always real (the entry's own timestamp). */}
      <li className="flex items-start gap-2" data-step="created">
        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${DOT.created}`} aria-hidden />
        <span className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] leading-tight text-text-secondary">
          <span>{t("entry.timeline.created")}</span>
          <span className="font-mono text-[10px] text-text-muted">
            {createdAt.slice(0, 10)}
          </span>
        </span>
      </li>

      {events.length === 0 ? (
        /* No human decision yet — honestly "waiting", never auto-confirmed. */
        <li className="flex items-start gap-2" data-step="waiting">
          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${DOT.waiting}`} aria-hidden />
          <span className="text-[11px] leading-tight text-amber-700">
            {t("entry.timeline.waiting")}
          </span>
        </li>
      ) : (
        events.map((ev, i) => {
          const roleLabel =
            ev.role && (SUPPORTED_ROLES as readonly string[]).includes(ev.role)
              ? t(`entry.confirmerRole.${ev.role}`)
              : null;
          return (
            <li
              key={`${ev.at ?? "na"}-${i}`}
              className="flex items-start gap-2"
              data-step={ev.result}
            >
              <span
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[ev.result]}`}
                aria-hidden
              />
              <span className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] leading-tight">
                  <span className={`font-medium ${TEXT[ev.result]}`}>
                    {t(`entry.timeline.${ev.result}`)}
                  </span>
                  {roleLabel ? (
                    <span className="text-text-muted">
                      · {t("entry.reviewedBy")} {roleLabel}
                    </span>
                  ) : null}
                  {ev.at ? (
                    <span className="font-mono text-[10px] text-text-muted">
                      · {ev.at.slice(0, 10)}
                    </span>
                  ) : null}
                </span>
                {/* Real reason only — rendered solely when a note actually
                    exists; never a default/fabricated reason. */}
                {ev.note ? (
                  <span className="text-[10px] leading-relaxed text-text-secondary break-words">
                    {t("entry.timeline.reasonLabel")}: {ev.note}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })
      )}
    </ol>
  );
}
