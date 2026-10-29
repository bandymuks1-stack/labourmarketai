import { useSyncExternalStore } from "react";

/**
 * WHERE THE LAST CAPABILITY CALL GOT TO — state names only, never data.
 *
 * A journey on a simulator or an emulator in CI runs against production with
 * the review identity, in a PUBLIC repository: no screenshot, no device log
 * and no response body may leave the runner. When a step there stalls, the
 * only evidence that may leave is our own test ids. So each screen that
 * writes or reads wears the phase of its capability calls in a test id —
 *
 *   started   → capability() was entered (the JS side asked)
 *   sent      → the platform fetch was called (the request left our code)
 *   answered  → the platform fetch resolved with response headers
 *   rejected  → the platform fetch rejected (dropped link, or our deadline)
 *   ok / <failure kind> → the call settled, and how
 *
 * — which separates "the tap never reached our code" from "the request never
 * left the device's network stack" from "the answer never came back". It holds
 * the capability NAME and a phase word: no arguments, no token, no status
 * body, nothing a person typed. It is permanent on purpose: the next stall on
 * a device farm is diagnosable without asking anybody for a screenshot.
 */
export type TracePhase =
  | "started"
  | "sent"
  | "answered"
  | "rejected"
  | "ok"
  | string;

type Entry = { readonly phase: TracePhase; readonly seq: number };

let seq = 0;
let snapshot: Readonly<Record<string, Entry>> = {};
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Begin a call; returns its sequence number. */
export function traceStart(name: string): number {
  seq += 1;
  snapshot = { ...snapshot, [name]: { phase: "started", seq } };
  emit();
  return seq;
}

/** Move call `callSeq` of `name` to `phase` — ignored if a newer call of the
 *  same capability has started since (its phase is the one that matters). */
export function tracePhase(name: string, callSeq: number, phase: TracePhase) {
  const current = snapshot[name];
  if (current === undefined || current.seq !== callSeq) return;
  // Phase words only: a failure kind is a fixed vocabulary word, but keep the
  // test id safe whatever arrives.
  const word = phase.replace(/[^a-z_]/gi, "").slice(0, 32) || "unknown";
  snapshot = { ...snapshot, [name]: { phase: word, seq: callSeq } };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

/** The current trace, outside React (tests). */
export function readRequestTrace(): Readonly<Record<string, Entry>> {
  return snapshot;
}

/** `net-journal_create_draft-sent`, or `net-journal_create_draft-none`. */
export function traceTestId(
  trace: Readonly<Record<string, Entry>>,
  name: string,
): string {
  const entry = trace[name];
  return `net-${name.replace(/\./g, "_")}-${entry === undefined ? "none" : entry.phase}`;
}

export function useRequestTrace(): Readonly<Record<string, Entry>> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ── touches that reached React Native at all ───────────────────────────────

let rootTouches = { count: 0, at: "none", recent: [] as string[] };
const touchListeners = new Set<() => void>();

/** Record one touch at the app root: a count and rounded points only (the
 *  last eight, so a run can see which taps arrived and in what order). */
export function traceRootTouch(pageX: number, pageY: number) {
  const at = `${Math.round(pageX)}x${Math.round(pageY)}`;
  rootTouches = {
    count: rootTouches.count + 1,
    at,
    recent: [...rootTouches.recent, at].slice(-8),
  };
  for (const listener of touchListeners) listener();
}

/** `rt12at201x653` — for a test id. */
export function useRootTouchTrace(): string {
  const value = useSyncExternalStore(
    (listener) => {
      touchListeners.add(listener);
      return () => {
        touchListeners.delete(listener);
      };
    },
    () => rootTouches,
    () => rootTouches,
  );
  return `rt${value.count}at${value.at}`;
}

/** `rh201x437.201x589...` — the last eight touch points, oldest first. */
export function useRootTouchHistory(): string {
  const value = useSyncExternalStore(
    (listener) => {
      touchListeners.add(listener);
      return () => {
        touchListeners.delete(listener);
      };
    },
    () => rootTouches,
    () => rootTouches,
  );
  return `rh${value.recent.join(".") || "none"}`;
}

/** Test-only: forget every call. */
export function resetRequestTrace() {
  seq = 0;
  snapshot = {};
  emit();
}
