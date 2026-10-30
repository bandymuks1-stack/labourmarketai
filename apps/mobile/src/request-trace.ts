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

/** Test-only: forget every call. */
export function resetRequestTrace() {
  seq = 0;
  snapshot = {};
  emit();
}
