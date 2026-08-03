// Z-index layers (visual contract v1, docs/design/visual-contract-v1.md §z).
//
// Before this scale the app stacked with raw utilities (z-10 ×23, z-50 ×16,
// z-[70], and two `z-60` classes that Tailwind never emitted because 60 was
// not in the default scale — i.e. silently dead). The scale below names what
// a layer IS so two surfaces can never fight over an arbitrary number.
//
// The ladder is strictly increasing. New layers slot between existing ones
// only with a named entry here — never with a raw `z-[…]` in a component.
export const zIndex = {
  /** In-flow content that just needs to sit above a decorative sibling. */
  base: "0",
  /** Sticky headers / section chrome inside a scroll container. */
  sticky: "10",
  /** Dropdowns, popovers, comboboxes anchored to a control. */
  dropdown: "20",
  /** The chat composer bar above workspace content. */
  composer: "30",
  /** Mobile bottom sheets and side drawers. */
  sheet: "40",
  /** Full-viewport dimming overlay behind a sheet or modal. */
  overlay: "50",
  /** Real modal dialogs (focus-trapped). */
  modal: "60",
  /** Toasts / transient notices — above everything else. */
  toast: "70",
} as const;

/** The named ladder, in stacking order. Exported so the visual-contract guard
 *  can assert monotonicity without re-declaring the values it checks. */
export const Z_INDEX_LADDER = [
  "base",
  "sticky",
  "dropdown",
  "composer",
  "sheet",
  "overlay",
  "modal",
  "toast",
] as const;
