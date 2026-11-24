/**
 * Automatic internal matching on demand — the PURE half (no IO, no
 * "server-only"): the idempotency fingerprint, the receipt shape and its
 * reader. The IO half is `auto-match.ts`.
 *
 * WHAT THIS PROVES, AND ONLY THAT. A receipt says: "on <time>, the existing
 * deterministic match-v1 engine was run over the relevant candidates already in
 * LabourMarket.ai for this need, and it evaluated N and found M". It says
 * nothing about candidates outside the platform, and nothing about a contact
 * having been made — no message, invitation or notification is ever sent.
 *
 * STORAGE: the receipt rides `customer_requests.payload.auto_match_receipt`
 * (an existing jsonb column the employer already owns). No migration. The key
 * is NOT in the worker-RPC payload whitelist, so a worker never sees it.
 */
import { createHash } from "node:crypto";

/** Bump when match-v1 / retrieval / actionability semantics change: every
 *  demand then re-matches once on its next publish-class event. */
export const AUTO_MATCH_MATCHER_VERSION = "match-v1/scouting-core-1";
export const AUTO_MATCH_PAYLOAD_KEY = "auto_match_receipt";
/** Anonymised result references kept on the receipt. */
export const AUTO_MATCH_TOP_N = 10;

export type AutoMatchStatus =
  | "completed"
  /** Ran fine, the need is structured, nobody relevant yet. */
  | "no_candidates"
  /** Nothing derivable from the need text — honest, nothing was matched. */
  | "not_structured"
  /** The matcher threw / returned an error. Recorded, publish unaffected. */
  | "failed";

export interface AutoMatchReceipt {
  readonly version: 1;
  readonly demandId: string;
  readonly organizationId: string;
  /** Hash of the matching-relevant fields + matcher version (idempotency key). */
  readonly inputHash: string;
  readonly matcherVersion: string;
  readonly trigger: "submit" | "reopen" | "confirm";
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly status: AutoMatchStatus;
  /** Candidates actually evaluated (the retrieval pool). Null = not measured. */
  readonly poolSize: number | null;
  /** True when more candidates existed than the per-run cap allowed. */
  readonly poolCapped: boolean | null;
  /** Candidates that reached the employer-actionable list. Null = not measured. */
  readonly matchCount: number | null;
  /** Of those, how many the engine rates strong or possible. */
  readonly relevantCount: number | null;
  /** Anonymised, non-reversible per-demand references to the top results
   *  (sha256(demandId:workerId) prefix). The live, consent-gated list is the
   *  scouting page itself; ids of workers are never copied into the receipt. */
  readonly topRefs: readonly string[];
  /** Short non-sensitive error class when status = failed. */
  readonly errorCode: string | null;
}

/** The columns that feed the matcher (mirrors NeedSourceRow + status). */
export interface AutoMatchInputRow {
  readonly title: string | null;
  readonly need_summary: string | null;
  readonly role_or_work_type: string | null;
  readonly notes: string | null;
  readonly country: string | null;
  readonly location: string | null;
  readonly language_requirement: string | null;
  readonly payload: unknown;
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .filter((k) => o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

/** Payload with the receipt key removed — writing a receipt must never change
 *  the fingerprint it is keyed on (that would be an infinite re-run). */
export function payloadWithoutReceipt(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload ?? null;
  const { [AUTO_MATCH_PAYLOAD_KEY]: _omit, ...rest } = payload as Record<string, unknown>;
  void _omit;
  return rest;
}

export function autoMatchInputHash(row: AutoMatchInputRow): string {
  return createHash("sha256")
    .update(
      stableStringify({
        v: AUTO_MATCH_MATCHER_VERSION,
        title: row.title ?? null,
        need_summary: row.need_summary ?? null,
        role: row.role_or_work_type ?? null,
        notes: row.notes ?? null,
        country: row.country ?? null,
        location: row.location ?? null,
        lang: row.language_requirement ?? null,
        payload: payloadWithoutReceipt(row.payload),
      }),
    )
    .digest("hex");
}

/** Anonymous, per-demand reference. Not reversible, not comparable across demands. */
export function anonymisedResultRef(demandId: string, workerId: string): string {
  return createHash("sha256").update(`${demandId}:${workerId}`).digest("hex").slice(0, 12);
}

const STATUSES: ReadonlySet<string> = new Set(["completed", "no_candidates", "not_structured", "failed"]);

/** Defensive reader: anything malformed is "no receipt", never a throw. */
export function readAutoMatchReceipt(payload: unknown): AutoMatchReceipt | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const r = (payload as Record<string, unknown>)[AUTO_MATCH_PAYLOAD_KEY];
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const o = r as Record<string, unknown>;
  if (
    typeof o.inputHash !== "string" ||
    typeof o.matcherVersion !== "string" ||
    typeof o.finishedAt !== "string" ||
    typeof o.status !== "string" ||
    !STATUSES.has(o.status)
  ) {
    return null;
  }
  return o as unknown as AutoMatchReceipt;
}

/** Re-use rule: identical input + matcher version + a terminal non-failed
 *  outcome. A failed run is retried on the next event (still once per event). */
export function isReceiptCurrent(receipt: AutoMatchReceipt | null, inputHash: string): boolean {
  return (
    receipt !== null &&
    receipt.inputHash === inputHash &&
    receipt.matcherVersion === AUTO_MATCH_MATCHER_VERSION &&
    receipt.status !== "failed"
  );
}
