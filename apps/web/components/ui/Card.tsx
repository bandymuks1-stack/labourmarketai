import { cn } from "@/lib/utils";

export function Card({
  label,
  live,
  className,
  children,
}: {
  label?: string;
  live?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("card-border p-6", className)}>
      {(label || live) && (
        <div className="relative mb-4 flex items-center gap-2">
          {live && <span className="live-dot" aria-hidden />}
          {label && (
            <span className="font-mono text-xs uppercase tracking-label text-text-muted">
              {label}
            </span>
          )}
        </div>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
