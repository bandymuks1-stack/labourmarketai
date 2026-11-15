/**
 * WHAT A WORKER TYPED BEFORE THEY HAD AN ACCOUNT REACHES THEIR OWN PROFILE,
 * AND NO ONE ELSE'S (owner P0 2026-11-15, F2, option (b); decision 0024).
 *
 * `/worker-intake` is the first step and needs no account. It stores nothing
 * on the server. What the person types is kept in this browser in two steps:
 *
 *  1. UNBOUND, while they type: sessionStorage only. It survives a reload and
 *     the same-tab walk to sign-up, and is gone when the tab closes. No other
 *     tab, and no later visitor, can read it.
 *  2. BOUND, when they submit sign-up (or sign-in) from the intake's own link
 *     (`next` = the profile builder): the text moves to localStorage stamped
 *     with that email, for DRAFT_MAX_AGE_HOURS, so it survives the
 *     confirmation mail opening in a new tab.
 *
 * The profile builder reads it only for the signed-in account whose email
 * matches the stamp. A draft read by any other account is removed, never
 * shown. It is also removed when the person sends it, and on every sign-out
 * (`components/app/intake-draft-sign-out-clear.tsx`). There the person reads
 * it, may change it, and sends it; every fact it yields is still reviewed and
 * confirmed before it is saved. Nothing is written for them.
 *
 * Every storage call is guarded: a browser that refuses storage keeps nothing.
 */

export const INTAKE_DRAFT_KEY = "lm.workerIntakeDraft.v2";
/** The v1 key (localStorage, unbound, 30 days); removed wherever it is met. */
export const LEGACY_INTAKE_DRAFT_KEY = "lm.workerIntakeDraft.v1";
export const DRAFT_MAX_CHARS = 4000;
export const DRAFT_MAX_AGE_HOURS = 6;
const MAX_AGE_MS = DRAFT_MAX_AGE_HOURS * 3_600_000;

type UnboundDraft = { readonly v: 2; readonly at: number; readonly text: string };
type BoundDraft = UnboundDraft & { readonly email: string };

/** One "label: value" line per filled field, in form order; empty fields are left out. */
export function intakeDraftText(entries: readonly { readonly label: string; readonly value: string }[]): string {
  return entries
    .map(({ label, value }) => ({ label: label.trim(), value: value.replace(/\s+/g, " ").trim() }))
    .filter((e) => e.value.length > 0)
    .map((e) => (e.label ? `${e.label}: ${e.value}` : e.value))
    .join("\n")
    .slice(0, DRAFT_MAX_CHARS);
}

export function normalizeDraftEmail(email: string): string {
  return email.trim().toLowerCase();
}

function store(kind: "session" | "local"): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function parse(raw: string | null, now: number): (UnboundDraft & { email?: unknown }) | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<BoundDraft>;
    const fresh = typeof d.at === "number" && now >= d.at && now - d.at <= MAX_AGE_MS;
    if (d.v !== 2 || !fresh || typeof d.text !== "string" || d.text.trim().length === 0) return null;
    return { v: 2, at: d.at as number, text: d.text.slice(0, DRAFT_MAX_CHARS), email: d.email };
  } catch {
    return null;
  }
}

function remove(s: Storage | null, key: string): void {
  try {
    s?.removeItem(key);
  } catch {
    /* nothing to remove */
  }
}

/** Step 1: keep what is typed, unbound, in this tab only. */
export function writeWorkerIntakeDraft(text: string, now: number = Date.now()): void {
  const s = store("session");
  if (!s) return;
  try {
    const clean = text.slice(0, DRAFT_MAX_CHARS);
    if (clean.trim().length === 0) s.removeItem(INTAKE_DRAFT_KEY);
    else s.setItem(INTAKE_DRAFT_KEY, JSON.stringify({ v: 2, at: now, text: clean } satisfies UnboundDraft));
  } catch {
    /* storage full or refused: nothing is kept */
  }
}

/** The unbound text in this tab (the intake page's own reload), or null. */
export function readUnboundWorkerIntakeDraft(now: number = Date.now()): string | null {
  const s = store("session");
  const d = parse(s?.getItem(INTAKE_DRAFT_KEY) ?? null, now);
  if (!d) remove(s, INTAKE_DRAFT_KEY);
  return d?.text ?? null;
}

/**
 * Step 2: on sign-up / sign-in from the intake, bind this tab's draft to the
 * email being used. Without an unbound draft in this tab nothing happens, so
 * an ordinary sign-in never claims anything.
 */
export function bindWorkerIntakeDraft(email: string, now: number = Date.now()): void {
  const owner = normalizeDraftEmail(email);
  if (!owner) return;
  const text = readUnboundWorkerIntakeDraft(now);
  if (!text) return;
  const s = store("local");
  if (!s) return;
  try {
    s.setItem(INTAKE_DRAFT_KEY, JSON.stringify({ v: 2, at: now, text, email: owner } satisfies BoundDraft));
    remove(store("session"), INTAKE_DRAFT_KEY);
  } catch {
    /* storage full or refused: nothing is kept */
  }
}

/**
 * The text bound to THIS account, or null. A draft bound to another email,
 * an old one, or one that cannot be read is removed and never returned.
 */
export function readWorkerIntakeDraftFor(viewerEmail: string | null | undefined, now: number = Date.now()): string | null {
  const s = store("local");
  remove(s, LEGACY_INTAKE_DRAFT_KEY);
  const d = parse(s?.getItem(INTAKE_DRAFT_KEY) ?? null, now);
  const viewer = viewerEmail ? normalizeDraftEmail(viewerEmail) : "";
  if (!d || typeof d.email !== "string" || !viewer || d.email !== viewer) {
    remove(s, INTAKE_DRAFT_KEY);
    return null;
  }
  return d.text;
}

/** Removes every kept copy: after it is sent, and on sign-out. */
export function clearWorkerIntakeDraft(): void {
  for (const kind of ["session", "local"] as const) {
    const s = store(kind);
    remove(s, INTAKE_DRAFT_KEY);
    remove(s, LEGACY_INTAKE_DRAFT_KEY);
  }
}
