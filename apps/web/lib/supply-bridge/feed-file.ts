import "server-only";

import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Writing the feed artefact.
 *
 * THE FILE'S EXISTENCE IS THE MEASUREMENT
 * ---------------------------------------------------------------------------
 * The consumer derives `present` from the file BEING THERE, never from its row
 * count:
 *
 *   no file       -> SUPPLY_SOURCE_UNAVAILABLE, matches null  ("we did not look")
 *   file, 0 rows  -> searched: true, matches 0                ("we hold nobody")
 *   file, rows    -> searched: true, matches n
 *
 * So an EMPTY feed must still be written — it is a measurement — and a failed
 * read must NOT be written, because truncating the file to zero would state a
 * measurement that was never made. `writeFeedFile` therefore takes a body of
 * `string | null` and does nothing at all with null: the previous file, whose
 * `expiresAtIso` values will age out on their own, is left in place rather than
 * replaced with a false zero.
 *
 * WHOLE-FILE, ATOMIC, IDEMPOTENT
 * ---------------------------------------------------------------------------
 * The file is a DERIVED VIEW OF CURRENT CONSENT STATE, not a log. It is rebuilt
 * whole every time, so a withdrawn consent DISAPPEARS rather than being
 * appended as a tombstone — a tombstone would still be a row about a person who
 * asked to stop being a row.
 *
 * The write is temp-file + rename, which is atomic within a filesystem: a
 * reader polling the path sees the old complete file or the new complete file,
 * never a half-written one that parses as fewer people than we hold.
 */

export const FEED_RELATIVE_DIR = join("runtime", "labourmarket-supply");
export const FEED_FILENAME = "first-party-supply-feed.jsonl";

/** The path the consumer expects, resolved against a repo or deployment root. */
export function feedPathFor(root: string): string {
  return join(root, FEED_RELATIVE_DIR, FEED_FILENAME);
}

export type FeedWriteResult =
  | { readonly kind: "written"; readonly path: string; readonly bytes: number }
  /** Nothing was written and nothing was destroyed. */
  | { readonly kind: "skipped-unavailable"; readonly reason: string };

export function writeFeedFile(
  targetPath: string,
  body: string | null,
  unavailableReason: string | null,
): FeedWriteResult {
  if (body === null) {
    return {
      kind: "skipped-unavailable",
      reason: unavailableReason
        ?? "the canonical read did not complete; the previous feed was left untouched",
    };
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  const temp = `${targetPath}.tmp`;
  try {
    writeFileSync(temp, body, { encoding: "utf8" });
    renameSync(temp, targetPath);
  } catch (cause) {
    // Never leave a partial temp file that a later run might mistake for state.
    try {
      rmSync(temp, { force: true });
    } catch {
      // The cleanup failing must not mask the real error below.
    }
    throw cause;
  }
  return { kind: "written", path: targetPath, bytes: Buffer.byteLength(body, "utf8") };
}
