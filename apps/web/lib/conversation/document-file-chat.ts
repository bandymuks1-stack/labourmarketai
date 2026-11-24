"use server";

import "server-only";

import { getWorkerDocumentFiles } from "@/lib/documents/document-files";
import { listMyDocuments } from "@/lib/documents/readiness";

import type { DocumentFileTargetForChat } from "./document-file-chat-contract";

/**
 * After the sentence recorded a document (`worker.add-document` →
 * `upsert_worker_document`), find THAT row among the caller's own documents
 * and ask the same file layer the documents page asks whether a file can be
 * attached here. Same reads (`listMyDocuments`, `getWorkerDocumentFiles`),
 * same availability rule: no answer from the file layer → no file control in
 * the chat. The caller's identity is resolved server-side inside both reads;
 * nothing here takes a worker id from the client.
 */
export async function loadDocumentFileTargetForChat(input: {
  typeSlug: string;
  country: string | null;
}): Promise<DocumentFileTargetForChat> {
  const typeSlug = String(input.typeSlug ?? "").trim();
  const country = String(input.country ?? "").trim() || null;
  if (typeSlug === "") return { kind: "not_found" };

  const docs = await listMyDocuments();
  if (docs.kind !== "ok") return { kind: "unavailable" };

  const row =
    docs.documents.find(
      (d) => d.documentTypeSlug === typeSlug && (d.country ?? null) === country,
    ) ??
    // A row recorded without a country matches a type-only sentence.
    (country === null
      ? docs.documents.find((d) => d.documentTypeSlug === typeSlug)
      : undefined);
  if (!row) return { kind: "not_found" };

  const files = await getWorkerDocumentFiles([row.id]);
  if (!files.available) return { kind: "unavailable" };
  const info = files.byDocument.get(row.id);
  return {
    kind: "ready",
    documentId: row.id,
    versionCount: info?.versionCount ?? 0,
  };
}
