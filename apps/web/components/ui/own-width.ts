/**
 * True when a caller's `className` sets its own base width (`w-40`, `w-auto`,
 * `w-[12rem]`). `cn` joins classes and does not resolve conflicts, so a
 * control's default `w-full` and a caller's `w-40` would both be applied and
 * the stylesheet order, not the caller, would decide. Controls drop their
 * default width when this is true. A width behind a breakpoint (`sm:w-40`)
 * does not count: the control stays full width below that breakpoint.
 */
export function hasOwnWidth(className: string | undefined): boolean {
  return /(?:^|\s)w-\S/.test(className ?? "");
}
