import type { WorkVerificationState } from "@/lib/journal/work-verification-state";

/**
 * THE EVIDENCE CHAIN — one visual grammar for "how far has this work got?",
 * shared by the Journal, Professional Identity, Projects, Teams, the Living CV
 * and Reports (premium completion mission §8).
 *
 *   RECORDED → PHOTO → MANAGER'S RECORD → IN YOUR HISTORY
 *
 * It is a PROJECTION of states the backend already has — it adds none:
 *   · the recorded entry                      (always: a chain exists only for a record)
 *   · uploaded photos on the entry            (a count, or UNKNOWN when it could not be read)
 *   · `WorkVerificationState`                 (the journal's own verification ladder)
 *
 * It never overclaims, and it keeps the repository's separations:
 *   · EVIDENCE ≠ VERIFICATION (SEP-3): a photo is evidence; only a decision by
 *     somebody else is a manager's record. A self-confirmation is shown as the
 *     person's own (`own`), never as a manager's record.
 *   · UNKNOWN ≠ ZERO (SEP-7): an unreadable photo count is `unknown`, never
 *     `absent`; a state that cannot be known is never drawn as "not done".
 *   · `returned` / `disputed` are `attention` — the record is not withdrawn; it
 *     needs the person's answer.
 *
 * Pure. Presentation only: nothing here changes what the entry IS.
 */

export const CHAIN_NODES = ["recorded", "photo", "manager", "history"] as const;
export type ChainNodeKey = (typeof CHAIN_NODES)[number];

/**
 * done      — it happened (solid node + check glyph)
 * waiting   — in somebody's queue now (dashed ring + clock glyph)
 * absent    — has not happened (dashed ring + dash glyph); NOT a failure
 * attention — needs the person's answer (amber ring + alert glyph)
 * unknown   — cannot be read (dotted ring + "?" glyph); NOT zero
 */
export type ChainNodeStatus = "done" | "waiting" | "absent" | "attention" | "unknown";

export interface ChainNode {
  readonly key: ChainNodeKey;
  readonly status: ChainNodeStatus;
  /** `own`: done, but by the person themselves — real, never a manager's. */
  readonly own?: boolean;
}

export interface EvidenceChainModel {
  readonly nodes: readonly ChainNode[];
  /** The verification state the chain was derived from (for data attributes). */
  readonly verification: WorkVerificationState;
}

export function deriveEvidenceChain(input: {
  readonly verification: WorkVerificationState;
  /** Uploaded photos on the entry; `null` = could not be read (UNKNOWN). */
  readonly photoCount: number | null;
}): EvidenceChainModel {
  const { verification, photoCount } = input;

  const photo: ChainNode =
    photoCount === null
      ? { key: "photo", status: "unknown" }
      : photoCount > 0
        ? { key: "photo", status: "done" }
        : { key: "photo", status: "absent" };

  let manager: ChainNode;
  switch (verification) {
    case "verified":
      manager = { key: "manager", status: "done" };
      break;
    case "self_confirmed":
      manager = { key: "manager", status: "done", own: true };
      break;
    case "verification_pending":
      manager = { key: "manager", status: "waiting" };
      break;
    case "returned":
    case "disputed":
      manager = { key: "manager", status: "attention" };
      break;
    // Nobody could confirm yet (no organization / path not switched on / not
    // applicable) — the honest "not yet", never a failure.
    case "self_reported":
    case "verifier_not_identified":
    case "verifier_available":
    case "not_applicable":
      manager = { key: "manager", status: "absent" };
      break;
  }

  // The record counts toward the person's history once someone — a manager,
  // or the person themselves — stands behind it. Self-confirmed counts, drawn
  // as `own` so it is never mistaken for a manager's word.
  const inHistory =
    verification === "verified" || verification === "self_confirmed";
  const history: ChainNode = inHistory
    ? { key: "history", status: "done", own: verification === "self_confirmed" }
    : { key: "history", status: manager.status === "attention" ? "waiting" : "absent" };

  return {
    verification,
    nodes: [{ key: "recorded", status: "done" }, photo, manager, history],
  };
}
