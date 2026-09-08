/**
 * MY SPACE — pins (owner contract 2026-09-04 §4C). PURE half.
 *
 *   "A pin/shortcut is ONLY a reference to an existing canonical
 *    entity/action/view. Never duplicate domain state. PIN · UNPIN · REORDER.
 *    The system may detect repeated usage and ASK. Never silently fill the
 *    desktop with junk."
 *
 * A pin's `ref` is a chip id the conversation already understands
 * (`handleChip` vocabulary): `f:<action-id>` opens the canonical inline form,
 * `agency:demand` / `candidates` / `projects` / `logwork` … run the same
 * handlers the starters run, `link:/dashboard/…` opens the canonical surface.
 * The chat resolves the reference against live state every time; a pin never
 * carries a fact about the thing it points at.
 */

export const PIN_CAP = 6;
export const PIN_LABEL_MAX = 80;
export const PIN_REF_MAX = 200;

/** How many uses of the same reference within the window trigger the ask. */
export const PIN_ASK_THRESHOLD = 3;
export const PIN_ASK_WINDOW_DAYS = 7;

export type PinKind = "action" | "entity" | "view";

export interface WorkspacePin {
  readonly ref: string;
  readonly kind: PinKind;
  readonly label: string | null;
  readonly position: number;
}

/** Only references the conversation can resolve. Deliberately closed: a pin
 *  to an unknown id would be a dead chip, which is worse than no chip. */
const REF_PATTERNS: ReadonlyArray<{ re: RegExp; kind: PinKind }> = [
  { re: /^f:[a-z]+\.[a-z0-9-]+$/, kind: "action" }, // inline form of a registered action
  { re: /^(logwork|cv|jobs|profile|candidates|projects|engagements|agenda|offers)$/, kind: "action" },
  { re: /^(agency:demand|agency:progress|edu:create|edu:cohort|edu:assign|documents-centre|compass-page)$/, kind: "action" },
  { re: /^(project|demand):[0-9a-f-]{36}$/, kind: "entity" },
  { re: /^link:\/dashboard(\/[a-z0-9-]+)*(\?[a-z0-9=&-]*)?(#[a-z0-9-]+)?$/, kind: "view" },
];

export function pinKindFor(ref: string): PinKind | null {
  if (typeof ref !== "string" || ref.length === 0 || ref.length > PIN_REF_MAX) return null;
  for (const { re, kind } of REF_PATTERNS) if (re.test(ref)) return kind;
  return null;
}

export function isPinnableRef(ref: string): boolean {
  return pinKindFor(ref) !== null;
}

export function sanitizePinLabel(label: unknown): string | null {
  if (typeof label !== "string") return null;
  const trimmed = label.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, PIN_LABEL_MAX);
}

/** Stable order: position, then insertion (ref as a tie-break so the list is
 *  deterministic for equal positions). */
export function orderPins(pins: readonly WorkspacePin[]): WorkspacePin[] {
  return [...pins].sort((a, b) => a.position - b.position || a.ref.localeCompare(b.ref)).slice(0, PIN_CAP);
}

/**
 * USAGE DETECTION (client-side, per viewer, a convenience — never a fact
 * about the person). Counts chip uses in a rolling window; the product asks
 * ONCE per reference when the threshold is reached and the reference is not
 * pinned yet. Stored under one localStorage key; read/write failures are
 * swallowed by the caller.
 */
export interface PinUsage {
  readonly [ref: string]: readonly number[]; // epoch ms of uses
}

export function recordPinUsage(usage: PinUsage, ref: string, nowMs: number): PinUsage {
  const windowStart = nowMs - PIN_ASK_WINDOW_DAYS * 86_400_000;
  const kept = (usage[ref] ?? []).filter((t) => t >= windowStart);
  return { ...usage, [ref]: [...kept, nowMs].slice(-PIN_ASK_THRESHOLD * 2) };
}

export function shouldAskToPin(
  usage: PinUsage,
  ref: string,
  nowMs: number,
  pinned: ReadonlySet<string>,
  asked: ReadonlySet<string>,
): boolean {
  if (!isPinnableRef(ref) || pinned.has(ref) || asked.has(ref)) return false;
  const windowStart = nowMs - PIN_ASK_WINDOW_DAYS * 86_400_000;
  const uses = (usage[ref] ?? []).filter((t) => t >= windowStart).length;
  return uses >= PIN_ASK_THRESHOLD;
}
