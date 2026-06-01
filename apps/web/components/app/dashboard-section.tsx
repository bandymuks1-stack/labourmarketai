import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

/** Dashboard 3-sections card. The empty body is rendered with a visible
 *  PLACEHOLDER marker in dev/preview (per the project's honesty rule) and
 *  cleanly in production. */
export function DashboardSection({
  title,
  emptyBody,
  children,
}: {
  title: string;
  emptyBody?: string;
  children?: React.ReactNode;
}) {
  const marker = env.NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS === "true";
  return (
    <section className="card-border p-6">
      <h2 className="font-mono text-[11px] uppercase tracking-label text-text-muted">
        {title}
      </h2>
      <div className="mt-4">
        {children ?? (
          <p
            className={cn(
              "relative text-sm leading-relaxed text-text-secondary",
              marker &&
                "rounded-sm outline-dashed outline-1 outline-offset-2 outline-brand-blue/40 p-2",
            )}
          >
            {marker && (
              <span
                aria-hidden
                className="pointer-events-none absolute -right-1 -top-3 select-none rounded-sm border border-brand-blue/40 bg-ink-800 px-1 font-mono text-[10px] uppercase tracking-label text-brand-blue"
              >
                Placeholder
              </span>
            )}
            {emptyBody}
          </p>
        )}
      </div>
    </section>
  );
}
