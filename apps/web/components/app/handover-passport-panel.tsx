"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { addHandoverEntryAction } from "@/lib/projects/handover-passport-actions";
import {
  HANDOVER_STATUSES,
  type HandoverPassportData,
  type HandoverStatus,
} from "@/lib/projects/handover-passport-model";
import { formatUtcDate } from "@/lib/time/display";

/**
 * Job/project handover passport shell on the EXISTING project operations
 * surface (§8.8, branch 19).
 *
 * - Responsible parties are the project's REAL active assignments (the same
 *   rows the operations board above already shows) — no new read path.
 * - Statuses are manager-DECLARED stages with honest wording: the panel
 *   never claims platform verification, certification, or completion proof.
 * - The checklist stays the EXISTING per-worker readiness checklist on this
 *   page — the passport does not duplicate it. Photos are out of scope for
 *   this slice and the copy says so honestly.
 * - Pre-apply (owner-gated migration not applied) the panel shows an honest
 *   "not yet available" state — no fake entries, no fake status.
 */
export function HandoverPassportPanel({
  projectId,
  data,
  responsibleWorkers,
}: {
  projectId: string;
  data: HandoverPassportData;
  responsibleWorkers: readonly { name: string }[];
}) {
  const router = useRouter();
  const t = useTranslations("handoverPassport");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [entryType, setEntryType] = useState<"note" | "status">("note");
  const [statusValue, setStatusValue] = useState<HandoverStatus>("preparation");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function submit() {
    setMsg(null);
    startTransition(async () => {
      const res = await addHandoverEntryAction({
        projectId,
        entryType,
        statusValue: entryType === "status" ? statusValue : undefined,
        body: body.trim() || undefined,
      });
      if (res.ok) {
        setBody("");
        setMsg(t("outcome.added"));
      } else if (res.code === "needs_migration") {
        setMsg(t("outcome.needsMigration"));
      } else if (res.code === "not_authorized") {
        setMsg(t("outcome.notAuthorized"));
      } else if (res.code === "limit_reached") {
        setMsg(t("outcome.limitReached"));
      } else if (res.code === "invalid") {
        setMsg(t("outcome.invalid"));
      } else {
        setMsg(t("outcome.error"));
      }
      router.refresh();
    });
  }

  return (
    <section
      className="card-border flex flex-col gap-4 p-5"
      data-testid="handover-passport-panel"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-sm text-text-secondary">{t("intro")}</p>
        <p className="text-meta leading-relaxed text-text-muted">
          {t("honestNote")}
        </p>
      </header>

      {/* Responsible parties — the REAL active assignments already loaded by
          the operations board (no new read, names only). */}
      <div className="flex flex-col gap-1">
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("responsibleHeading")}
        </span>
        {responsibleWorkers.length === 0 ? (
          <p className="text-xs text-text-muted">{t("responsibleEmpty")}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5" data-testid="handover-responsible">
            {responsibleWorkers.map((w, i) => (
              <li
                key={`${w.name}-${i}`}
                className="rounded-full border border-ink-500 px-2 py-0.5 text-xs text-text-primary"
              >
                {w.name}
              </li>
            ))}
          </ul>
        )}
        <p className="text-meta text-text-muted">{t("checklistNote")}</p>
      </div>

      {!data.applied ? (
        <p
          className="text-sm text-text-muted"
          data-testid="handover-passport-preapply"
        >
          {t("preApply")}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("statusHeading")}
            </span>
            <p className="text-sm text-text-primary" data-testid="handover-declared-status">
              {data.declaredStatus
                ? t(`statuses.${data.declaredStatus}`)
                : t("statusNone")}
            </p>
            <p className="text-meta text-text-muted">{t("statusDisclaimer")}</p>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("historyHeading")}
            </span>
            {data.entries.length === 0 ? (
              <p className="text-xs text-text-muted" data-testid="handover-empty">
                {t("historyEmpty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="handover-entries">
                {data.entries.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-md border border-ink-600 bg-ink-800/40 p-3"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                        {e.entryType === "status"
                          ? t("entryStatusLabel")
                          : t("entryNoteLabel")}
                      </span>
                      <span className="text-meta text-text-muted">
                        {formatUtcDate(e.createdAt, locale)}
                      </span>
                    </div>
                    {e.entryType === "status" && e.statusValue ? (
                      <p className="text-sm text-text-primary">
                        {t(`statuses.${e.statusValue}`)}
                      </p>
                    ) : null}
                    {e.body ? (
                      <p className="whitespace-pre-wrap text-sm text-text-secondary">
                        {e.body}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-ink-600 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-text-secondary" htmlFor="handover-entry-type">
                {t("form.typeLabel")}
              </label>
              <select
                id="handover-entry-type"
                className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary"
                value={entryType}
                onChange={(e) => setEntryType(e.target.value === "status" ? "status" : "note")}
                data-testid="handover-entry-type"
              >
                <option value="note">{t("form.typeNote")}</option>
                <option value="status">{t("form.typeStatus")}</option>
              </select>
              {entryType === "status" ? (
                <select
                  aria-label={t("form.statusLabel")}
                  className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary"
                  value={statusValue}
                  onChange={(e) => setStatusValue(e.target.value as HandoverStatus)}
                  data-testid="handover-status-select"
                >
                  {HANDOVER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`statuses.${s}`)}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <textarea
              aria-label={t("form.bodyLabel")}
              rows={2}
              maxLength={1000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                entryType === "note"
                  ? t("form.bodyPlaceholder")
                  : t("form.bodyOptionalPlaceholder")
              }
              className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-sm text-text-primary"
              data-testid="handover-entry-body"
            />
            <div>
              <Button
                type="button"
                size="sm"
                disabled={pending || (entryType === "note" && body.trim().length === 0)}
                onClick={submit}
                data-testid="handover-entry-submit"
              >
                {pending ? t("form.saving") : t("form.submit")}
              </Button>
            </div>
          </div>
        </>
      )}

      {msg && (
        <p className="text-xs text-text-secondary" data-testid="handover-passport-msg">
          {msg}
        </p>
      )}
    </section>
  );
}
