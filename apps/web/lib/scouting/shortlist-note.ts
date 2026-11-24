/**
 * Shortlist note — PURE pieces (Canonical Ideas Integration v1, extension B).
 *
 * The demand_shortlist table has carried a `note text <= 2000` column since
 * migration 20260612220000, but nothing ever wrote or read it. This module
 * gives the note its rules; the server flow (scouting.ts setShortlist) and
 * the UI both consume THESE definitions — one truth, zero schema change.
 *
 * PRIVACY: the note is INTERNAL to the deciding company. demand_shortlist
 * RLS SELECT is `owner_id = auth.uid() or is_admin()` — the worker can never
 * read shortlist rows, so the note never reaches a worker. Worker-safe
 * plain-language wording is still required by the UI hint (decency, and the
 * company's own future reference).
 *
 * DECISION REASON: marking a candidate `not_fit` REQUIRES a short reason —
 * an unexplained rejection is dead information for the company's own later
 * review. Enforced server-side (never trusted to the client).
 */

import type { ShortlistStatus } from "@/lib/scouting/scout-safe-view";

/** Mirrors the DB CHECK on demand_shortlist.note (char_length <= 2000). */
export const SHORTLIST_NOTE_MAX = 2000;

/** Trim + bound; empty → null (never stores whitespace padding). */
export function cleanShortlistNote(note: string | null | undefined): string | null {
  const trimmed = (note ?? "").trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, SHORTLIST_NOTE_MAX);
}

export type ShortlistWriteValidation =
  | {
      kind: "ok";
      /** Cleaned note to write, or undefined ⇒ leave the stored note as-is. */
      note: string | null | undefined;
    }
  | { kind: "reason-required" };

/**
 * Validate one shortlist write. `note === undefined` means "not provided" —
 * the existing stored note is preserved. `not_fit` requires a reason: either
 * a non-empty note in THIS write or an already-stored one on the row.
 */
export function validateShortlistWrite(input: {
  status: ShortlistStatus;
  note: string | null | undefined;
  existingNote: string | null;
}): ShortlistWriteValidation {
  const provided = input.note === undefined ? undefined : cleanShortlistNote(input.note);
  if (input.status === "not_fit") {
    const effective = provided !== undefined ? provided : input.existingNote;
    if (effective === null || effective === "") {
      return { kind: "reason-required" };
    }
  }
  return { kind: "ok", note: provided };
}
