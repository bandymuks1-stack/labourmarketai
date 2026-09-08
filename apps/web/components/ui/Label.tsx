import { cn } from "@/lib/utils";

const LABEL_CLASS = "font-mono text-xs uppercase tracking-label text-text-muted";

export function Label({
  children,
  className,
  id,
  htmlFor,
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * W7-S2: lets a composite control (a `radiogroup`, a toggle `group`) point
   * `aria-labelledby` at the VISIBLE label instead of repeating the same
   * string in an `aria-label`, so the visible and programmatic names can never
   * drift apart. Optional — every existing call site is unaffected.
   */
  id?: string;
  /**
   * J3 (2026-09-02): when set, the label is a real `<label for=…>` bound to
   * the control with that id, so the field has an accessible name and a
   * click on the caption focuses it. Without it the element stays a `<span>`
   * (a caption over a group, not a single control) — every existing call
   * site is unaffected.
   */
  htmlFor?: string;
}) {
  if (htmlFor) {
    return (
      <label id={id} htmlFor={htmlFor} className={cn(LABEL_CLASS, className)}>
        {children}
      </label>
    );
  }
  return (
    <span id={id} className={cn(LABEL_CLASS, className)}>
      {children}
    </span>
  );
}
