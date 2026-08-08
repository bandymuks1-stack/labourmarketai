import { cn } from "@/lib/utils";

export function Label({
  children,
  className,
  id,
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
}) {
  return (
    <span
      id={id}
      className={cn(
        "font-mono text-xs uppercase tracking-label text-text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
