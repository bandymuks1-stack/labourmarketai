import { deriveDocumentStatus, type WorkerDocumentRow } from "@/lib/documents/readiness";
import { documentTypesForReadinessItem } from "@/lib/projects/readiness-items";
import {
  assessCapability,
  type CapabilityAssessment,
  type CapabilityEvidence,
} from "@/lib/qualification/capability-standing";

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
  /**
   * REAL WORK, BESIDE THE PAPER — not instead of it.
   *
   * Present only on the row that asks for qualification or SKILL EVIDENCE,
   * and only when the caller supplied the person's recorded evidence. It
   * never changes `own`: a required certificate stays required, and
   * `formalRequirementMet` is the field a deployment decision reads. What it
   * adds is that five years of confirmed work stops rendering as "not
   * recorded" — and names the route (recognition of prior learning) that can
   * actually close the gap.
   */
  readonly capability: CapabilityAssessment | null;
}

export interface OwnReadinessItemLike {
  readonly projectId: string;
  readonly itemKey: string;
  readonly label: string;
  readonly status: "needed" | "missing" | "rejected" | "expired";
}

export type OwnDocumentLike = Pick<
  WorkerDocumentRow,
  "documentTypeSlug" | "storedStatus" | "validUntil" | "verification"
>;

/** How many asks one project line names. */
export const WORKER_PROJECT_ASK_LIMIT = 4;

function rank(s: OwnDocumentState): number {
  return s === "ready" ? 2 : s === "expiring" ? 1 : 0;
}

/** The readiness rows that ask about capability rather than about a document
 *  the person either has or does not. Today exactly one — the row whose own
 *  name already promises to accept skill evidence. */
const CAPABILITY_ITEM_KEYS: ReadonlySet<string> = new Set(["qualification_or_skill_evidence"]);

export function deriveWorkerProjectAsks(
  items: readonly OwnReadinessItemLike[],
  /** The person's own document records; `null` = the documents read did not
   *  answer (disabled / unavailable) — then NO own state is claimed: an
   *  unknown record is not "not recorded". */
  documents: readonly OwnDocumentLike[] | null,
  now: Date,
  /** The person's recorded work evidence. OPTIONAL: a caller that cannot
   *  answer the question gets exactly the previous behaviour, never a guess
   *  in either direction. */
  evidence?: CapabilityEvidence | null,
): Map<string, WorkerProjectAsk[]> {
  const byType = new Map<string, OwnDocumentState>();
  // WHETHER THE BEST RECORD IS VERIFIED. A document the worker recorded
  // themselves answers "do you have it" (`own`); it does NOT meet a FORMAL
  // requirement until an authorized reviewer verified it. Until 2026-09-19
  // `hasValidCredential` was `own === "ready"` — self-recorded paper became
  // `valid_credential` / `formalRequirementMet: true`, the exact self-award
  // the doctrine forbids (SEP-6: demonstrated ≠ formal ≠ valid credential).
  const verifiedByType = new Map<string, boolean>();
  for (const d of documents ?? []) {
    const st = deriveDocumentStatus(d, now);
    const state: OwnDocumentState = st === "ready" ? "ready" : st === "expiring" ? "expiring" : "none";
    const prev = byType.get(d.documentTypeSlug);
    // Best state wins: one ready record answers the row.
    if (!prev || rank(state) > rank(prev)) {
      byType.set(d.documentTypeSlug, state);
      verifiedByType.set(d.documentTypeSlug, d.verification === "verified");
    } else if (rank(state) === rank(prev) && d.verification === "verified") {
      verifiedByType.set(d.documentTypeSlug, true);
    }
  }
  const out = new Map<string, WorkerProjectAsk[]>();
  for (const it of items) {
    const list = out.get(it.projectId) ?? [];
    if (list.length >= WORKER_PROJECT_ASK_LIMIT) continue;
    const slugs = documentTypesForReadinessItem(it.itemKey);
    let own: OwnDocumentState | null = null;
    let ownVerified = false;
    if (slugs.length > 0 && documents !== null) {
      own = "none";
      for (const s of slugs) {
        const st = byType.get(s);
        if (st && rank(st) > rank(own)) {
          own = st;
          ownVerified = verifiedByType.get(s) ?? false;
        } else if (st && rank(st) === rank(own) && verifiedByType.get(s)) {
          ownVerified = true;
        }
      }
    }
    // The capability assessment runs only for the capability row, and only
    // with real evidence in hand. `own` is untouched by it — the formal
    // answer and the real-work answer are two facts side by side.
    const capability =
      evidence && CAPABILITY_ITEM_KEYS.has(it.itemKey)
        ? assessCapability(
            {
              ...evidence,
              // Only a REVIEWER-VERIFIED record is a credential. An
              // unverified one leaves the formal answer where it was —
              // the real-work ladder below still speaks.
              hasValidCredential: own === "ready" && ownVerified,
              hasExpiringCredential: own === "expiring" && ownVerified,
            },
            { formalRequirementRequired: true },
          )
        : null;
    list.push({
      itemKey: it.itemKey,
      label: it.label,
      status: it.status,
      documentTypeSlug: slugs[0] ?? null,
      own,
      capability,
    });
    out.set(it.projectId, list);
  }
  return out;
}

/** The first ask the person can close by recording a document: the chip. */
export function firstRecordableAsk(asks: Iterable<readonly WorkerProjectAsk[]>): WorkerProjectAsk | null {
  for (const list of asks) for (const a of list) if (a.documentTypeSlug && a.own === "none") return a;
  return null;
}
