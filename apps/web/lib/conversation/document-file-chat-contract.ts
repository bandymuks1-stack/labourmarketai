/**
 * Client-safe contract for the document FILE step of the chat's "record a
 * document" flow (owner contract 2026-09-04 §5.5 / §12 — chat-first, not
 * chat-only; one backbone). Types only — the server module is
 * `document-file-chat.ts`.
 */
export type DocumentFileTargetForChat =
  /** The document row the sentence just recorded, with its file layer
   *  answering — the chat may offer the file right here. `versionCount` is
   *  the REAL count on the row (0 = no file yet), never a guess. */
  | {
      readonly kind: "ready";
      readonly documentId: string;
      readonly versionCount: number;
    }
  /** The file layer did not answer here (migration absent / read failed) —
   *  the chat says nothing about files rather than offering a dead control. */
  | { readonly kind: "unavailable" }
  /** No own document row matches the recorded type + country. */
  | { readonly kind: "not_found" };
