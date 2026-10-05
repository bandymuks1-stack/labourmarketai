/**
 * THE COLOUR RULE — most of the world is quiet; colour is an EVENT.
 *
 * The base of every signature surface is photography, ivory type and obsidian
 * ground. Colour appears only where attention is:
 *
 *   FOCUS  gold   the capability, requirement or relationship being inspected
 *                 right now. When attention moves, gold moves with it.
 *   EVENT  green  a confirmation that has JUST happened; it settles back into
 *                 the quiet palette within seconds.
 *
 * Strands (and the bridges across a match) are told apart by position,
 * thickness, continuity and opacity — not by a hue each.
 */
export const QUIET = "rgb(var(--c-text-primary))";
export const FOCUS = "rgb(var(--c-brand-blue))";
export const EVENT = "rgb(var(--c-state-success))";

/** Thickness of a strand for an amount of accumulated work (px). */
export const MAX_HOURS = 260;
export const strandWidth = (hours: number | undefined, min = 2, span = 12): number =>
  hours ? min + (Math.min(hours, MAX_HOURS) / MAX_HOURS) * span : 0;

/** More work → a more present strand (opacity 0.32 → 0.78). */
export const strandPresence = (hours: number | undefined): number =>
  hours ? 0.32 + (Math.min(hours, MAX_HOURS) / MAX_HOURS) * 0.46 : 0;
