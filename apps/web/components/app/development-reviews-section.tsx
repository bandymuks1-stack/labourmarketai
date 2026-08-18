import { getTranslations } from "next-intl/server";

import {
  addReviewEvidenceLinkAction,
  closePerformanceReviewAction,
  createPerformanceReviewAction,
  createReviewCycleAction,
  saveReviewManagerInputAction,
  saveReviewWorkerInputAction,
  setReviewCycleStatusAction,
} from "@/lib/reviews/reviews-actions";
import { getReviewsOverview } from "@/lib/reviews/reviews";
import {
  REVIEW_CYCLE_NAME_MAX,
  REVIEW_CYCLE_NAME_MIN,
  REVIEW_EVIDENCE_KINDS,
  REVIEW_EVIDENCE_NOTE_MAX,
  REVIEW_INPUT_MAX,
  deriveReviewCompleteness,
  isReviewNotice,
} from "@/lib/reviews/reviews-model";

/**
 * Development & performance reviews section (v1).
 *
 * THE DOCTRINE IS VISIBLE ON THE SURFACE, not only in the schema:
 *   * there is NO rating control, NO star, NO scale and NO score anywhere
 *     on this section — the schema has no column for one;
 *   * every free-text block is rendered under an explicit "written by
 *     <someone>, their own view" label, so a reader can never mistake an
 *     opinion for a measurement;
 *   * the evidence list links to REAL entries, skills, projects and
 *     training records that already exist elsewhere.
 *
 * Honest absence: while the human-gated migration is unapplied the read
 * answers needs-migration and the section shows a calm note. With the layer
 * present and nothing recorded, it shows the empty state rather than
 * pretending a cycle exists.
 *
 * Pure server component, NATIVE-NAV forms with an honest `?rev=` outcome.
 */
export async function DevelopmentReviewsSection({
  locale,
  notice,
}: {
  locale: string;
  notice?: string;
}) {
  const t = await getTranslations("developmentReviews");
  const data = await getReviewsOverview();
  if (data.kind === "not-authed" || data.kind === "error") return null;

  const outcome = notice && isReviewNotice(notice) ? notice : null;

  if (data.kind === "needs-migration") {
    return (
      <section
        id="reviews"
        className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
        data-testid="development-reviews"
      >
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p
          className="rounded-md border border-dashed border-ink-500 p-3 text-sm text-text-muted"
          data-testid="reviews-not-available"
        >
          {t("notAvailable")}
        </p>
      </section>
    );
  }

  const visible = [...data.asSubject, ...data.asReviewer].filter(
    (r, i, all) => all.findIndex((o) => o.id === r.id) === i,
  );
  const openCycles = data.cycles.filter((c) => c.status === "open");

  return (
    <section
      id="reviews"
      className="flex flex-col gap-4 rounded-md border border-ink-600 bg-ink-800/30 p-4"
      data-testid="development-reviews"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-xs text-text-secondary">{t("intro")}</p>
        <p className="text-meta text-text-muted">{t("noScoreNote")}</p>
      </div>

      {outcome ? (
        <p
          role="status"
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="reviews-notice"
        >
          {t(`notice.${outcome}`)}
        </p>
      ) : null}

      {/* ── Periods (org owner/admin) ──────────────────────────────────── */}
      <div className="flex flex-col gap-2" data-testid="review-cycles">
        <h3 className="text-sm font-semibold text-text-primary">
          {t("cycles.heading")}
        </h3>
        <form
          action={createReviewCycleAction}
          className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="locale" value={locale} />
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-meta text-text-muted">
            {t("cycles.name")}
            <input
              type="text"
              name="name"
              required
              minLength={REVIEW_CYCLE_NAME_MIN}
              maxLength={REVIEW_CYCLE_NAME_MAX}
              className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-meta text-text-muted">
            {t("cycles.from")}
            <input
              type="date"
              name="periodStart"
              required
              className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-meta text-text-muted">
            {t("cycles.to")}
            <input
              type="date"
              name="periodEnd"
              required
              className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
            />
          </label>
          <button
            type="submit"
            className="rounded-md border border-brand-blue px-3 py-1 text-sm font-semibold text-brand-blue"
          >
            {t("cycles.create")}
          </button>
        </form>

        {data.cycles.length === 0 ? (
          <p
            className="rounded-md border border-dashed border-ink-500 p-3 text-sm text-text-muted"
            data-testid="review-cycles-empty"
          >
            {t("cycles.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.cycles.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3"
                data-testid="review-cycle-row"
              >
                <span className="text-sm text-text-primary">
                  {c.name} · {c.periodStart} – {c.periodEnd}
                </span>
                <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {t(`cycleStatus.${c.status}`)}
                </span>
                {c.status !== "closed" ? (
                  <form action={setReviewCycleStatusAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="cycleId" value={c.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={c.status === "draft" ? "open" : "closed"}
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-ink-500 px-3 py-1 text-sm text-text-secondary"
                    >
                      {c.status === "draft" ? t("cycles.open") : t("cycles.close")}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {openCycles.length > 0 ? (
          <form
            action={createPerformanceReviewAction}
            className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3 sm:flex-row sm:items-end"
          >
            <input type="hidden" name="locale" value={locale} />
            <label className="flex flex-col gap-1 text-meta text-text-muted">
              {t("create.cycle")}
              <select
                name="cycleId"
                required
                className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
              >
                {openCycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-meta text-text-muted">
              {t("create.subject")}
              <input
                type="email"
                name="subjectEmail"
                required
                maxLength={320}
                className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-meta text-text-muted">
              {t("create.reviewer")}
              <input
                type="email"
                name="reviewerEmail"
                maxLength={320}
                className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
              />
            </label>
            <button
              type="submit"
              className="rounded-md border border-brand-blue px-3 py-1 text-sm font-semibold text-brand-blue"
            >
              {t("create.submit")}
            </button>
          </form>
        ) : null}
      </div>

      {/* ── The recorded conversations the viewer is part of ───────────── */}
      {visible.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-ink-500 p-3 text-sm text-text-muted"
          data-testid="reviews-empty"
        >
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="reviews-list">
          {visible.map((r) => {
            const progress = deriveReviewCompleteness(r);
            const isSubject = r.subjectProfileId === data.viewerProfileId;
            const isReviewer = r.reviewerProfileId === data.viewerProfileId;
            const links = data.evidence.filter((e) => e.reviewId === r.id);
            return (
              <li
                key={r.id}
                className="flex flex-col gap-3 rounded-md border border-ink-500 bg-ink-800/40 p-3"
                data-testid="review-row"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-text-primary">
                    {r.cycleName}
                  </span>
                  <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {t(`reviewStatus.${r.status}`)}
                  </span>
                </div>

                {/* SUBJECTIVE OBSERVATION — the subject's own words. */}
                <div className="flex flex-col gap-1">
                  <span className="text-meta text-text-muted">
                    {t("workerVoiceLabel")}
                  </span>
                  {r.workerInput ? (
                    <p className="whitespace-pre-wrap text-sm text-text-secondary">
                      {r.workerInput}
                    </p>
                  ) : isSubject && !r.closedAt ? (
                    <form
                      action={saveReviewWorkerInputAction}
                      className="flex flex-col gap-2"
                    >
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="reviewId" value={r.id} />
                      <textarea
                        name="workerInput"
                        required
                        rows={3}
                        maxLength={REVIEW_INPUT_MAX}
                        aria-label={t("workerVoiceLabel")}
                        className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                      />
                      <button
                        type="submit"
                        className="self-start rounded-md border border-brand-blue px-3 py-1 text-sm font-semibold text-brand-blue"
                      >
                        {t("saveWorkerInput")}
                      </button>
                    </form>
                  ) : (
                    <p className="text-sm text-text-muted">{t("workerVoiceMissing")}</p>
                  )}
                </div>

                {/* SUBJECTIVE OBSERVATION — the named reviewer's own words. */}
                <div className="flex flex-col gap-1">
                  <span className="text-meta text-text-muted">
                    {t("managerVoiceLabel")}
                  </span>
                  {r.managerInput ? (
                    <p className="whitespace-pre-wrap text-sm text-text-secondary">
                      {r.managerInput}
                    </p>
                  ) : (
                    <p className="text-sm text-text-muted">{t("managerVoiceMissing")}</p>
                  )}
                  {r.developmentPlan ? (
                    <p className="whitespace-pre-wrap text-sm text-text-secondary">
                      {t("planLabel")}: {r.developmentPlan}
                    </p>
                  ) : null}
                  {isReviewer && !r.closedAt ? (
                    <form
                      action={saveReviewManagerInputAction}
                      className="flex flex-col gap-2"
                    >
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="reviewId" value={r.id} />
                      <textarea
                        name="managerInput"
                        rows={3}
                        maxLength={REVIEW_INPUT_MAX}
                        aria-label={t("managerVoiceLabel")}
                        className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                      />
                      <textarea
                        name="developmentPlan"
                        rows={2}
                        maxLength={REVIEW_INPUT_MAX}
                        aria-label={t("planLabel")}
                        placeholder={t("planPlaceholder")}
                        className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                      />
                      <input
                        type="date"
                        name="followUpDate"
                        aria-label={t("followUpLabel")}
                        className="self-start rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                      />
                      <button
                        type="submit"
                        className="self-start rounded-md border border-brand-blue px-3 py-1 text-sm font-semibold text-brand-blue"
                      >
                        {t("saveManagerInput")}
                      </button>
                    </form>
                  ) : null}
                </div>

                {/* EVIDENCE — pointers to real rows elsewhere. */}
                <div className="flex flex-col gap-1">
                  <span className="text-meta text-text-muted">
                    {t("evidenceLabel")}
                  </span>
                  {links.length === 0 ? (
                    <p className="text-sm text-text-muted">{t("evidenceEmpty")}</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {links.map((e) => (
                        <li
                          key={e.id}
                          className="text-sm text-text-secondary"
                          data-testid="review-evidence-row"
                        >
                          {t(`evidenceKind.${e.kind}`)}
                          {e.note ? ` · ${e.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!r.closedAt ? (
                    <form
                      action={addReviewEvidenceLinkAction}
                      className="flex flex-col gap-2 sm:flex-row"
                    >
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="reviewId" value={r.id} />
                      <select
                        name="kind"
                        required
                        aria-label={t("evidenceLabel")}
                        className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                      >
                        {REVIEW_EVIDENCE_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {t(`evidenceKind.${k}`)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        name="refId"
                        required
                        placeholder={t("evidenceRefPlaceholder")}
                        aria-label={t("evidenceRefPlaceholder")}
                        className="min-w-0 flex-1 rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                      />
                      <input
                        type="text"
                        name="note"
                        maxLength={REVIEW_EVIDENCE_NOTE_MAX}
                        placeholder={t("evidenceNotePlaceholder")}
                        aria-label={t("evidenceNotePlaceholder")}
                        className="min-w-0 flex-1 rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-ink-500 px-3 py-1 text-sm text-text-secondary"
                      >
                        {t("addEvidence")}
                      </button>
                    </form>
                  ) : null}
                </div>

                {isReviewer && !r.closedAt ? (
                  <form action={closePerformanceReviewAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="reviewId" value={r.id} />
                    <button
                      type="submit"
                      disabled={!progress.readyToClose}
                      className="rounded-md border border-ink-500 px-3 py-1 text-sm text-text-secondary disabled:opacity-50"
                    >
                      {progress.readyToClose ? t("close") : t("closeBlocked")}
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
