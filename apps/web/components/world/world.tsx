import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * THE WORLD OF WORK — shared visual primitives (public AND product).
 *
 * DEPTH RULE (owner 2026-10-02): the FOCUSED object has the highest depth
 * (`WorldPane tier="focus"`), related context is visible but quieter
 * (`tier="context"`), the photographic world behind is present but never
 * competes. Glass is used only where it carries that meaning — never as
 * decoration, never on everything.
 *
 * PHOTOGRAPHY RULE: a scene is one of four classes and must say which:
 *   brand       public marketing photograph (sample/fixture unless licensed)
 *   portrait    a professional's portrait
 *   project     the working context of a project
 *   evidence    a record's own photograph
 * Decorative photography never implies verification. See
 * components/marketing/public/public-imagery.ts for the public registry.
 *
 * LAYOUT. Below `lg` a scene is a photograph band over a stack of panes (no
 * lines, no overlap); from `lg` the panes sit on the photograph at percentage
 * positions with leader lines to the person.
 */
export type PhotoClass = "brand" | "portrait" | "project" | "evidence";

export function WorldScene({
  src,
  width,
  height,
  alt,
  photoClass,
  mirror = false,
  objectPosition = "50% 40%",
  priority = false,
  minHeight = "lg:h-[min(calc(100svh-76px),860px)]",
  band = "h-[46svh]",
  shade = "left",
  badge,
  children,
  className,
  testId,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  photoClass: PhotoClass;
  mirror?: boolean;
  objectPosition?: string;
  priority?: boolean;
  minHeight?: string;
  band?: string;
  /** Which side the headline sits on, so the shade darkens that side. */
  shade?: "left" | "none";
  /** The "Example" label etc., placed on the scene itself (not inside the pane stack). */
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      className={cn("scope-dark relative isolate overflow-hidden bg-ink-900 text-text-primary lg:min-h-[640px]", minHeight, className)}
      data-testid={testId}
      data-photo-class={photoClass}
    >
      <div className={cn("relative w-full lg:absolute lg:inset-0 lg:h-auto", band)}>
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          fetchPriority={priority ? "high" : undefined}
          sizes="100vw"
          className={cn("h-full w-full object-cover", mirror && "-scale-x-100")}
          style={{ objectPosition }}
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-ink-900/50 via-transparent to-ink-900 lg:bg-none"
        />
      </div>
      {/* the vignette + the headline-side shade (desktop only; on phones the band fades into the page) */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 hidden lg:block",
          shade === "left"
            ? "bg-[linear-gradient(90deg,rgb(var(--c-ink-900)/0.78),rgb(var(--c-ink-900)/0.3)_42%,transparent_62%),linear-gradient(180deg,rgb(var(--c-ink-900)/0.5),transparent_24%,transparent_52%,rgb(var(--c-ink-900)/0.94))]"
            : "bg-[linear-gradient(180deg,rgb(var(--c-ink-900)/0.5),transparent_24%,transparent_52%,rgb(var(--c-ink-900)/0.94))]",
        )}
      />
      {badge}
      <div className="relative z-10 -mt-24 px-5 pb-10 lg:absolute lg:inset-0 lg:mt-0 lg:p-0">{children}</div>
    </section>
  );
}

type Pos = { left?: string; right?: string; top?: string; bottom?: string };

/** The depth tiers as classes — shared by `WorldPane` and the cinematic story's entities. */
export const PANE_TIER = {
  focus:
    "bg-ink-900/60 shadow-[0_1px_0_rgb(255_255_255/0.2)_inset,0_0_0_1px_rgb(255_255_255/0.12),0_40px_90px_-30px_rgb(0_0_0/0.8)] backdrop-blur-2xl",
  context:
    "bg-ink-900/45 shadow-[0_1px_0_rgb(255_255_255/0.14)_inset,0_0_0_1px_rgb(255_255_255/0.08),0_30px_70px_-34px_rgb(0_0_0/0.7)] backdrop-blur-xl",
  quiet: "bg-ink-900/30 shadow-[0_0_0_1px_rgb(255_255_255/0.06)] backdrop-blur-md",
} as const;

/** A pane. `tier` encodes depth: focus > context > quiet. */
export function WorldPane({
  pos,
  w = "clamp(230px,23vw,340px)",
  tier = "context",
  delay = 0,
  children,
  className,
  label,
}: {
  pos?: Pos;
  w?: string;
  tier?: "focus" | "context" | "quiet";
  delay?: number;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const style = {
    "--l": pos?.left,
    "--r": pos?.right,
    "--t": pos?.top,
    "--b": pos?.bottom,
    "--w": w,
    animationDelay: `${delay}ms`,
  } as CSSProperties;
  return (
    <div
      role={label ? "group" : undefined}
      aria-label={label}
      style={style}
      className={cn(
        "world-in mb-3 rounded-[1.75rem] px-5 py-4 lg:absolute lg:mb-0 lg:left-[var(--l)] lg:right-[var(--r)] lg:top-[var(--t)] lg:bottom-[var(--b)] lg:w-[var(--w)]",
        PANE_TIER[tier],
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Pane type system: a quiet sentence-case label, a clear value, a soft meta. */
export function PaneLabel({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-support font-medium text-text-muted">
      {icon}
      {children}
    </p>
  );
}
export function PaneValue({ children, size = "md" }: { children: ReactNode; size?: "md" | "lg" | "xl" }) {
  return (
    <p
      className={cn(
        "mt-1.5 font-display font-bold leading-[1.08] tracking-tightest text-text-primary",
        size === "md" && "text-xl",
        size === "lg" && "text-3xl",
        size === "xl" && "text-4xl sm:text-5xl",
      )}
    >
      {children}
    </p>
  );
}
export function PaneMeta({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-support text-text-secondary">{children}</p>;
}

/** Leader lines: the relationships made visible. Desktop only; paths are in 0–100 space. */
export function WorldLines({
  paths,
}: {
  paths: readonly { d: string; tone?: "gold" | "success" | "line" | "dashed"; delay?: number; show?: boolean }[];
}) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          vectorEffect="non-scaling-stroke"
          strokeWidth="1.25"
          strokeDasharray={p.tone === "dashed" ? "4 6" : undefined}
          className={cn(
            p.show === undefined ? "world-line" : cn("transition-opacity duration-700 motion-reduce:transition-none", p.show ? "opacity-100" : "opacity-0"),
            p.tone === "gold" && "stroke-brand-blue",
            p.tone === "success" && "stroke-state-success",
            (!p.tone || p.tone === "line" || p.tone === "dashed") && "stroke-text-secondary/60",
          )}
          style={{ animationDelay: `${p.delay ?? 400}ms` }}
        />
      ))}
    </svg>
  );
}

/** A node where a line meets the person or a pane. */
export function WorldNode({
  x,
  y,
  tone = "gold",
  show,
}: {
  x: string;
  y: string;
  tone?: "gold" | "success" | "ring";
  show?: boolean;
}) {
  return (
    <i
      aria-hidden
      style={{ left: x, top: y }}
      className={cn(
        show === undefined ? "world-line" : cn("transition-opacity duration-700 motion-reduce:transition-none", show ? "opacity-100" : "opacity-0"),
        "pointer-events-none absolute z-10 hidden h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full lg:block",
        tone === "gold" && "bg-brand-blue shadow-[0_0_0_7px_rgb(var(--c-brand-blue)/0.16),0_0_26px_rgb(var(--c-brand-blue)/0.9)]",
        tone === "success" && "bg-state-success shadow-[0_0_0_7px_rgb(var(--c-state-success)/0.16),0_0_26px_rgb(var(--c-state-success)/0.9)]",
        tone === "ring" && "shadow-[inset_0_0_0_1.5px_rgb(var(--c-text-primary))]",
      )}
    />
  );
}

/** Persistent human identity: the same ring, in public and in product. */
export function PersonRing({
  src,
  name,
  initials,
  size = 48,
  focus,
  objectPosition = "36% 30%",
  zoom = 2.4,
}: {
  src?: string;
  name: string;
  initials: string;
  size?: number;
  focus?: boolean;
  objectPosition?: string;
  zoom?: number;
}) {
  const ring = focus
    ? "shadow-[0_0_0_2px_rgb(var(--c-brand-blue)/0.7),0_0_40px_rgb(var(--c-brand-blue)/0.25)]"
    : "shadow-[0_0_0_2px_rgb(var(--c-ink-900))]";
  return (
    <span
      role={name ? "img" : undefined}
      aria-label={name || undefined}
      aria-hidden={name ? undefined : true}
      style={{ width: size, height: size }}
      className={cn("relative inline-block shrink-0 overflow-hidden rounded-full bg-ink-700", ring)}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          sizes={`${size * 2}px`}
          className="object-cover"
          style={{ objectPosition, transform: `scale(${zoom})`, transformOrigin: objectPosition }}
        />
      ) : (
        <span className="grid h-full w-full place-items-center font-display text-support font-semibold text-brand-blue">
          {initials}
        </span>
      )}
    </span>
  );
}
