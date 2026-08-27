/**
 * CONCEPT A — the one place the three layouts of the record are defined.
 *
 * The canvas engine and the DOM typography layer BOTH read these, so a label
 * can never drift away from the marks it names. That is the whole reason this
 * module exists separately.
 */

export type Box = { readonly w: number; readonly h: number };

/** Horizontal breathing room, in px, scaled down on narrow viewports. */
export function padX(w: number): number {
  return w < 760 ? 22 : w < 1400 ? 56 : 88;
}

/** LAYOUT 0 — chronological band. One mark per recorded day. */
export function timelineBaseline({ h }: Box): number {
  return h * 0.72;
}

/** LAYOUT 1 — six capability columns. */
export function columnCount(): number {
  return 6;
}

export function columnX(i: number, { w }: Box): number {
  const p = padX(w);
  const inner = w - p * 2;
  const colW = inner / columnCount();
  return p + colW * (i + 0.5);
}

export function columnWidth({ w }: Box): number {
  const p = padX(w);
  return (w - p * 2) / columnCount();
}

export function columnBaseline({ h }: Box): number {
  return h * 0.84;
}

/** LAYOUT 2 — the Living Profile: six stacked rows. */
export function rowY(i: number, { h }: Box): number {
  const top = h * 0.3;
  const span = h * 0.44;
  return top + (span / (columnCount() - 1)) * i;
}

export function rowLeft({ w }: Box): number {
  return w < 760 ? padX(w) : padX(w) + Math.min(280, w * 0.2);
}

export function rowSpan({ w }: Box): number {
  return w - rowLeft({ w, h: 0 }) - padX(w) - (w < 760 ? 0 : 90);
}
