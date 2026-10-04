import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { Availability, Level } from "@/lib/design-proof/product-fixtures";

/**
 * The product's small parts. Typography does the work containers used to do:
 *
 *   title      Bricolage 600, tight          identity + page context
 *   section    Bricolage 600 18 px           a region of a page
 *   row        Inter 500 15 px               the thing itself
 *   meta       Inter 13 px, muted            what qualifies the thing
 *   data       Bricolage, tabular            figures
 *   stamp      mono 12 px, tracked caps      provenance, state, metadata
 *
 * Evidence is drawn the same everywhere: a solid mark = a second party stands
 * behind it; a hollow mark = the person's own record; a dashed mark = declared.
 * Gold is attention and the primary action; green is only ever a confirmation
 * that has just happened; amber is a conflict. Everything else is ivory on
 * obsidian.
 */

export function Stamp({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <span className={cn("sig-stamp", className)}>{children}</span>;
}

export function LevelMark({ level, className }: { readonly level: Level; readonly className?: string }) {
  return (
    <span
      aria-hidden
      data-level={level}
      className={cn(
        "inline-block h-[7px] w-[7px] shrink-0 rounded-full",
        level === "confirmed" && "bg-text-primary",
        level === "recorded" && "border border-text-primary/70",
        level === "declared" && "border border-dashed border-text-muted",
        className,
      )}
    />
  );
}

export const LEVEL_WORD: Record<Level, string> = {
  confirmed: "Confirmed",
  recorded: "Recorded",
  declared: "Declared",
};

/** What stands behind something: confirmed records, the person's own, and the rest. */
export function EvidenceBar({ confirmed, recorded, width = 72, className }: { readonly confirmed: number; readonly recorded: number; readonly width?: number; readonly className?: string }) {
  const total = confirmed + recorded;
  const c = total === 0 ? 0 : (confirmed / Math.max(total, 8)) * 100;
  const r = total === 0 ? 0 : (recorded / Math.max(total, 8)) * 100;
  return (
    <span
      role="img"
      aria-label={`${confirmed} confirmed, ${recorded} recorded`}
      className={cn("relative inline-block h-[3px] overflow-hidden rounded-full bg-text-primary/10", className)}
      style={{ width }}
    >
      <span className="absolute inset-y-0 left-0 bg-text-primary" style={{ width: `${Math.min(100, c)}%` }} />
      <span className="absolute inset-y-0 bg-text-primary/35" style={{ left: `${Math.min(100, c)}%`, width: `${Math.min(100 - Math.min(100, c), r)}%` }} />
    </span>
  );
}

export function Avail({ a, className }: { readonly a: Availability; readonly className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-support", a.state === "busy" ? "text-state-amber" : "text-text-secondary", className)}>
      <span
        aria-hidden
        className={cn(
          "inline-block h-[7px] w-[7px] rounded-full",
          a.state === "now" && "bg-text-primary",
          a.state === "from" && "border border-text-primary/70",
          a.state === "busy" && "bg-state-amber",
        )}
      />
      {a.note}
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { readonly kind?: "primary" | "secondary" | "ghost"; readonly size?: "md" | "sm" };

export function Btn({ kind = "secondary", size = "md", className, children, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-display font-semibold tracking-[-0.01em] transition-[background-color,border-color,color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900 disabled:cursor-not-allowed disabled:opacity-40",
        size === "md" ? "min-h-11 px-5 text-[0.95rem]" : "min-h-9 px-3.5 text-[0.85rem]",
        kind === "primary" && "bg-gradient-cta text-text-on-brand hover:-translate-y-px",
        kind === "secondary" && "border border-text-primary/25 text-text-primary hover:border-brand-blue/70",
        kind === "ghost" && "text-text-secondary hover:text-text-primary",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, className }: { readonly value: T; readonly onChange: (v: T) => void; readonly options: readonly { readonly id: T; readonly label: string }[]; readonly label: string; readonly className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn("inline-flex gap-1 rounded-full border border-text-primary/12 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          type="button"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "min-h-9 rounded-full px-3.5 text-[0.85rem] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
            value === o.id ? "bg-text-primary text-ink-900" : "text-text-secondary hover:text-text-primary",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options, className }: { readonly value: T; readonly onChange: (v: T) => void; readonly options: readonly { readonly id: T; readonly label: string; readonly count?: number }[]; readonly className?: string }) {
  return (
    <div role="tablist" className={cn("flex gap-6 overflow-x-auto border-b border-text-primary/10", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          type="button"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "relative -mb-px min-h-11 whitespace-nowrap border-b-2 pb-2 pt-1 text-[0.95rem] font-medium transition-colors duration-200 focus-visible:outline-none",
            value === o.id ? "border-brand-blue text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
          )}
        >
          {o.label}
          {o.count !== undefined ? <span className="ml-2 text-meta tabular-nums text-text-muted">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** A section heading in the page's own voice. */
export function Section({ title, aside, children, className }: { readonly title: string; readonly aside?: ReactNode; readonly children: ReactNode; readonly className?: string }) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-[1.15rem] font-semibold tracking-[-0.02em]">{title}</h2>
        {aside ? <div className="text-meta text-text-muted">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}
