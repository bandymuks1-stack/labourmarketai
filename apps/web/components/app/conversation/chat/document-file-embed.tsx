"use client";

import { useRef, useState } from "react";

import { uploadWorkerDocumentFileForChatAction } from "@/lib/documents/document-file-actions";
import {
  DOCUMENT_FILE_MAX_BYTES,
  DOCUMENT_FILE_MIME_TYPES,
  type DocumentEngineNotice,
} from "@/lib/documents/document-file-model";

export type DocumentFileEmbedLabels = {
  readonly choose: string;
  readonly submit: string;
  readonly uploading: string;
  readonly skip: string;
  readonly tooLarge: string;
  readonly unsupported: string;
  readonly failed: string;
};

/**
 * The document FILE, offered in the thread right after a sentence recorded
 * the document (owner contract 2026-09-04 §5.5 — chat-first, not chat-only).
 * ONE write: `uploadWorkerDocumentFileForChatAction` runs the same core as
 * the documents page's slot (same ownership check, canonical path, register
 * RPC, rollback). The outcome shown is the REAL notice the core returned —
 * never an optimistic "uploaded". One file per embed; a further version is
 * another sentence or the documents page, exactly as before.
 */
export function DocumentFileEmbed({
  documentId,
  labels,
  onUploaded,
  onSkip,
}: {
  documentId: string;
  labels: DocumentFileEmbedLabels;
  /** Called ONLY after the core said "uploaded". */
  onUploaded: () => void;
  onSkip: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const noticeText = (notice: DocumentEngineNotice): string => {
    if (notice === "file_too_large") return labels.tooLarge;
    if (notice === "unsupported_type") return labels.unsupported;
    return labels.failed;
  };

  const pick = (picked: File | null) => {
    setError(null);
    if (!picked) {
      setFile(null);
      return;
    }
    // Same pre-checks the server repeats authoritatively — a wrong pick is
    // named before any bytes travel.
    if (!(DOCUMENT_FILE_MIME_TYPES as readonly string[]).includes(picked.type)) {
      setFile(null);
      setError(labels.unsupported);
      return;
    }
    if (picked.size > DOCUMENT_FILE_MAX_BYTES) {
      setFile(null);
      setError(labels.tooLarge);
      return;
    }
    setFile(picked);
  };

  const submit = async () => {
    if (!file || pending || done) return;
    setPending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("workerDocumentId", documentId);
      fd.set("file", file);
      const res = await uploadWorkerDocumentFileForChatAction(fd);
      if (res.notice === "uploaded") {
        setDone(true);
        onUploaded();
      } else {
        setError(noticeText(res.notice));
      }
    } catch {
      setError(labels.failed);
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3"
      data-testid="doc-file-embed"
      data-document-id={documentId}
      data-state={done ? "uploaded" : pending ? "uploading" : "idle"}
    >
      <label className="text-support text-text-muted" htmlFor="doc-file-embed-input">
        {labels.choose}
      </label>
      <input
        id="doc-file-embed-input"
        ref={inputRef}
        type="file"
        accept={(DOCUMENT_FILE_MIME_TYPES as readonly string[]).join(",")}
        disabled={pending || done}
        data-testid="doc-file-input"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
        className="text-meta text-text-secondary file:mr-3 file:rounded-md file:border file:border-ink-500 file:bg-ink-700 file:px-3 file:py-1.5 file:text-meta file:text-text-primary"
      />
      {error ? (
        <p className="text-meta text-state-danger" role="alert" data-testid="doc-file-error">
          {error}
        </p>
      ) : null}
      {done ? null : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!file || pending}
            data-testid="doc-file-submit"
            className="rounded-md bg-brand-blue px-3 py-1.5 text-meta font-medium text-white disabled:opacity-50"
          >
            {pending ? labels.uploading : labels.submit}
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={pending}
            data-testid="doc-file-skip"
            className="rounded-md border border-ink-500 px-3 py-1.5 text-meta text-text-secondary"
          >
            {labels.skip}
          </button>
        </div>
      )}
    </div>
  );
}
