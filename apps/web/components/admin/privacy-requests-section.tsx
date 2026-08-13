import { getTranslations } from "next-intl/server";

import { reviewPrivacyRequestAction } from "@/lib/admin/privacy-request-actions";
import {
  listPrivacyRequestQueue,
  PRIVACY_REVIEW_NOTE_MAX,
  PRIVACY_REVIEW_STATUSES,
} from "@/lib/admin/privacy-requests";
import {
  buildDeletionPlanPreview,
  type DeletionPlanPreview,
} from "@/lib/privacy/deletion-plan";
import { formatUtcDateTime } from "@/lib/time/display";

/**
 * Privacy requests — the admin queue (V8 W4-C item 2 + V9 phases 1–2).
 *
 * Phase 1 adds the REVIEW lifecycle: a superadmin moves a request along the
 * review statuses with an optional note (plain form post — no client JS;
 * the audit entry is appended into the row's payload by the lib). Phase 2
 * adds the read-only deletion-plan PREVIEW, expanded same-page via
 * `?deletionPlanFor=<requestId>` — a design projection, never execution.
 *
 * The honest boundary stands: NOTHING here deletes anything. The only
 * mutating control is the review verb; destructive execution stays
 * owner-gated (docs/legal/deletion-process-design-v1.md, phases 3–4).
 */
const REVIEW_NOTICES = [
  "saved",
  "not_superadmin",
  "invalid",
  "not_found",
  "not_privacy_request",
  "needs_migration",
  "error",
] as const;

export async function PrivacyRequestsSection({
  locale,
  deletionPlanFor = null,
  reviewNotice = null,
}: {
  locale: string;
  /** `?deletionPlanFor=` — which request row's plan preview is expanded. */
  deletionPlanFor?: string | null;
  /** `?privacyReviewNotice=` — the review action's redirect outcome. */
  reviewNotice?: string | null;
}) {
  const t = await getTranslations("admin.privacyRequests");
  const result = await listPrivacyRequestQueue();
  const notice =
    reviewNotice && (REVIEW_NOTICES as readonly string[]).includes(reviewNotice)
      ? reviewNotice
      : null;

  // Resolve the requested plan preview ONLY for a row that exists in the
  // queue — an arbitrary id in the URL can never trigger a read.
  const planTarget =
    result.kind === "ok" && deletionPlanFor
      ? (result.rows.find((r) => r.id === deletionPlanFor) ?? null)
      : null;
  const plan: DeletionPlanPreview | null = planTarget?.profileId
    ? await buildDeletionPlanPreview(planTarget.profileId)
    : null;

  return (
    <section
      className="flex flex-col gap-3"
      data-testid="admin-privacy-requests"
      aria-labelledby="admin-privacy-requests-heading"
    >
      <header className="flex flex-col gap-1">
        <h2
          id="admin-privacy-requests-heading"
          className="scroll-mt-20 font-display text-xl font-bold tracking-tightest text-text-primary"
        >
          {t("title")}
        </h2>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      {/* The review action's redirect outcome — feedback via navigation. */}
      {notice ? (
        <p
          role="status"
          className={`rounded-md border px-3 py-2 text-xs ${
            notice === "saved"
              ? "border-state-success/40 bg-state-success/10 text-state-success"
              : "border-state-warning/40 bg-state-warning/10 text-text-secondary"
          }`}
          data-testid="admin-privacy-review-notice"
        >
          {t(`review.result.${notice}` as Parameters<typeof t>[0])}
        </p>
      ) : null}

      {result.kind === "needs-migration" ? (
        <p className="rounded-md border border-ink-500 bg-ink-800/30 p-4 text-sm text-text-secondary">
          {t("needsMigration")}
        </p>
      ) : result.kind === "error" ? (
        <p className="rounded-md border border-ink-500 bg-ink-800/30 p-4 text-sm text-text-secondary">
          {t("unavailable")}
        </p>
      ) : result.rows.length === 0 ? (
        <p
          className="rounded-md border border-ink-500 bg-ink-800/30 p-4 text-sm text-text-secondary"
          data-testid="admin-privacy-requests-empty"
        >
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {result.rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/30 p-3"
              data-testid={`admin-privacy-request-${r.id}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-sm font-semibold text-text-primary">
                  {t(
                    r.type === "data_export"
                      ? "type.dataExport"
                      : r.type === "account_deletion"
                        ? "type.accountDeletion"
                        : "type.unknown",
                  )}
                </span>
                <span
                  className="font-mono text-meta uppercase tracking-label text-text-muted"
                  data-testid={`admin-privacy-request-status-${r.id}`}
                >
                  {(PRIVACY_REVIEW_STATUSES as readonly string[]).includes(r.status)
                    ? t(`status.${r.status}` as Parameters<typeof t>[0])
                    : r.status}
                </span>
                <span className="font-mono text-meta text-text-muted">
                  {formatUtcDateTime(r.createdAtIso, locale)}
                </span>
                <span className="min-w-0 break-all font-mono text-meta text-text-muted">
                  {r.email ?? r.profileId?.slice(0, 8) ?? "—"}
                </span>
              </div>

              {/* Phase 1 — review verbs. A plain form post; the refreshed row
                  is the feedback. REVIEW ONLY (honesty line below). */}
              <form
                action={reviewPrivacyRequestAction}
                className="flex flex-wrap items-center gap-2"
                data-testid={`admin-privacy-review-form-${r.id}`}
              >
                <input type="hidden" name="request_id" value={r.id} />
                <input type="hidden" name="locale" value={locale} />
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  {t("review.statusLabel")}
                  <select
                    name="status"
                    defaultValue={
                      (PRIVACY_REVIEW_STATUSES as readonly string[]).includes(r.status)
                        ? r.status
                        : "in_review"
                    }
                    className="min-h-9 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1 text-xs text-text-primary"
                  >
                    {PRIVACY_REVIEW_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`status.${s}` as Parameters<typeof t>[0])}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-text-secondary">
                  {t("review.noteLabel")}
                  <input
                    name="note"
                    maxLength={PRIVACY_REVIEW_NOTE_MAX}
                    className="min-h-9 w-full min-w-32 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1 text-xs text-text-primary"
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex min-h-9 items-center rounded-md border border-ink-500 px-3 py-1 text-xs text-text-primary transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                >
                  {t("review.submit")}
                </button>
              </form>

              {/* Phase 2 — the read-only plan preview, same-page expand. */}
              {planTarget?.id === r.id ? (
                <PlanPreviewBlock t={t} plan={plan} />
              ) : (
                /* Relative query link — same page, locale-preserving, no
                   admin path literal outside the admin tree. */
                <a
                  href={`?deletionPlanFor=${r.id}#admin-privacy-requests-heading`}
                  className="w-fit text-xs font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  data-testid={`admin-privacy-plan-link-${r.id}`}
                >
                  {t("plan.link")} →
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* The honest boundary: review decisions only — nothing is deleted. */}
      <p className="text-meta text-text-muted" data-testid="admin-privacy-requests-note">
        {t("review.honesty")} {t("manualNote")}
      </p>
    </section>
  );
}

/** The expanded phase-2 preview — counts and planned actions, never verbs. */
async function PlanPreviewBlock({
  t,
  plan,
}: {
  t: Awaited<ReturnType<typeof getTranslations>>;
  plan: DeletionPlanPreview | null;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-state-warning/40 bg-state-warning/5 p-3"
      data-testid="admin-privacy-plan-preview"
    >
      <p className="text-xs font-semibold text-text-primary">{t("plan.title")}</p>
      {/* The header the coordinator's owner decision requires, verbatim in
          spirit: preview only, execution owner-gated. */}
      <p className="text-meta text-state-warning">{t("plan.honesty")}</p>

      {plan === null ? (
        <p className="text-meta text-text-muted">{t("plan.noProfile")}</p>
      ) : plan.kind !== "ok" ? (
        <p className="text-meta text-text-muted">{t("plan.unavailable")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {plan.rows.map((row) => (
            <li
              key={row.dataClass}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs"
              data-testid={`admin-privacy-plan-${row.dataClass}`}
            >
              <span className="min-w-40 text-text-primary">
                {t(`plan.class.${row.dataClass}` as Parameters<typeof t>[0])}
              </span>
              <span className="font-mono tabular-nums text-text-secondary">
                {row.rowCount === null ? t("plan.notCountable") : row.rowCount}
              </span>
              <span className="text-text-secondary">
                {t(`plan.action.${row.plannedAction}` as Parameters<typeof t>[0])}
              </span>
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                {row.basis}
              </span>
            </li>
          ))}
        </ul>
      )}

      <a
        href="?#admin-privacy-requests-heading"
        className="w-fit text-xs font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        data-testid="admin-privacy-plan-collapse"
      >
        {t("plan.collapse")}
      </a>
    </div>
  );
}
