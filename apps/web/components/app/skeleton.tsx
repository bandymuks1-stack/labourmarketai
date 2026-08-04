/**
 * SKELETON — the platform's ONE loading placeholder primitive.
 *
 * Before this file, every loading surface hand-rolled the same markup:
 * `animate-pulse`, `h-N rounded-lg border border-ink-600/40 bg-ink-800/50`,
 * `aria-hidden`. Three route loaders had drifted into three slightly
 * different rhythms. This is that markup, named once.
 *
 * Pure presentation. No data, no claims, nothing fake — a skeleton must never
 * imply the shape of content that will not arrive, so the shapes here are
 * deliberately neutral blocks rather than fake cards with fake avatars.
 *
 * ── ACCESSIBILITY, and an honest limitation ────────────────────────────────
 *
 * `SkeletonScreen` has two modes:
 *
 *   - LABELLED (`label` given): the container is `role="status"`
 *     `aria-live="polite"` `aria-busy="true"` with a visually-hidden
 *     translated sentence, and every block is `aria-hidden`. A screen-reader
 *     user is told the region is loading. Use this everywhere you can.
 *
 *   - UNLABELLED (no `label`): the container is `aria-hidden` — the
 *     pre-existing behaviour. A `role="status"` with no text announces
 *     nothing, so an unlabelled status region would be a false accessibility
 *     claim rather than a real one.
 *
 * Route-level `loading.tsx` files use the UNLABELLED mode on purpose. They are
 * Suspense fallbacks and must render synchronously — an async server component
 * would itself suspend (destroying the instant paint the boundary exists for),
 * and a `"use client"` one would pull a new message namespace into the client
 * bundle that the allowlist guard deliberately keeps out. Labelling those is a
 * real follow-up, not something to fake here.
 */

/** Neutral block sizes, so callers compose rhythm instead of inventing pixels. */
const BLOCK_HEIGHT = {
  line: "h-4",
  heading: "h-8",
  control: "h-11",
  card: "h-28",
  panel: "h-44",
} as const;

export type SkeletonBlockSize = keyof typeof BLOCK_HEIGHT;

/**
 * One placeholder block. `surface` renders the bordered card fill; `solid`
 * renders the flat bar used for headings and text lines.
 *
 * `height` and `radius` REPLACE the preset classes rather than being appended
 * next to them. Appending would leave two competing utilities on the element
 * (`h-44 h-32`), and Tailwind resolves that by stylesheet order, not by
 * attribute order — so the override would silently lose. There is no
 * conflict-merging helper in this codebase to lean on.
 */
export function SkeletonBlock({
  size = "line",
  width,
  height,
  radius,
  variant = "solid",
  className = "",
}: {
  size?: SkeletonBlockSize;
  /** Tailwind width class, e.g. "w-40". Defaults to full width. */
  width?: string;
  /** Tailwind height class, e.g. "h-32". REPLACES the `size` preset. */
  height?: string;
  /** Tailwind radius class, e.g. "rounded-full". REPLACES the variant's. */
  radius?: string;
  variant?: "solid" | "surface";
  className?: string;
}) {
  const fill =
    variant === "surface"
      ? "border border-ink-600/40 bg-ink-800/50"
      : "bg-ink-700/70";
  const defaultRadius = variant === "surface" ? "rounded-lg" : "rounded-md";
  const classes = [
    height ?? BLOCK_HEIGHT[size],
    width ?? "w-full",
    radius ?? defaultRadius,
    fill,
    className,
  ]
    .filter((c) => c.length > 0)
    .join(" ");
  return <div aria-hidden className={classes} />;
}

/**
 * A run of text lines. The last line is short, because real paragraphs end
 * mid-line — a block of equal-length bars reads as a table, not as prose.
 */
export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  const count = Math.max(1, Math.min(12, Math.floor(lines)));
  return (
    <div className={`flex flex-col gap-2 ${className}`.trim()}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBlock
          key={i}
          size="line"
          width={i === count - 1 ? "w-2/3" : "w-full"}
        />
      ))}
    </div>
  );
}

/** A grid of card placeholders — the shape most dashboard sections load into. */
export function SkeletonCardGrid({
  count = 3,
  size = "card",
  height,
  columns = "sm:grid-cols-2 lg:grid-cols-3",
  className = "",
}: {
  count?: number;
  size?: Extract<SkeletonBlockSize, "card" | "panel">;
  /** Tailwind height class replacing the `size` preset for every card. */
  height?: string;
  /** Responsive column classes — the grid's shape is a caller decision. */
  columns?: string;
  className?: string;
}) {
  const n = Math.max(1, Math.min(12, Math.floor(count)));
  return (
    <div className={`grid gap-4 ${columns} ${className}`.trim()}>
      {Array.from({ length: n }, (_, i) => (
        <SkeletonBlock key={i} size={size} height={height} variant="surface" />
      ))}
    </div>
  );
}

/**
 * The container. Owns the pulse animation and the accessibility contract, so
 * a caller can never ship a skeleton that pulses without one or announces
 * without text. See the module header for why `label` is optional.
 */
export function SkeletonScreen({
  label,
  children,
  className = "",
  testId = "skeleton-screen",
}: {
  /** Already-translated "loading" sentence. Omit only where translation is
   *  genuinely unavailable — see the module header. */
  label?: string;
  /** Optional: an empty container is a valid (if plain) placeholder, and
   *  keeping it optional lets callers use React.createElement's variadic
   *  children form, which the lint rules require. */
  children?: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  const labelled = typeof label === "string" && label.trim().length > 0;
  return (
    <div
      data-testid={testId}
      className={`flex animate-pulse flex-col gap-6 ${className}`.trim()}
      {...(labelled
        ? { role: "status", "aria-live": "polite" as const, "aria-busy": true }
        : { "aria-hidden": true })}
    >
      {labelled ? <span className="sr-only">{label}</span> : null}
      {children}
    </div>
  );
}
