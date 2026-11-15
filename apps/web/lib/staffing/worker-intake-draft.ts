/**
 * WHAT A WORKER TYPED BEFORE THEY HAD AN ACCOUNT IS KEPT (owner P0 2026-11-15,
 * F2, option (b)).
 *
 * `/worker-intake` is the first step and needs no account. It stores nothing
 * on the server. Its sign-up link carries the profile builder as `next`, and
 * what the person typed waits in this browser, through sign-up and the
 * confirmation mail, until the builder places it in the profile composer.
 * There the person reads it, may change it, and sends it; every fact it
 * yields is still reviewed and confirmed before it is saved. Nothing is
 * written for them.
 *
 * Bounded: plain text, at most DRAFT_MAX_CHARS, kept DRAFT_MAX_AGE_DAYS, and
 * removed once the person sends it. Every storage call is guarded: a browser
 * that refuses storage simply keeps nothing, as before.
 */

export const INTAKE_DRAFT_KEY = "lm.workerIntakeDraft.v1";
export const DRAFT_MAX_CHARS = 4000;
export const DRAFT_MAX_AGE_DAYS = 30;

type StoredDraft = { readonly v: 1; readonly at: number; readonly text: string };

/** One "label: value" line per filled field, in form order; empty fields are left out. */
export function intakeDraftText(entries: readonly { readonly label: string; readonly value: string }[]): string {
  return entries
    .map(({ label, value }) => ({ label: label.trim(), value: value.replace(/\s+/g, " ").trim() }))
    .filter((e) => e.value.length > 0)
    .map((e) => (e.label ? `${e.label}: ${e.value}` : e.value))
    .join("\n")
    .slice(0, DRAFT_MAX_CHARS);
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function writeWorkerIntakeDraft(text: string, now: number = Date.now()): void {
  const s = storage();
  if (!s) return;
  try {
    const clean = text.slice(0, DRAFT_MAX_CHARS);
    if (clean.trim().length === 0) s.removeItem(INTAKE_DRAFT_KEY);
    else s.setItem(INTAKE_DRAFT_KEY, JSON.stringify({ v: 1, at: now, text: clean } satisfies StoredDraft));
  } catch {
    /* storage full or refused: nothing is kept, as before */
  }
}

/** The kept text, or null when there is none, it is too old, or it cannot be read. */
export function readWorkerIntakeDraft(now: number = Date.now()): string | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(INTAKE_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<StoredDraft>;
    const fresh = typeof d.at === "number" && now - d.at <= DRAFT_MAX_AGE_DAYS * 86_400_000 && now >= d.at;
    if (d.v !== 1 || !fresh || typeof d.text !== "string" || d.text.trim().length === 0) {
      s.removeItem(INTAKE_DRAFT_KEY);
      return null;
    }
    return d.text.slice(0, DRAFT_MAX_CHARS);
  } catch {
    return null;
  }
}

export function clearWorkerIntakeDraft(): void {
  try {
    storage()?.removeItem(INTAKE_DRAFT_KEY);
  } catch {
    /* nothing to clear */
  }
}
