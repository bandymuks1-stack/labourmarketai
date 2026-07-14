import { getTranslations } from "next-intl/server";
import { ScrollText } from "lucide-react";

import {
  guidanceByCountry,
  guidanceStatusCounts,
  LT_MASTER_GUIDANCE,
  type GuidanceStatus,
} from "@/lib/documents/lt-master-guidance";

/**
 * Lithuanian-master document guidance surface (CR train WAGON 9, area 17).
 *
 * OWNER RULE (2026-07-05): the guidance content exists in Lithuanian ONLY
 * until the owner approves the LT master. Rendering is therefore
 * locale-split at this component:
 *   - lt  → the full draft registry, grouped by work country, with an
 *           always-visible "informacinio pobūdžio" disclaimer, a review
 *           status badge and the needs-legal-review flag on every item;
 *   - any other locale → ONLY the short "being prepared from the Lithuanian
 *           master version" notice — never a translated body.
 *
 * The review-status summary is honest operator visibility (counts of items
 * per pipeline state) — it never claims approval that has not happened.
 * Help-request CTAs are OUT of scope here (WAGON 10): the closing line is
 * information-only and promises nothing interactive.
 */

const STATUS_TONE: Record<GuidanceStatus, string> = {
  LT_DRAFT_READY: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  OWNER_EDITING: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  OWNER_APPROVED_LT: "border-state-success/40 bg-state-success/5 text-state-success",
  TRANSLATION_READY: "border-brand-cyan/40 bg-brand-cyan/5 text-brand-cyan",
  TRANSLATED: "border-state-success/40 bg-state-success/5 text-state-success",
};

export async function LtDocumentGuidance({ locale }: { locale: string }) {
  const t = await getTranslations("documents.guidance");

  if (locale !== "lt") {
    // Non-LT locales: short pending notice ONLY — no guidance bodies exist
    // in any other language yet (owner correction 2026-07-05).
    return (
      <section
        className="flex flex-col gap-2"
        id="guidance"
        data-testid="documents-guidance"
      >
        <h2 className="inline-flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
          <ScrollText className="h-4 w-4 text-text-muted" aria-hidden />
          {t("title")}
        </h2>
        <p
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="documents-guidance-pending"
        >
          {t("pendingNotice")}
        </p>
      </section>
    );
  }

  const counts = guidanceStatusCounts();
  const grouped = guidanceByCountry();
  const total = LT_MASTER_GUIDANCE.length;
  const awaitingReview = LT_MASTER_GUIDANCE.filter(
    (i) => i.needsLegalReview,
  ).length;

  return (
    <section
      className="flex flex-col gap-4"
      id="guidance"
      data-testid="documents-guidance"
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="inline-flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
          <ScrollText className="h-4 w-4 text-text-muted" aria-hidden />
          {t("title")}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">
          {t("intro")}
        </p>
      </div>

      {/* Always-visible honesty block: informational, not legal advice,
          every item below is a DRAFT awaiting owner/lawyer review. */}
      <p
        className="rounded-md border border-state-warning/40 bg-state-warning/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
        data-testid="documents-guidance-disclaimer"
      >
        {t("draftDisclaimer")}
      </p>

      {/* Honest review-state summary (operator/owner visibility — counts,
          never a fake approval). */}
      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="documents-guidance-status-summary"
      >
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("statusSummary", { total, awaiting: awaitingReview })}
        </span>
        {(Object.keys(counts) as GuidanceStatus[])
          .filter((s) => counts[s] > 0)
          .map((s) => (
            <span
              key={s}
              className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${STATUS_TONE[s]}`}
              data-testid={`guidance-status-count-${s}`}
            >
              {t(`status.${s}` as never)}: {counts[s]}
            </span>
          ))}
      </div>

      {/* Density pass (worker-workspace UX audit v2): the full registry made
          the documents page end in a very long always-open list. Each country
          group is now a collapsed disclosure (heading + item count visible);
          every item stays reachable in one tap, nothing is removed. */}
      {[...grouped.entries()].map(([country, items]) => (
        <details key={country} className="group flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/20">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-mono text-[10px] uppercase tracking-label text-text-muted hover:text-text-primary [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
            {country === "ALL" ? t("groupAll") : country}
            <span className="rounded-full border border-ink-500 px-1.5 py-0.5 tabular-nums">
              {items.length}
            </span>
          </summary>
          <ul className="flex flex-col gap-2 px-3 pb-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="card-border flex flex-col gap-2 p-4"
                data-testid={`guidance-item-${item.id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-text-primary">
                    {item.titleLt}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <span
                      className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${STATUS_TONE[item.status]}`}
                    >
                      {t(`status.${item.status}` as never)}
                    </span>
                    {item.needsLegalReview ? (
                      <span
                        className="rounded-sm border border-state-warning/40 bg-state-warning/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-state-warning"
                        data-testid={`guidance-needs-review-${item.id}`}
                      >
                        {t("needsLegalReview")}
                      </span>
                    ) : null}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-text-secondary">
                  {item.bodyLt}
                </p>
                <p className="text-[11px] leading-relaxed text-text-muted">
                  {t("whoProvides")}: {item.whoUsuallyProvidesLt}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {item.dependsOn.map((d) => (
                    <span
                      key={d}
                      className="rounded-sm border border-ink-500 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-text-muted"
                    >
                      {t(`dimensions.${d}` as never)}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </details>
      ))}

      {/* Information-only closing line — the real help-request flow is a
          WAGON 10 deliverable; nothing here pretends to be a CTA. */}
      <p
        className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-[11px] leading-relaxed text-text-muted"
        data-testid="documents-guidance-help-info"
      >
        {t("helpInfoNote")}
      </p>
    </section>
  );
}
