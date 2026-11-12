import { cn } from "@/lib/utils";
import { hasOwnWidth } from "@/components/ui/own-width";

export function Input({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        !hasOwnWidth(className) && "w-full",
        "rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue",
        className,
      )}
      {...props}
    />
  );
}
