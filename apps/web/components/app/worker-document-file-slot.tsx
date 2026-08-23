import { getTranslations } from "next-intl/server";

import { uploadWorkerDocumentFileAction } from "@/lib/documents/document-file-actions";
import {
  DOCUMENT_FILE_MIME_TYPES,
  type DocumentFileRow,
} from "@/lib/documents/document-file-model";
import type { WorkerDocumentFileInfo } from "@/lib/documents/document-files";
import { isExtractableDocumentMime } from "@/lib/journal/document-journal-draft-model";

/**
 * Per-document file controls on the worker documents page (Document &
 * Evidence Engine v1). Renders ONLY when the file layer really answered
 * (`getWorkerDocumentFiles` → available) — otherwise the page keeps its
 * honest "file upload is not available yet" note and this component is
 * never mounted.
 *
 * Native-nav form: the upload posts a server action and the redirect
 * notice is the feedback (the established bookings-page pattern). A new
 * upload on a document that already has a file creates a NEW VERSION —
 * stated in the copy; nothing is overwritten or deleted.
 */

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function DownloadLink({
  file,
  label,
}: {
  file: DocumentFileRow;
  label: string;
}) {
  return (
    <a
      href={`/api/documents/file/${file.id}`}
      className="font-mono text-meta uppercase tracking-label text-brand-blue underline-offset-2 hover:underline"
      data-testid="doc-file-download"
    >
      {label}
    </a>
  );
}

export async function WorkerDocumentFileSlot({
  locale,
  workerDocumentId,
  info,
}: {
  locale: string;
  workerDocumentId: string;
  info: WorkerDocumentFileInfo;
}) {
  const t = await getTranslations("documentFiles");
  const accept = (DOCUMENT_FILE_MIME_TYPES as readonly string[]).join(",");

  return (
    <div
      className="flex w-full flex-wrap items-center gap-2 border-t border-ink-600 pt-2"
      data-testid="doc-file-slot"
    >
      {info.current ? (
        <span className="flex flex-wrap items-center gap-2">
          <span
            className="font-mono text-meta uppercase tracking-label text-text-muted"
            data-testid="doc-file-current"
          >
            {t("currentVersion", { n: info.current.version })} ·{" "}
            {info.current.originalFilename} ·{" "}
            {formatBytes(info.current.byteSize)}
          </span>
          <DownloadLink file={info.current} label={t("download")} />
          {/* C2b — structure this document into a journal draft. Rendered
              only for types the deterministic extractor can honestly read
              (pdf/docx); images get no dead link — no OCR exists (§18). */}
          {isExtractableDocumentMime(info.current.mimeType) ? (
            <a
              href={`/${locale}/dashboard/documents?draftFrom=${info.current.id}#doc-journal-draft`}
              className="font-mono text-meta uppercase tracking-label text-brand-blue underline-offset-2 hover:underline"
              data-testid="doc-file-journal-draft"
            >
              {t("journalDraft.action")}
            </a>
          ) : null}
        </span>
      ) : (
        <span className="text-meta text-text-muted" data-testid="doc-file-none">
          {t("noFileYet")}
        </span>
      )}
      <form
        action={uploadWorkerDocumentFileAction}
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="workerDocumentId" value={workerDocumentId} />
        <label className="flex flex-wrap items-center gap-2 text-meta text-text-secondary">
          <span className="sr-only">{t("upload.fileLabel")}</span>
          <input
            type="file"
            name="file"
            required
            accept={accept}
            className="max-w-full text-meta text-text-secondary file:mr-2 file:rounded-md file:border file:border-ink-500 file:bg-ink-800/40 file:px-2 file:py-1 file:text-meta file:text-text-secondary"
            data-testid="doc-file-input"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-brand-blue/50 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-brand-blue transition-colors hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          data-testid="doc-file-upload-submit"
        >
          {info.current ? t("upload.newVersion") : t("upload.submit")}
        </button>
      </form>
      <span className="text-meta text-text-muted">
        {t("upload.limits")}
        {info.current ? ` ${t("upload.versionNote")}` : ""}
      </span>
    </div>
  );
}
