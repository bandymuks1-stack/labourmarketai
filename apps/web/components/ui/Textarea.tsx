import { cn } from "@/lib/utils";
import { hasOwnWidth } from "@/components/ui/own-width";

/**
 * Multi-line text field. Same look as `Input`; use it inside `Field` so the
 * label, hint and error are bound to it. Grows by rows, never by a fixed
 * pixel height, and the person can resize it vertically.
 */
export function Textarea({
  className,
  rows = 4,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      rows={rows}
      className={cn(
        !hasOwnWidth(className) && "w-full",
        "resize-y rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm leading-relaxed text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue aria-[invalid=true]:border-state-danger motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  );
}
