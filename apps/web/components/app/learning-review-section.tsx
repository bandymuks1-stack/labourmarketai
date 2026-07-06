"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, X, Sparkles } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import {
  applyAutoConfirmation,
  setReviewItemStatus,
} from "@/lib/learning/learning";
import type {
  LearningPolicyRow,
  ReviewItemRow,
  ReviewStatus,
  SuggestionKind,
} from "@/lib/learning/learning-shared";

/**
 * W6 — Human-in-loop learning review surface (Phase 1). Real data only — every
 * row comes from the caller's own RLS-scoped rows (worker sees own; manager sees
 * org). There are NO seed/demo rows. When the migration is not applied yet the
 * parent passes `needsMigration` and we show a calm "not available yet" state,
 * never an error.
 *
 * A queue item is a SUGGESTION, never a confirmation. Approving marks intent; the
 * actual confirmation only happens through the audited spine RPC
 * (applyAutoConfirmation), which re-checks live manager authority server-side.
 * Worker-facing copy stays neutral; manager-only controls live under labels.manager.
 */

export type LearningLabels = {
  title: string;
  lead: string;
  notAvailable: string;
  empty: string;
  workerHeading: string;
  workerIntro: string;
  kind: Record<SuggestionKind, string>;
  skillFallback: string;
  workerFallback: string;
  noteLabel: string;
  managerContextLink: string;
  ownContextLink: string;
  manager: {
    queueHeading: string;
    approve: string;
    reject: string;
    applyPolicy: string;
    policyHeading: string;
    policyState: string;
    policyOff: string;
    policyOn: string;
    note: string;
    statusLabel: Record<ReviewStatus, string>;
  };
  errorGeneric: string;
};

const STATUS_RING: Record<ReviewStatus, string> = {
  pending: "border-ink-500 bg-ink-800/40 text-text-muted",
  approved: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  rejected: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  superseded: "border-ink-500 bg-ink-800/40 text-text-muted",
  auto_actioned: "border-ink-500 bg-ink-800/40 text-text-secondary",
};

export function LearningReviewSection({
  initialItems,
  policies,
  needsMigration,
  labels,
  viewerWorkerId,
}: {
  initialItems: ReviewItemRow[];
  policies: LearningPolicyRow[];
  needsMigration: boolean;
  labels: LearningLabels;
  /** The caller's own workers.id (null when the viewer has no worker profile).
   *  Rows about the viewer are transparency rows — never reviewable by them. */
  viewerWorkerId: string | null;
}) {
  const router = useRouter();
  const tSkillNames = useTranslations("skillNames");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const skillName = (slug: string | null) =>
    slug ? (tSkillNames.has(slug) ? tSkillNames(slug) : slug) : labels.skillFallback;

  const ownItems = initialItems.filter(
    (i) => viewerWorkerId !== null && i.subjectWorkerId === viewerWorkerId,
  );
  const orgItems = initialItems.filter(
    (i) => viewerWorkerId === null || i.subjectWorkerId !== viewerWorkerId,
  );

  if (needsMigration) {
    return (
      <div
        data-testid="learning-not-available"
        className="rounded-lg border border-ink-500 bg-ink-800/40 p-6 text-sm text-text-muted"
      >
        {labels.notAvailable}
      </div>
    );
  }

  function review(id: string, status: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const res = await setReviewItemStatus(id, status);
      if (res.kind !== "ok") setError(labels.errorGeneric);
      router.refresh();
    });
  }

  function applyPolicy(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await applyAutoConfirmation(id);
      if (res.kind !== "ok") setError(labels.errorGeneric);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-text-primary">{labels.title}</h2>
        <p className="text-sm text-text-muted">{labels.lead}</p>
      </header>

      {/* Manager auto-confirmation policy state — DEFAULT OFF, shown honestly. */}
      <section className="rounded-lg border border-ink-500 bg-ink-800/30 p-4">
        <h3 className="text-sm font-medium text-text-secondary">{labels.manager.policyHeading}</h3>
        <ul className="mt-2 space-y-1 text-sm text-text-muted">
          {policies.map((p) => (
            <li key={p.id} data-testid="learning-policy-row">
              {labels.manager.policyState}:{" "}
              <span className={p.enabled ? "text-brand-blue" : "text-text-muted"}>
                {p.enabled ? labels.manager.policyOn : labels.manager.policyOff}
              </span>
            </li>
          ))}
          {policies.length === 0 && <li>{labels.manager.policyOff}</li>}
        </ul>
        <p className="mt-2 text-xs text-text-muted">{labels.manager.note}</p>
      </section>

      {/* Worker transparency list — the viewer's OWN rows. Read-only by design:
          a subject never reviews suggestions about themselves; the confirmation
          authority lives with the org manager. */}
      {ownItems.length > 0 && (
        <section className="space-y-2" data-testid="learning-own-section">
          <h3 className="text-sm font-medium text-text-secondary">{labels.workerHeading}</h3>
          <p className="text-xs text-text-muted">{labels.workerIntro}</p>
          <ul className="space-y-2">
            {ownItems.map((item) => (
              <li
                key={item.id}
                data-testid="learning-own-row"
                className="flex flex-col gap-1.5 rounded-lg border border-ink-500 bg-ink-800/30 p-3"
              >
                <ItemSummary item={item} labels={labels} skillName={skillName} />
                {item.journalEntryId && (
                  <Link
                    href={"/dashboard/journal" as "/dashboard"}
                    className="text-xs text-brand-blue hover:underline"
                  >
                    {labels.ownContextLink}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Manager review queue — rows about OTHER workers in the caller's org.
          Every row states WHAT is suggested, ABOUT WHOM, and links the journal
          review context before offering a decision (never a blind approve). */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-text-secondary">{labels.manager.queueHeading}</h3>
        {orgItems.length === 0 ? (
          <div
            data-testid="learning-empty"
            className="rounded-lg border border-ink-500 bg-ink-800/40 p-6 text-sm text-text-muted"
          >
            {labels.empty}
          </div>
        ) : (
          <ul className="space-y-2">
            {orgItems.map((item) => (
              <li
                key={item.id}
                data-testid="learning-review-row"
                className="flex flex-col gap-2 rounded-lg border border-ink-500 bg-ink-800/30 p-3"
              >
                <ItemSummary item={item} labels={labels} skillName={skillName} />
                {item.journalEntryId && (
                  <Link
                    href={"/dashboard/inbox" as "/dashboard"}
                    className="text-xs text-brand-blue hover:underline"
                    data-testid="learning-review-context-link"
                  >
                    {labels.managerContextLink}
                  </Link>
                )}
                {item.status === "pending" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => review(item.id, "approved")}
                      className="inline-flex min-h-11 items-center gap-1 rounded-md border border-brand-blue/40 px-3 py-1.5 text-xs text-brand-blue disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" /> {labels.manager.approve}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => review(item.id, "rejected")}
                      className="inline-flex min-h-11 items-center gap-1 rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-muted disabled:opacity-50"
                    >
                      <X className="h-3 w-3" /> {labels.manager.reject}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => applyPolicy(item.id)}
                      className="inline-flex min-h-11 items-center gap-1 rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-secondary disabled:opacity-50"
                    >
                      <Sparkles className="h-3 w-3" /> {labels.manager.applyPolicy}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <p className="text-sm text-state-warning">{error}</p>}
    </div>
  );
}

/** WHAT is suggested, ABOUT WHOM, on which skill — the facts a reviewer needs
 *  before any decision button. Shared by the worker-transparency and manager
 *  queue rows. */
function ItemSummary({
  item,
  labels,
  skillName,
}: {
  item: ReviewItemRow;
  labels: LearningLabels;
  skillName: (slug: string | null) => string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-block shrink-0 rounded-full border px-2 py-0.5 text-xs ${STATUS_RING[item.status]}`}
        >
          {labels.manager.statusLabel[item.status]}
        </span>
        <span className="text-sm font-medium text-text-primary" data-testid="learning-item-kind">
          {labels.kind[item.suggestionKind]}
        </span>
      </div>
      <p className="text-sm text-text-secondary" data-testid="learning-item-subject">
        {skillName(item.subjectSkillSlug)} · {item.subjectWorkerName ?? labels.workerFallback}
      </p>
      {item.reviewNote && (
        <p className="text-xs text-text-muted">
          {labels.noteLabel}: {item.reviewNote}
        </p>
      )}
    </div>
  );
}
