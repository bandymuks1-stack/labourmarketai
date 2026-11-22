/**
 * WHERE A POPUP FITS (responsive sweep 2026-11-21).
 *
 * Measured on the isolated stack: the account, language, workspace and "More"
 * menus ran past the bottom of a short screen (a phone on its side, 320 × 568,
 * 200 % text, long locales) with no way to reach their last items, and the
 * onboarding country list opened under the fixed Finish bar. One rule for
 * every popup, kept free of React so it is tested on its own:
 *
 *   - open on the side of the trigger with room for the panel; if neither side
 *     has it, open on the side with MORE room;
 *   - never taller than that room (the panel scrolls inside itself);
 *   - never past either side edge, and never wider than the screen.
 */

/** Space kept between a popup and the screen edge, and between it and its trigger. */
export const OVERLAY_EDGE = 8;
export const OVERLAY_GAP = 8;

export type Rect = { top: number; bottom: number; left: number; right: number };
export type Size = { width: number; height: number };

/** Which side of the trigger a panel of `panelHeight` opens on, and how tall it may be.
 *  `insetTop` / `insetBottom` are fixed bars that cover the screen's edges. */
export function chooseSide(
  trigger: Pick<Rect, "top" | "bottom">,
  panelHeight: number,
  viewportHeight: number,
  insetTop = 0,
  insetBottom = 0,
  gap = OVERLAY_GAP,
  edge = OVERLAY_EDGE,
): { side: "below" | "above"; room: number } {
  const below = Math.max(0, viewportHeight - insetBottom - trigger.bottom - gap - edge);
  const above = Math.max(0, trigger.top - insetTop - gap - edge);
  if (panelHeight <= below || below >= above) return { side: "below", room: below };
  return { side: "above", room: above };
}

export type OverlayPosition = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  maxHeight: number;
  maxWidth: number;
  /** The panel is taller than its room, so it scrolls inside itself. */
  scroll: boolean;
};

/** Fixed-position placement of a panel hanging from `trigger`. Before the
 *  panel has been measured (`panel` null) it hugs the trigger as it always
 *  did; once measured it is kept inside the screen. */
export function placeOverlay(
  trigger: Rect,
  panel: Size | null,
  viewport: Size,
  align: "left" | "right",
): OverlayPosition {
  const maxWidth = Math.max(0, viewport.width - 2 * OVERLAY_EDGE);
  const { side, room } = chooseSide(trigger, panel?.height ?? 0, viewport.height);
  const scroll = (panel?.height ?? 0) > room;
  const vertical =
    side === "below"
      ? { top: trigger.bottom + OVERLAY_GAP }
      : { bottom: viewport.height - trigger.top + OVERLAY_GAP };
  if (!panel) {
    return align === "right"
      ? { ...vertical, right: Math.max(OVERLAY_EDGE, viewport.width - trigger.right), maxHeight: room, maxWidth, scroll }
      : { ...vertical, left: Math.max(OVERLAY_EDGE, trigger.left), maxHeight: room, maxWidth, scroll };
  }
  const width = Math.min(panel.width, maxWidth);
  const wanted = align === "right" ? trigger.right - width : trigger.left;
  const left = Math.min(Math.max(OVERLAY_EDGE, wanted), viewport.width - OVERLAY_EDGE - width);
  return { ...vertical, left: Math.round(Math.max(OVERLAY_EDGE, left)), maxHeight: room, maxWidth, scroll };
}

export function samePosition(a: OverlayPosition, b: OverlayPosition): boolean {
  return (
    a.top === b.top &&
    a.bottom === b.bottom &&
    a.left === b.left &&
    a.right === b.right &&
    a.maxHeight === b.maxHeight &&
    a.maxWidth === b.maxWidth &&
    a.scroll === b.scroll
  );
}

/** Height of fixed/sticky bars covering the top and bottom of the screen
 *  (the app header, the onboarding Finish bar), found by hit-testing a column
 *  of points; `ignore` is the popup's own field, which never counts. */
export function screenInsets(ignore: Element | null, x: number): { top: number; bottom: number } {
  if (typeof document === "undefined") return { top: 0, bottom: 0 };
  const vh = window.innerHeight;
  const barAt = (y: number) => {
    const hit = document.elementFromPoint(x, y);
    for (let el: Element | null = hit; el && el !== document.body; el = el.parentElement) {
      if (ignore && (el.contains(ignore) || ignore.contains(el))) return false;
      const p = getComputedStyle(el).position;
      if (p === "fixed" || p === "sticky") return true;
    }
    return false;
  };
  let bottom = 0;
  for (let y = vh - 2; y > vh / 2 && barAt(y); y -= 8) bottom = vh - y;
  let top = 0;
  for (let y = 2; y < vh / 2 && barAt(y); y += 8) top = y;
  return { top, bottom };
}
