import { preferenceStore } from "./preference-store";

/**
 * UNSENT WORDS SURVIVE A SIGN-IN AGAIN (owner P0 2026-11-22: no lost drafts
 * or entries on errors).
 *
 * When a session can no longer be refreshed, the shell sends the person to
 * sign-in and every screen unmounts — a half-written journal entry, need or
 * message used to go with it. A draft is kept here, per surface, for the
 * person who typed it:
 *   - in memory, so a sign-in again in the same run restores it at once;
 *   - and, best effort, in the device's secure store (short texts of the
 *     surfaces listed in PERSISTED_SURFACES only), so a closed app keeps it too;
 *   - restored only for the SAME person (user id), for 12 hours;
 *   - removed when it is sent, and on every explicit sign-out
 *     (`clearAllDrafts`, called by auth-context) — never on an expiry.
 * Never a second store of record: the text becomes a record only through the
 * screen's own prepare → confirm.
 */

const TTL_MS = 12 * 60 * 60 * 1000;
const PREFIX = "lmai.draft.v1.";
/** SecureStore warns above ~2 KB per entry; longer drafts stay in memory. */
const MAX_PERSISTED_CHARS = 1800;

type Fields = Readonly<Record<string, string>>;
type Kept = { readonly owner: string; readonly at: number; readonly fields: Fields };

const memory = new Map<string, Kept>();
/** The fixed surfaces also kept on the device; every other (e.g. one per
 *  conversation) is kept in memory only, so sign-out can always clear all. */
export const PERSISTED_SURFACES = ["journal-composer", "need-intake"] as const;

function hasText(fields: Fields): boolean {
  return Object.values(fields).some((v) => typeof v === "string" && v.trim() !== "");
}

function fresh(k: Kept | null | undefined, owner: string, now: number): Kept | null {
  if (!k || k.owner !== owner || !owner) return null;
  return now - k.at >= 0 && now - k.at <= TTL_MS ? k : null;
}

export async function readDraft(surface: string, owner: string, now: number = Date.now()): Promise<Fields | null> {
  const inMemory = fresh(memory.get(surface), owner, now);
  if (inMemory) return inMemory.fields;
  if (!(PERSISTED_SURFACES as readonly string[]).includes(surface)) return null;
  const raw = await preferenceStore.get(PREFIX + surface);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Kept;
    const ok = fresh(parsed, owner, now);
    if (!ok || typeof ok.fields !== "object") return null;
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(ok.fields)) if (typeof v === "string") fields[k] = v;
    return hasText(fields) ? fields : null;
  } catch {
    return null;
  }
}

export function writeDraft(surface: string, owner: string, fields: Fields, now: number = Date.now()): void {
  const persisted = (PERSISTED_SURFACES as readonly string[]).includes(surface);
  if (!owner || !hasText(fields)) {
    memory.delete(surface);
    if (persisted) void preferenceStore.set(PREFIX + surface, "");
    return;
  }
  const kept: Kept = { owner, at: now, fields };
  memory.set(surface, kept);
  if (!persisted) return;
  const total = Object.values(fields).reduce((n, v) => n + v.length, 0);
  void preferenceStore.set(PREFIX + surface, total <= MAX_PERSISTED_CHARS ? JSON.stringify(kept) : "");
}

export function clearDraft(surface: string): void {
  memory.delete(surface);
  if ((PERSISTED_SURFACES as readonly string[]).includes(surface)) void preferenceStore.set(PREFIX + surface, "");
}

/** Every draft of this device (explicit sign-out). */
export function clearAllDrafts(): void {
  for (const s of new Set([...memory.keys(), ...PERSISTED_SURFACES])) clearDraft(s);
}

