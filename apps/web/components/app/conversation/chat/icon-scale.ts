/**
 * The conversation icon scale.
 *
 * The audit found five sizes on this surface (12 / 14 / 16 / 20 / 28px) all at
 * lucide's default 2px stroke, so the small ones looked heavy and the large ones
 * looked thin — the set read as imported clip-art rather than a designed system.
 * Stroke weight has to scale DOWN as an icon scales up, or the optical weight
 * changes with size.
 *
 * THREE optical categories, and only three:
 *
 *   inline    16px / 1.75  sits inside a line of text — list bullets, ticks,
 *                          the file glyph in a message
 *   control   20px / 1.5   anything you press or navigate with — nav tabs,
 *                          composer buttons, card-header markers
 *   identity  —            the assistant's product mark, which is a filled
 *                          tile rather than a stroke icon (see
 *                          `assistant-identity.tsx`)
 *
 * Spread these onto a lucide icon so size and stroke can never drift apart:
 *
 *   <Check {...iconInline("text-state-success")} aria-hidden />
 *
 * Pinned by lib/guards/ux-2-0-actions.test.ts.
 */

const INLINE_SIZE = "size-4"; // 16px
const CONTROL_SIZE = "size-5"; // 20px

export const ICON_STROKE = {
  inline: 1.75,
  control: 1.5,
} as const;

type IconProps = { className: string; strokeWidth: number };

/** 16px / 1.75 — an icon sitting inside running text. */
export function iconInline(extra = ""): IconProps {
  return {
    className: `${INLINE_SIZE} ${extra}`.trim(),
    strokeWidth: ICON_STROKE.inline,
  };
}

/** 20px / 1.5 — an icon in something you press or navigate with. */
export function iconControl(extra = ""): IconProps {
  return {
    className: `${CONTROL_SIZE} ${extra}`.trim(),
    strokeWidth: ICON_STROKE.control,
  };
}
