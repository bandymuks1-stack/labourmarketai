/**
 * THE STARTED JOURNAL ENTRY SURVIVES A PAGE CHANGE (owner note 2026-11-22).
 *
 * The quick recorder is remounted whenever the person picks another day
 * (`?date=`), opens another page, or leaves the readback to fill in what was
 * missing. The words they typed — and whether they had already asked for the
 * readback — are kept for this browser tab only, until the entry is saved.
 *
 * Tab-scoped `sessionStorage`, never a second store of record: the entry is
 * written only by the one save path (decision 0024). Every access is guarded:
 * a private window or blocked storage simply keeps nothing.
 */

export const QUICK_RECORD_DRAFT_KEY = "lmai:journal-quick-record-draft:v1";

export type QuickRecordDraft = {
  readonly text: string;
  /** The person had asked for the readback ("understand"). */
  readonly understood: boolean;
};

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function store(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readQuickRecordDraft(s: Store | null = store()): QuickRecordDraft | null {
  try {
    const raw = s?.getItem(QUICK_RECORD_DRAFT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { v?: unknown; text?: unknown; understood?: unknown };
    if (v.v !== 1 || typeof v.text !== "string" || v.text.trim().length === 0) return null;
    return { text: v.text.slice(0, 5000), understood: v.understood === true };
  } catch {
    return null;
  }
}

export function writeQuickRecordDraft(draft: QuickRecordDraft, s: Store | null = store()): void {
  try {
    if (draft.text.trim().length === 0) s?.removeItem(QUICK_RECORD_DRAFT_KEY);
    else s?.setItem(QUICK_RECORD_DRAFT_KEY, JSON.stringify({ v: 1, text: draft.text, understood: draft.understood }));
  } catch {
    /* storage refused: nothing kept */
  }
}

export function clearQuickRecordDraft(s: Store | null = store()): void {
  try {
    s?.removeItem(QUICK_RECORD_DRAFT_KEY);
  } catch {
    /* nothing to clear */
  }
}
