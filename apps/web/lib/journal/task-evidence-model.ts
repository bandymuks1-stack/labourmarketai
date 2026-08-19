/**
 * Task evidence model (field-work operating platform audit v1, §6 P0 train).
 *
 * Pure model for the Work Journal ↔ work_task evidence link — shared by the
 * server read service, the server actions, the guard test and the tasks page.
 * No server-only imports, no IO.
 *
 * WHAT THIS IS FOR. The audit measured, on production, that the Work Journal
 * is the only execution engine with real data (36 entries, 8 photos, 12
 * manager confirmations) while `work_tasks` sits at zero — because finishing
 * a task produced nothing durable. This model types the link that closes
 * that chain: an EXISTING journal entry declares itself evidence for a task.
 *
 * WHAT THIS IS NOT. It is not a second evidence store. Evidence is still born
 * in the journal, still append-only, still hash-chained, still confirmed by a
 * manager through the existing journal confirmation path. Nothing here can
 * create, edit or approve an entry — it only records "this proves that".
 *
 * HONESTY RULES pinned by lib/guards/task-evidence-link.test.ts:
 *   - The link is ALWAYS optional. A journal entry never requires a task, and
 *     a task never requires evidence. No surface may imply otherwise.
 *   - Confirmation state is READ from the journal, never inferred here. An
 *     unconfirmed entry is displayed as unconfirmed; linking does not promote
 *     it (§7 — AI/automation never fabricates a verification).
 *   - A withdrawn link (unlinked_at) is never counted as evidence, and the
 *     withdrawal is never hidden (§4.3 revocation is a record).
 */

/** Contract mirrored from the migration's return values (one contract). */
export const LINK_RESULT_CODES = [
  "ok",
  "already_linked",
  "not_found",
  "not_allowed",
  "invalid",
  "limit_reached",
  "entry_not_current",
  "already_unlinked",
] as const;
export type LinkResultCode = (typeof LINK_RESULT_CODES)[number];

export function isLinkResultCode(v: string): v is LinkResultCode {
  return (LINK_RESULT_CODES as readonly string[]).includes(v);
}

/** Result codes the user should read as "it worked" (idempotent included). */
const SUCCESS_CODES: readonly LinkResultCode[] = ["ok", "already_linked"];

export function isLinkSuccess(code: LinkResultCode): boolean {
  return SUCCESS_CODES.includes(code);
}

/** i18n leaf for a result code — one naming source for every surface. */
export function linkResultMessageKey(code: LinkResultCode): string {
  return `tasks.evidence.result.${code}`;
}

/** Bounds mirrored from the migration (single contract, both sides). */
export const MAX_EVIDENCE_PER_TASK = 200;
export const MAX_TASKS_PER_ENTRY = 20;
/** Bounded reads everywhere — evidence lists never stream unbounded rows. */
export const TASK_EVIDENCE_READ_LIMIT = 100;
/** How many of the worker's recent entries are offered as linkable. */
export const LINKABLE_ENTRY_LIMIT = 25;
export const UNLINK_REASON_MAX = 500;

/**
 * One piece of evidence attached to a task: a journal entry, as it really
 * is. `confirmedAt` comes from journal_entry_confirmations — this model
 * never derives or upgrades confirmation state.
 */
export type TaskEvidenceItem = {
  readonly linkId: string;
  readonly entryId: string;
  /** The entry author's worker id (opaque — no name crosses this boundary). */
  readonly workerId: string;
  /** Entry text, exactly as authored (§2 — original text is the record). */
  readonly originalText: string;
  readonly originalLanguage: string;
  readonly entryCreatedAt: string;
  readonly linkedAt: string;
  readonly linkedBy: string | null;
  readonly photoCount: number;
  /** Manager confirmation timestamp, or null when not confirmed. */
  readonly confirmedAt: string | null;
};

/** What a task's evidence adds up to. Counts only — never a score (§19a). */
export type TaskEvidenceSummary = {
  readonly total: number;
  readonly confirmed: number;
  readonly unconfirmed: number;
  readonly withPhotos: number;
};

export const ZERO_EVIDENCE_SUMMARY: TaskEvidenceSummary = {
  total: 0,
  confirmed: 0,
  unconfirmed: 0,
  withPhotos: 0,
};

/**
 * Derive the summary from a bounded evidence list (pure).
 *
 * Deliberately NOT a percentage and NOT a readiness score: a task is not
 * "80% proven". It has N pieces of evidence, of which M are manager-confirmed.
 * §19 forbids a context-free percentage; §7 forbids implying a verification
 * nobody performed.
 */
export function deriveEvidenceSummary(
  items: readonly Pick<TaskEvidenceItem, "confirmedAt" | "photoCount">[],
): TaskEvidenceSummary {
  let confirmed = 0;
  let withPhotos = 0;
  for (const i of items) {
    if (i.confirmedAt !== null) confirmed++;
    if (i.photoCount > 0) withPhotos++;
  }
  return {
    total: items.length,
    confirmed,
    unconfirmed: items.length - confirmed,
    withPhotos,
  };
}

/** A journal entry the caller could attach to this task. */
export type LinkableEntry = {
  readonly entryId: string;
  readonly originalText: string;
  readonly createdAt: string;
  readonly photoCount: number;
  /** True when this entry is ALREADY live-linked to the task in question. */
  readonly alreadyLinked: boolean;
};

/**
 * Read results — the tasks-page discriminant style. "needs-migration" is a
 * calm product state, never an error surface: while the owner-gated migration
 * is unapplied the surface says so plainly and shows nothing fabricated.
 */
export type TaskEvidenceResult =
  | { readonly status: "not-authed" }
  | { readonly status: "needs-migration" }
  | {
      readonly status: "ok";
      readonly items: readonly TaskEvidenceItem[];
      readonly summary: TaskEvidenceSummary;
    };

/** A short, non-identifying preview of an entry for a compact list row. */
export function evidencePreview(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}
