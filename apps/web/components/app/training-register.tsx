import { getTranslations } from "next-intl/server";

import {
  assignTrainingAction,
  attachTrainingCertificateAction,
  completeTrainingAction,
  createTrainingProgramAction,
  markTrainingExpiredAction,
} from "@/lib/training/training-actions";
import {
  getCertificationRegister,
  getTrainingOverview,
} from "@/lib/training/training";
import {
  TRAINING_COMPLETION_NOTE_MAX,
  TRAINING_DESCRIPTION_MAX,
  TRAINING_TITLE_MAX,
  TRAINING_TITLE_MIN,
  deriveExpiryState,
  isTrainingNotice,
} from "@/lib/training/training-model";

/**
 * Training & Certification section (v1) — one section, two audiences,
 * exactly as the document centre already does it:
 *   * "Your training" — what THIS person was asked to complete, and the
 *     single self-only action that records it;
 *   * "Training programmes" + "Certificates" — the organization's own
 *     register, visible only to a managing role (RLS decides, not this
 *     component).
 *
 * Honest absence: while the human-gated migration is unapplied the read
 * answers needs-migration and the section renders a calm note — never an
 * error, never a fake programme. With the layer present but nothing
 * assigned, the personal half stays out of the way.
 *
 * A certificate here is evidence that a COURSE WAS FINISHED. It is never
 * shown as proof of skill, and there is no rating anywhere on this surface.
 * Confirming that someone READ the material is the document centre's
 * confirmation list, not a second control here.
 *
 * Pure server component, NATIVE-NAV forms: every submit is a server action
 * that redirects back with an honest `?trn=` outcome.
 */
export async function TrainingRegister({
  locale,
  notice,
}: {
  locale: string;
  notice?: string;
}) {
  const t = await getTranslations("training");
  const overview = await getTrainingOverview();
  if (overview.kind === "not-authed" || overview.kind === "error") return null;

  const outcome = notice && isTrainingNotice(notice) ? notice : null;

  if (overview.kind === "needs-migration") {
    return (
      <section
        id="training"
        className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
        data-testid="training-register"
      >
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p
          className="rounded-md border border-dashed border-ink-500 p-3 text-sm text-text-muted"
          data-testid="training-not-available"
        >
          {t("notAvailable")}
        </p>
      </section>
    );
  }

  const certs = await getCertificationRegister();
  const today = new Date();
  const managed = overview.assignments.filter(
    (a) => a.assigneeProfileId !== overview.viewerProfileId,
  );
  const canManage = overview.programs.length > 0 || managed.length > 0;

  return (
    <section
      id="training"
      className="flex flex-col gap-4 rounded-md border border-ink-600 bg-ink-800/30 p-4"
      data-testid="training-register"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-xs text-text-secondary">{t("intro")}</p>
        <p className="text-meta text-text-muted">{t("evidenceNote")}</p>
      </div>

      {outcome ? (
        <p
          role="status"
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="training-notice"
        >
          {t(`notice.${outcome}`)}
        </p>
      ) : null}

      {/* ── Your training — the self-only half ─────────────────────────── */}
      {overview.mine.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="training-mine">
          <h3 className="text-sm font-semibold text-text-primary">
            {t("mine.heading")}
          </h3>
          <ul className="flex flex-col gap-2">
            {overview.mine.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3"
                data-testid="training-mine-row"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold text-text-primary">
                    {a.programTitle}
                  </span>
                  <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {t(`status.${a.status}`)}
                    {a.requiredBy ? ` · ${t("mine.requiredBy", { date: a.requiredBy })}` : ""}
                  </span>
                </div>
                {a.status === "assigned" ? (
                  <form action={completeTrainingAction} className="flex flex-col gap-2 sm:flex-row">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="assignmentId" value={a.id} />
                    <input
                      type="text"
                      name="note"
                      maxLength={TRAINING_COMPLETION_NOTE_MAX}
                      placeholder={t("mine.notePlaceholder")}
                      aria-label={t("mine.notePlaceholder")}
                      className="min-w-0 flex-1 rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-brand-blue px-3 py-1 text-sm font-semibold text-brand-blue"
                    >
                      {t("mine.complete")}
                    </button>
                  </form>
                ) : (
                  <p className="text-meta text-text-muted">
                    {a.completionNote ?? t("mine.completedNote")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── The organization's own register ────────────────────────────── */}
      {canManage ? (
        <div className="flex flex-col gap-3" data-testid="training-org">
          <h3 className="text-sm font-semibold text-text-primary">
            {t("org.heading")}
          </h3>

          <form
            action={createTrainingProgramAction}
            className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3"
          >
            <input type="hidden" name="locale" value={locale} />
            <label className="flex flex-col gap-1 text-meta text-text-muted">
              {t("org.programTitle")}
              <input
                type="text"
                name="title"
                required
                minLength={TRAINING_TITLE_MIN}
                maxLength={TRAINING_TITLE_MAX}
                className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-meta text-text-muted">
              {t("org.programDescription")}
              <textarea
                name="description"
                rows={2}
                maxLength={TRAINING_DESCRIPTION_MAX}
                className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
              />
            </label>
            <p className="text-meta text-text-muted">{t("org.materialNote")}</p>
            <button
              type="submit"
              className="self-start rounded-md border border-brand-blue px-3 py-1 text-sm font-semibold text-brand-blue"
            >
              {t("org.createProgram")}
            </button>
          </form>

          {overview.programs.length === 0 ? (
            <p
              className="rounded-md border border-dashed border-ink-500 p-3 text-sm text-text-muted"
              data-testid="training-programs-empty"
            >
              {t("org.noPrograms")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {overview.programs.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3"
                  data-testid="training-program-row"
                >
                  <span className="text-sm font-semibold text-text-primary">
                    {p.title}
                  </span>
                  {p.description ? (
                    <span className="text-xs text-text-secondary">{p.description}</span>
                  ) : null}
                  <form action={assignTrainingAction} className="flex flex-col gap-2 sm:flex-row">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="programId" value={p.id} />
                    <input
                      type="email"
                      name="assigneeEmail"
                      required
                      maxLength={320}
                      placeholder={t("org.assigneePlaceholder")}
                      aria-label={t("org.assigneePlaceholder")}
                      className="min-w-0 flex-1 rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                    />
                    <input
                      type="date"
                      name="requiredBy"
                      aria-label={t("org.requiredByLabel")}
                      className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-brand-blue px-3 py-1 text-sm font-semibold text-brand-blue"
                    >
                      {t("org.assign")}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          {managed.length > 0 ? (
            <ul className="flex flex-col gap-2" data-testid="training-managed">
              {managed.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3"
                  data-testid="training-managed-row"
                >
                  <span className="text-sm text-text-primary">{a.programTitle}</span>
                  <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {t(`status.${a.status}`)}
                  </span>
                  {a.status === "completed" && !a.certificateDocumentFileId ? (
                    <form
                      action={attachTrainingCertificateAction}
                      className="flex flex-col gap-2 sm:flex-row"
                    >
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="assignmentId" value={a.id} />
                      <input
                        type="text"
                        name="documentFileId"
                        required
                        placeholder={t("org.certificateFilePlaceholder")}
                        aria-label={t("org.certificateFilePlaceholder")}
                        className="min-w-0 flex-1 rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                      />
                      <input
                        type="date"
                        name="issuedOn"
                        required
                        aria-label={t("org.issuedOnLabel")}
                        className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                      />
                      <input
                        type="date"
                        name="expiresOn"
                        aria-label={t("org.expiresOnLabel")}
                        className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-brand-blue px-3 py-1 text-sm font-semibold text-brand-blue"
                      >
                        {t("org.attachCertificate")}
                      </button>
                    </form>
                  ) : null}
                  {a.expiresOn && a.status !== "expired" ? (
                    <form action={markTrainingExpiredAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="assignmentId" value={a.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-ink-500 px-3 py-1 text-sm text-text-secondary"
                      >
                        {t("org.markExpired")}
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* ── Certificates ──────────────────────────────────────────────── */}
      {certs.kind === "ok" && certs.rows.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="training-certificates">
          <h3 className="text-sm font-semibold text-text-primary">
            {t("certificates.heading")}
          </h3>
          <p className="text-meta text-text-muted">{t("certificates.note")}</p>
          <div className="overflow-x-auto">
            <ul className="flex min-w-full flex-col gap-2">
              {certs.rows.map((c) => {
                const state = deriveExpiryState(c.expiresOn, today);
                return (
                  <li
                    key={`${c.source}-${c.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3"
                    data-testid="training-certificate-row"
                  >
                    <span className="text-sm text-text-primary">{c.label}</span>
                    <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {c.expiresOn
                        ? `${t(`certificates.${state}`)} · ${c.expiresOn}`
                        : t("certificates.none")}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
