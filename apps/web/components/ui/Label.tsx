import { cn } from "@/lib/utils";

export function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-xs uppercase tracking-label text-text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
