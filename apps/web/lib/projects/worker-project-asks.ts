import { deriveDocumentStatus, type WorkerDocumentRow } from "@/lib/documents/readiness";
import { documentTypesForReadinessItem } from "@/lib/projects/readiness-items";

/**
 * WHAT THE PROJECT STILL NEEDS FROM ME: pure derivation (owner contract §11
 * / §12 / §16, the PERSON's side of the readiness journey).
 *
 * Joins the manager's open checklist rows for this person (the project's
 * truth, verbatim labels) with the person's OWN document records (their
 * truth) through the readiness-item to document-type map. Neither truth is
 * moved or copied: the answer says "the manager still needs X: you have it /
 * it is expiring / it is not recorded", and the corrective action is the
 * SAME add-document flow the documents page and the sentence use. No IO.
 */
export type OwnDocumentState = "ready" | "expiring" | "none";

export interface WorkerProjectAsk {
  readonly itemKey: string;
  /** The manager's stored label, shown verbatim, never re-labelled. */
  readonly label: string;
  readonly status: "needed" | "missing" | "rejected" | "expired";
  /** The first canonical document type that would answer the row; null when
   *  the row is not a document (a briefing, availability, a client rule). */
  readonly documentTypeSlug: string | null;
  /** The person's own state for that document type; null for non-document rows. */
  readonly own: OwnDocumentState | null;
}

export interface OwnReadinessItemLike {
  readonly projectId: string;
  readonly itemKey: string;
  readonly label: string;
  readonly status: "needed" | "missing" | "rejected" | "expired";
}

export type OwnDocumentLike = Pick<WorkerDocumentRow, "documentTypeSlug" | "storedStatus" | "validUntil">;

/** How many asks one project line names. */
export const WORKER_PROJECT_ASK_LIMIT = 4;

function rank(s: OwnDocumentState): number {
  return s === "ready" ? 2 : s === "expiring" ? 1 : 0;
}

export function deriveWorkerProjectAsks(
  items: readonly OwnReadinessItemLike[],
  /** The person's own document records; `null` = the documents read did not
   *  answer (disabled / unavailable) — then NO own state is claimed: an
   *  unknown record is not "not recorded". */
  documents: readonly OwnDocumentLike[] | null,
  now: Date,
): Map<string, WorkerProjectAsk[]> {
  const byType = new Map<string, OwnDocumentState>();
  for (const d of documents ?? []) {
    const st = deriveDocumentStatus(d, now);
    const state: OwnDocumentState = st === "ready" ? "ready" : st === "expiring" ? "expiring" : "none";
    const prev = byType.get(d.documentTypeSlug);
    // Best state wins: one ready record answers the row.
    if (!prev || rank(state) > rank(prev)) byType.set(d.documentTypeSlug, state);
  }
  const out = new Map<string, WorkerProjectAsk[]>();
  for (const it of items) {
    const list = out.get(it.projectId) ?? [];
    if (list.length >= WORKER_PROJECT_ASK_LIMIT) continue;
    const slugs = documentTypesForReadinessItem(it.itemKey);
    let own: OwnDocumentState | null = null;
    if (slugs.length > 0 && documents !== null) {
      own = "none";
      for (const s of slugs) {
        const st = byType.get(s);
        if (st && rank(st) > rank(own)) own = st;
      }
    }
    list.push({ itemKey: it.itemKey, label: it.label, status: it.status, documentTypeSlug: slugs[0] ?? null, own });
    out.set(it.projectId, list);
  }
  return out;
}

/** The first ask the person can close by recording a document: the chip. */
export function firstRecordableAsk(asks: Iterable<readonly WorkerProjectAsk[]>): WorkerProjectAsk | null {
  for (const list of asks) for (const a of list) if (a.documentTypeSlug && a.own === "none") return a;
  return null;
}
