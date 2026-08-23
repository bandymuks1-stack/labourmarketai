/**
 * Document → journal draft REVIEW SECTION (value train 2, C2b).
 *
 * Server component mounted on the EXISTING documents page under
 * `?draftFrom=<document_files.id>` — no new route, no modal, no wizard (the
 * product-gate contract in docs/handoffs/value-train-2-wagon-c2-blueprint.md).
 * It runs the C1 seam (RLS-scoped bytes read + deterministic offline
 * extraction), shows the worker WHAT THE SYSTEM UNDERSTOOD, and hands the
 * editable text to the review form. Every non-ok outcome renders an honest
 * one-line notice — a photo is refused because no OCR exists, a classified
 * org document because its download is an audited human act.
 *
 * Imported ≠ verified: the saved entry is worker-confirmed text with
 * immutable provenance; manager confirmation stays the existing separate
 * review loop.
 */
import { getTranslations } from "next-intl/server";
import { draftJournalSuggestionsFromDocument } from "@/lib/journal/document-journal-draft";
import { listWorkLogEngagements } from "@/lib/conversation/worklog-engagements";
import { DocumentJournalDraftForm } from "./document-journal-draft-form";

const NOTICE_CLASS =
  "rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning";

export async function DocumentJournalDraftReview({
  locale,
  documentFileId,
}: {
  locale: string;
  documentFileId: string;
}) {
  const t = await getTranslations("documentFiles");
  const draft = await draftJournalSuggestionsFromDocument(documentFileId);

  let body: React.ReactNode;
  if (draft.kind === "ok") {
    const eng = await listWorkLogEngagements();
    if (eng.kind !== "ok" || eng.engagements.length === 0) {
      body = (
        <p className={NOTICE_CLASS} data-testid="doc-journal-draft-notice">
          {t("journalDraft.noEngagement")}
        </p>
      );
    } else {
      const skillCount = draft.suggestions.skillSuggestions.length;
      body = (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            {t("journalDraft.understoodNote", {
              filename: draft.originalFilename,
            })}
          </p>
          {skillCount > 0 ? (
            <p
              className="font-mono text-meta uppercase tracking-label text-text-muted"
              data-testid="doc-journal-draft-skills"
            >
              {t("journalDraft.detectedSkills", { count: skillCount })}
            </p>
          ) : null}
          <DocumentJournalDraftForm
            locale={locale}
            documentFileId={draft.documentFileId}
            initialText={draft.text}
            engagements={eng.engagements}
            defaultEngagementId={eng.resolution.selectedId ?? null}
            labels={{
              notesLabel: t("journalDraft.notesLabel"),
              engagementLabel: t("journalDraft.engagementLabel"),
              save: t("journalDraft.save"),
              saving: t("journalDraft.saving"),
              saved: t("journalDraft.saved"),
              savedLink: t("journalDraft.savedLink"),
              error: t("journalDraft.error"),
            }}
          />
        </div>
      );
    }
  } else {
    const key =
      draft.kind === "refused"
        ? draft.reason === "classified"
          ? "journalDraft.refusedClassified"
          : draft.reason === "image_no_ocr"
            ? "journalDraft.refusedNoOcr"
            : "journalDraft.refusedType"
        : draft.kind === "empty"
          ? "journalDraft.empty"
          : draft.kind === "failed"
            ? "journalDraft.failed"
            : "journalDraft.notFound";
    body = (
      <p className={NOTICE_CLASS} data-testid="doc-journal-draft-notice">
        {t(key as never)}
      </p>
    );
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-ink-600 p-4"
      id="doc-journal-draft"
      data-testid="doc-journal-draft"
    >
      <h2 className="font-display text-lg font-semibold text-text-primary">
        {t("journalDraft.title")}
      </h2>
      {body}
    </section>
  );
}
