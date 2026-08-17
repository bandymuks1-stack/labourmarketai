import { getTranslations } from "next-intl/server";

import { acknowledgeDocumentAction } from "@/lib/documents/document-file-actions";
import { getMyAcknowledgementInbox } from "@/lib/documents/document-files";

/**
 * Acknowledgement inbox (Document & Evidence Engine v1) — "documents you
 * were asked to confirm you have read". Renders for ANY signed-in person
 * (assignees can be org members or linked workers). Each entry names the
 * exact FILE VERSION it binds to — acknowledging version N never covers
 * version N+1, and a re-published document arrives as a NEW entry only
 * when the responsible person explicitly re-assigns it.
 *
 * Honest absence: while the human-gated migration is unapplied the read
 * answers needs-migration and the section renders NOTHING (the surrounding
 * page already carries the truthful storage note) — no empty promises.
 */
export async function DocumentAckInbox({ locale }: { locale: string }) {
  const t = await getTranslations("documentFiles");
  const inbox = await getMyAcknowledgementInbox();

  // Absent layer or failed read → no section at all (nothing to claim).
  if (inbox.kind !== "ok") return null;
  // Nothing assigned, ever → stay out of the way (no empty-state noise on a
  // page that already has several sections).
  if (inbox.pending.length === 0 && inbox.completed.length === 0) return null;

  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-ink-600 bg-ink-800/30 p-4"
      data-testid="doc-ack-inbox"
    >
      <h2 className="font-display text-lg font-semibold text-text-primary">
        {t("ackInbox.title")}
      </h2>
      <p className="text-xs text-text-secondary">{t("ackInbox.intro")}</p>
      {inbox.pending.length === 0 ? (
        <p
          className="rounded-md border border-state-success/30 bg-state-success/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="doc-ack-inbox-empty"
        >
          {t("ackInbox.allDone")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {inbox.pending.map((item) => (
            <li
              key={item.ackId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3"
              data-testid="doc-ack-pending"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold text-text-primary">
                  {item.documentTitle || item.originalFilename}
                </span>
                <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {t("currentVersion", { n: item.version })}
                  {item.requiredBy
                    ? ` · ${t("ackInbox.requiredBy", { date: item.requiredBy })}`
                    : ""}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`/api/documents/file/${item.documentFileId}`}
                  className="font-mono text-meta uppercase tracking-label text-brand-blue underline-offset-2 hover:underline"
                >
                  {t("download")}
                </a>
                <form action={acknowledgeDocumentAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="ackId" value={item.ackId} />
                  <button
                    type="submit"
                    className="rounded-md border border-state-success/50 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-state-success transition-colors hover:bg-state-success/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                    data-testid="doc-ack-confirm"
                  >
                    {t("ackInbox.confirm")}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {inbox.completed.length > 0 ? (
        <div className="flex flex-col gap-1" data-testid="doc-ack-completed">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("ackInbox.completedTitle")}
          </span>
          <ul className="flex flex-col gap-1">
            {inbox.completed.map((item) => (
              <li
                key={item.ackId}
                className="flex flex-wrap items-center justify-between gap-2 text-meta text-text-muted"
              >
                <span>
                  {item.documentTitle || item.originalFilename} ·{" "}
                  {t("currentVersion", { n: item.version })}
                </span>
                <span>
                  {t("ackInbox.confirmedAt", {
                    date: (item.acknowledgedAt ?? "").slice(0, 10),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-meta text-text-muted">{t("ackInbox.versionRule")}</p>
    </section>
  );
}
