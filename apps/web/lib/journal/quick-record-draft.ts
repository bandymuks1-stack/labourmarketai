/**
 * THE STARTED JOURNAL ENTRY SURVIVES A PAGE CHANGE (owner note 2026-11-22).
 *
 * The quick recorder is remounted whenever the person picks another day
 * (`?date=`), opens another page, or leaves the readback to fill in what was
 * missing. The words they typed — and whether they had already asked for the
 * readback — are kept for this browser tab only, until the entry is saved.
 *
 * BOUND TO THE PERSON AND THE WORKSPACE (decision 0024, review on #3574): the
 * draft carries its owner, `<user id>:<workspace id>`, and is restored only
 * for that same owner and for 30 minutes; anything else is dropped, so on a
 * shared device the next account never sees the previous person's words.
 * Every sign-out removes it (`components/app/intake-draft-sign-out-clear.tsx`).
 *
 * Tab-scoped `sessionStorage`, never a second store of record: the entry is
 * written only by the one save path. Every access is guarded: a private
 * window or blocked storage simply keeps nothing.
 */

export const QUICK_RECORD_DRAFT_KEY = "lmai:journal-quick-record-draft:v2";
/** The unbound first version (never restored; removed on sight). */
const LEGACY_KEY = "lmai:journal-quick-record-draft:v1";
/** How long a kept draft may be restored. */
export const QUICK_RECORD_DRAFT_TTL_MS = 30 * 60 * 1000;

export type QuickRecordDraft = {
  readonly text: string;
  /** The person had asked for the readback ("understand"). */
  readonly understood: boolean;
};

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The draft's owner: the signed-in person in the workspace they act for. */
export function quickRecordDraftOwner(userId: string, workspaceId: string | null): string {
  return `${userId}:${workspaceId ?? "personal"}`;
}

function store(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readQuickRecordDraft(
  owner: string,
  s: Store | null = store(),
  now: number = Date.now(),
): QuickRecordDraft | null {
  try {
    s?.removeItem(LEGACY_KEY);
    const raw = s?.getItem(QUICK_RECORD_DRAFT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { v?: unknown; owner?: unknown; at?: unknown; text?: unknown; understood?: unknown };
    const fresh = typeof v.at === "number" && now - v.at >= 0 && now - v.at <= QUICK_RECORD_DRAFT_TTL_MS;
    if (v.v !== 2 || v.owner !== owner || !owner || !fresh || typeof v.text !== "string" || v.text.trim().length === 0) {
      s?.removeItem(QUICK_RECORD_DRAFT_KEY);
      return null;
    }
    return { text: v.text.slice(0, 5000), understood: v.understood === true };
  } catch {
    return null;
  }
}

export function writeQuickRecordDraft(
  owner: string,
  draft: QuickRecordDraft,
  s: Store | null = store(),
  now: number = Date.now(),
): void {
  try {
    if (!owner || draft.text.trim().length === 0) s?.removeItem(QUICK_RECORD_DRAFT_KEY);
    else
      s?.setItem(
        QUICK_RECORD_DRAFT_KEY,
        JSON.stringify({ v: 2, owner, at: now, text: draft.text, understood: draft.understood }),
      );
  } catch {
    /* storage refused: nothing kept */
  }
}

export function clearQuickRecordDraft(s: Store | null = store()): void {
  try {
    s?.removeItem(QUICK_RECORD_DRAFT_KEY);
    s?.removeItem(LEGACY_KEY);
  } catch {
    /* nothing to clear */
  }
}
