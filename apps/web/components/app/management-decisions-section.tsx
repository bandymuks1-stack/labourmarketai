import { getTranslations } from "next-intl/server";

import {
  attachDecisionDocumentAction,
  createManagementDecisionAction,
  linkDecisionTaskAction,
  recordDecisionResultAction,
  submitManagementDecisionAction,
  updateManagementDecisionAction,
} from "@/lib/decisions/decisions-actions";
import { getDecisionsOverview } from "@/lib/decisions/decisions";
import {
  DECISION_AGENDA_MAX,
  DECISION_RESULT_MAX,
  DECISION_TITLE_MAX,
  DECISION_TITLE_MIN,
  isDecisionNotice,
} from "@/lib/decisions/decisions-model";

/**
 * Management decisions section (v1) — a THIN surface over the engines it
 * rides, placed directly beside the approvals section it depends on.
 *
 * There is NO voting control here. Putting a decision to the management
 * team starts a real instance of the organization's own approval template,
 * and the approvers cast their decisions on the approvals section above: a
 * template whose step needs EVERY approver is a unanimous vote, one that
 * needs ANY approver is a first-past-the-post vote. Nothing on this section
 * tallies, counts or decides anything.
 *
 * A result can only be written once the approval chain actually carried the
 * decision — the register never records an outcome the chain did not reach.
 *
 * Follow-up work links to real tasks created in the tasks surface; nothing
 * about a task is duplicated here.
 *
 * Honest absence: while the human-gated migration is unapplied the read
 * answers needs-migration and the section shows a calm note.
 *
 * A DRAFT CAN BE CORRECTED BEFORE IT GOES TO THE APPROVERS.
 * `update_management_decision_v1` and the "Decision updated." notice have
 * existed in all eleven locales since the module shipped, and no control
 * called them: a decision could be created and submitted, and a wrong title,
 * agenda, responsible person or deadline could not be put right — the only
 * way out was a second decision. The edit is offered on DRAFT rows only,
 * which is the database's own rule rather than this component's.
 *
 * Pure server component, NATIVE-NAV forms with an honest `?dec=` outcome.
 */
export async function ManagementDecisionsSection({
  locale,
  notice,
}: {
  locale: string;
  notice?: string;
}) {
  const t = await getTranslations("managementDecisions");
  const data = await getDecisionsOverview();
  if (data.kind === "not-authed" || data.kind === "error") return null;

  const outcome = notice && isDecisionNotice(notice) ? notice : null;

  if (data.kind === "needs-migration") {
    return (
      <section
        id="decisions"
        className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
        data-testid="management-decisions"
      >
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p
          className="rounded-md border border-dashed border-ink-500 p-3 text-sm text-text-muted"
          data-testid="decisions-not-available"
        >
          {t("notAvailable")}
        </p>
      </section>
    );
  }

  return (
    <section
      id="decisions"
      className="flex flex-col gap-4 rounded-md border border-ink-600 bg-ink-800/30 p-4"
      data-testid="management-decisions"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-xs text-text-secondary">{t("intro")}</p>
        <p className="text-meta text-text-muted">{t("engineNote")}</p>
      </div>

      {outcome ? (
        <p
          role="status"
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="decisions-notice"
        >
          {t(`notice.${outcome}`)}
        </p>
      ) : null}

      <form
        action={createManagementDecisionAction}
        className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3"
      >
        <input type="hidden" name="locale" value={locale} />
        <label className="flex flex-col gap-1 text-meta text-text-muted">
          {t("form.title")}
          <input
            type="text"
            name="title"
            required
            minLength={DECISION_TITLE_MIN}
            maxLength={DECISION_TITLE_MAX}
            className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-meta text-text-muted">
          {t("form.agenda")}
          <textarea
            name="agenda"
            required
            rows={3}
            maxLength={DECISION_AGENDA_MAX}
            className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
          />
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-meta text-text-muted">
            {t("form.responsible")}
            <input
              type="email"
              name="responsibleEmail"
              maxLength={320}
              className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-meta text-text-muted">
            {t("form.deadline")}
            <input
              type="date"
              name="deadline"
              className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
            />
          </label>
        </div>
        <button
          type="submit"
          className="self-start rounded-md border border-brand-blue px-3 py-1 text-sm font-semibold text-brand-blue"
        >
          {t("form.create")}
        </button>
      </form>

      {data.decisions.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-ink-500 p-3 text-sm text-text-muted"
          data-testid="decisions-empty"
        >
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="decisions-list">
          {data.decisions.map((d) => {
            const docs = data.documentLinks.filter((l) => l.decisionId === d.id);
            const tasks = data.taskLinks.filter((l) => l.decisionId === d.id);
            return (
              <li
                key={d.id}
                className="flex flex-col gap-3 rounded-md border border-ink-500 bg-ink-800/40 p-3"
                data-testid="decision-row"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-text-primary">
                    {d.title}
                  </span>
                  <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {t(`status.${d.status}`)}
                    {d.deadline ? ` · ${d.deadline}` : ""}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-text-secondary">
                  {d.agenda}
                </p>

                {d.decisionResult ? (
                  <p
                    className="whitespace-pre-wrap rounded-md border border-state-success/30 bg-state-success/5 px-3 py-2 text-sm text-text-secondary"
                    data-testid="decision-result"
                  >
                    {t("resultLabel")}: {d.decisionResult}
                  </p>
                ) : null}

                {d.status === "draft" ? (
                  <details data-testid="decision-edit">
                    <summary className="cursor-pointer text-meta text-text-muted">
                      {t("edit.open")}
                    </summary>
                    {/* DRAFT ONLY, and the database says so too:
                        `update_management_decision_v1` answers `invalid_state`
                        for anything past draft, so a decision already in the
                        approval chain cannot be rewritten under the approvers.
                        Every field left blank is left unchanged. */}
                    <form
                      action={updateManagementDecisionAction}
                      className="mt-2 flex flex-col gap-2"
                    >
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="decisionId" value={d.id} />
                      <input
                        type="text"
                        name="title"
                        defaultValue={d.title}
                        minLength={DECISION_TITLE_MIN}
                        maxLength={DECISION_TITLE_MAX}
                        aria-label={t("form.title")}
                        className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                      />
                      <textarea
                        name="agenda"
                        defaultValue={d.agenda}
                        rows={3}
                        maxLength={DECISION_AGENDA_MAX}
                        aria-label={t("form.agenda")}
                        className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                      />
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <label className="flex min-w-0 flex-1 flex-col gap-1 text-meta text-text-muted">
                          {t("edit.responsible")}
                          <input
                            type="email"
                            name="responsibleEmail"
                            maxLength={320}
                            className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-meta text-text-muted">
                          {t("form.deadline")}
                          <input
                            type="date"
                            name="deadline"
                            defaultValue={d.deadline ?? ""}
                            className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                          />
                        </label>
                      </div>
                      <button
                        type="submit"
                        data-testid="decision-edit-save"
                        className="self-start rounded-md border border-ink-500 px-3 py-1 text-sm text-text-primary"
                      >
                        {t("edit.save")}
                      </button>
                    </form>
                  </details>
                ) : null}

                {d.status === "draft" && data.approvalTemplates.length > 0 ? (
                  <form
                    action={submitManagementDecisionAction}
                    className="flex flex-col gap-2 sm:flex-row"
                  >
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="decisionId" value={d.id} />
                    <input type="hidden" name="title" value={d.title} />
                    <select
                      name="definitionId"
                      required
                      aria-label={t("submit.template")}
                      className="min-w-0 flex-1 rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                    >
                      {data.approvalTemplates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-md border border-brand-blue px-3 py-1 text-sm font-semibold text-brand-blue"
                    >
                      {t("submit.action")}
                    </button>
                  </form>
                ) : d.status === "draft" ? (
                  <p className="text-meta text-text-muted">{t("submit.noTemplate")}</p>
                ) : null}

                {d.status === "approved" ? (
                  <form
                    action={recordDecisionResultAction}
                    className="flex flex-col gap-2"
                  >
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="decisionId" value={d.id} />
                    <textarea
                      name="decisionResult"
                      required
                      rows={2}
                      maxLength={DECISION_RESULT_MAX}
                      aria-label={t("resultLabel")}
                      placeholder={t("resultPlaceholder")}
                      className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                    />
                    <button
                      type="submit"
                      className="self-start rounded-md border border-brand-blue px-3 py-1 text-sm font-semibold text-brand-blue"
                    >
                      {t("recordResult")}
                    </button>
                  </form>
                ) : null}

                <div className="flex flex-col gap-1">
                  <span className="text-meta text-text-muted">{t("links.label")}</span>
                  {docs.length === 0 && tasks.length === 0 ? (
                    <p className="text-sm text-text-muted">{t("links.empty")}</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {docs.map((l) => (
                        <li key={l.id} className="text-sm text-text-secondary">
                          {t("links.document")}: {l.documentTitle ?? l.orgDocumentId}
                        </li>
                      ))}
                      {tasks.map((l) => (
                        <li key={l.id} className="text-sm text-text-secondary">
                          {t("links.task")}: {l.taskTitle ?? l.workTaskId}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <form
                      action={attachDecisionDocumentAction}
                      className="flex min-w-0 flex-1 gap-2"
                    >
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="decisionId" value={d.id} />
                      <input
                        type="text"
                        name="orgDocumentId"
                        required
                        placeholder={t("links.documentPlaceholder")}
                        aria-label={t("links.documentPlaceholder")}
                        className="min-w-0 flex-1 rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-ink-500 px-3 py-1 text-sm text-text-secondary"
                      >
                        {t("links.addDocument")}
                      </button>
                    </form>
                    <form
                      action={linkDecisionTaskAction}
                      className="flex min-w-0 flex-1 gap-2"
                    >
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="decisionId" value={d.id} />
                      <input
                        type="text"
                        name="workTaskId"
                        required
                        placeholder={t("links.taskPlaceholder")}
                        aria-label={t("links.taskPlaceholder")}
                        className="min-w-0 flex-1 rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-ink-500 px-3 py-1 text-sm text-text-secondary"
                      >
                        {t("links.addTask")}
                      </button>
                    </form>
                  </div>
                  <p className="text-meta text-text-muted">{t("links.taskNote")}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
