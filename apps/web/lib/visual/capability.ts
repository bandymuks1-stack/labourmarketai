/**
 * WHAT THE VIEWER'S DEVICE CAN ACTUALLY AFFORD.
 *
 * ── THE BUG THIS FILE EXISTS TO NOT REPEAT ─────────────────────────────────
 *
 * A previous train probed WebGL with
 *
 *     canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true })
 *
 * and treated `null` as "this device has no WebGL2". That is not what null
 * means. `failIfMajorPerformanceCaveat` asks the browser to refuse a context
 * it would have to service in SOFTWARE — so the probe returns null on a
 * perfectly capable machine that is merely running without a GPU process,
 * on a headless CI browser, on a laptop in power-saver, and on Safari in
 * several documented cases. The result was a capable device silently demoted
 * to the fallback, and — worse — nobody noticed, because a fallback that
 * renders looks like success.
 *
 * The rule, stated so it survives this file: **a capability probe must ask
 * exactly one question, and a null answer means "not under these conditions",
 * never "not at all".** If the answer matters, ask twice — once strictly,
 * once plainly — and treat the difference as information rather than as
 * failure.
 *
 * ── WHY THIS IS DELIBERATELY NOT ABOUT WebGL ───────────────────────────────
 *
 * The Strata world is CSS and SVG. It needs no GPU context, so nothing here
 * gates the scene on WebGL — the owner's instruction is to use 3D only where
 * it earns its place, and a vertical cross-section with parallax does not
 * need a renderer to look like depth. What this module DOES decide is the
 * honest tier: how much motion and how many layers the device should be asked
 * to composite. That question is answerable without touching a canvas.
 */

export type VisualTier =
  /** Full world: every stratum, parallax, the travelling signal. */
  | "full"
  /** Fewer composited layers, shorter travel, no continuous motion. */
  | "reduced"
  /** A still world. Composition and depth survive; nothing moves. */
  | "still";

export interface DeviceSignals {
  /** `prefers-reduced-motion: reduce`. A STATED preference — always wins. */
  readonly prefersReducedMotion: boolean;
  /** `prefers-reduced-data: reduce`, where the browser reports it. */
  readonly prefersReducedData: boolean;
  /** navigator.hardwareConcurrency, when exposed. */
  readonly cores: number | null;
  /** navigator.deviceMemory in GB, when exposed (Chromium only). */
  readonly memoryGb: number | null;
  /** Coarse pointer — a proxy for phone/tablet, not for weakness. */
  readonly coarsePointer: boolean;
}

/**
 * Signals → tier.
 *
 * ORDER MATTERS AND IS A POLICY, NOT AN OPTIMISATION:
 *
 *  1. A stated preference is never overridden by a guess about hardware. If
 *     someone asked for less motion, a fast phone does not earn them more.
 *  2. Absent signals mean UNKNOWN, and unknown resolves to `full`. Chromium
 *     exposes `deviceMemory`; Firefox and Safari do not. Treating "not
 *     reported" as "weak" would permanently demote every Safari user — the
 *     same category error as the WebGL bug above, one API along.
 *  3. Only a POSITIVELY reported weak signal demotes.
 */
export function resolveVisualTier(s: DeviceSignals): VisualTier {
  if (s.prefersReducedMotion) return "still";
  if (s.prefersReducedData) return "reduced";

  // Positively-reported low memory. `deviceMemory` is bucketed by the spec
  // (0.25/0.5/1/2/4/8), so ≤1GB is a real low-end signal and not noise.
  if (s.memoryGb !== null && s.memoryGb <= 1) return "reduced";

  // Positively-reported low parallelism. 2 is the floor at which compositing
  // several blurred layers starts costing visible frames.
  if (s.cores !== null && s.cores <= 2) return "reduced";

  return "full";
}

/** Read the signals from a live browser. Never throws; every probe that is
 *  unavailable reports null rather than a guessed default. */
export function readDeviceSignals(win: Window): DeviceSignals {
  const mq = (q: string): boolean => {
    try {
      return typeof win.matchMedia === "function" && win.matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  const nav = win.navigator as Navigator & {
    deviceMemory?: number;
    hardwareConcurrency?: number;
  };
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

  return {
    prefersReducedMotion: mq("(prefers-reduced-motion: reduce)"),
    prefersReducedData: mq("(prefers-reduced-data: reduce)"),
    cores: num(nav.hardwareConcurrency),
    memoryGb: num(nav.deviceMemory),
    coarsePointer: mq("(pointer: coarse)"),
  };
}

/** How many strata a tier should composite. The world stays recognisable at
 *  every tier — layers are dropped from the BACK, where they are already
 *  atmosphere, so the near, legible layers never disappear. */
export function strataBudget(tier: VisualTier): number {
  switch (tier) {
    case "full":
      return 7;
    case "reduced":
      return 4;
    case "still":
      return 4;
  }
}

/** Whether the travelling signal animates. At `still` the signal is rendered
 *  at rest, mid-flight — the composition keeps its meaning without motion. */
export function signalAnimates(tier: VisualTier): boolean {
  return tier === "full";
}
