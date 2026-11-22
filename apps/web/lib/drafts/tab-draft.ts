/**
 * TYPED WORDS SURVIVE AN ERROR, A RELOAD OR A SIGN-IN AGAIN (owner P0
 * 2026-11-22: no lost drafts or entries on errors).
 *
 * One small tab store for text a person is still writing, beside the journal
 * quick record's own draft (`lib/journal/quick-record-draft.ts`) and with the
 * same rules (decision 0024):
 *   - bound to its OWNER (`<user id>:<workspace id>`, or a page-scoped key
 *     for a signed-out form) and restored only for that same owner;
 *   - kept for 30 minutes, then dropped;
 *   - tab-scoped `sessionStorage`, never a second store of record: the text
 *     becomes a record only through the surface's one save path;
 *   - every sign-out removes all of them
 *     (`components/app/intake-draft-sign-out-clear.tsx`).
 * Every access is guarded: a private window or blocked storage keeps nothing.
 */

export const TAB_DRAFT_PREFIX = "lmai:tab-draft:v1:";
export const TAB_DRAFT_TTL_MS = 30 * 60 * 1000;
const MAX_CHARS = 8000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

function store(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Fields of one surface's draft: plain strings only. */
export type TabDraftFields = Readonly<Record<string, string>>;

export function readTabDraft(
  surface: string,
  owner: string,
  s: Store | null = store(),
  now: number = Date.now(),
): TabDraftFields | null {
  try {
    const raw = s?.getItem(TAB_DRAFT_PREFIX + surface);
    if (!raw) return null;
    const v = JSON.parse(raw) as { owner?: unknown; at?: unknown; fields?: unknown };
    const fresh = typeof v.at === "number" && now - v.at >= 0 && now - v.at <= TAB_DRAFT_TTL_MS;
    if (!owner || v.owner !== owner || !fresh || !v.fields || typeof v.fields !== "object") {
      s?.removeItem(TAB_DRAFT_PREFIX + surface);
      return null;
    }
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v.fields as Record<string, unknown>)) {
      if (typeof val === "string" && k !== "__proto__" && k !== "constructor" && k !== "prototype") {
        out[k] = val.slice(0, MAX_CHARS);
      }
    }
    return Object.values(out).some((x) => x.trim() !== "") ? out : null;
  } catch {
    return null;
  }
}

export function writeTabDraft(
  surface: string,
  owner: string,
  fields: TabDraftFields,
  s: Store | null = store(),
  now: number = Date.now(),
): void {
  try {
    const kept = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, v.slice(0, MAX_CHARS)]),
    );
    if (!owner || !Object.values(kept).some((x) => x.trim() !== "")) s?.removeItem(TAB_DRAFT_PREFIX + surface);
    else s?.setItem(TAB_DRAFT_PREFIX + surface, JSON.stringify({ owner, at: now, fields: kept }));
  } catch {
    /* storage refused: nothing kept */
  }
}

export function clearTabDraft(surface: string, s: Store | null = store()): void {
  try {
    s?.removeItem(TAB_DRAFT_PREFIX + surface);
  } catch {
    /* nothing to clear */
  }
}

/** Every tab draft of this browser tab (sign-out). */
export function clearAllTabDrafts(s: Store | null = store()): void {
  try {
    if (!s) return;
    const keys: string[] = [];
    for (let i = 0; i < s.length; i += 1) {
      const k = s.key(i);
      if (k && k.startsWith(TAB_DRAFT_PREFIX)) keys.push(k);
    }
    for (const k of keys) s.removeItem(k);
  } catch {
    /* nothing to clear */
  }
}
