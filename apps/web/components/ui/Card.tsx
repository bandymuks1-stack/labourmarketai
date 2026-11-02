import { cn } from "@/lib/utils";

/**
 * Card — THE canonical surface primitive (visual contract v1,
 * docs/design/visual-contract-v1.md). One border/radius/elevation grammar:
 * every card in the product is `card-border` (18px radius, gradient hairline,
 * quiet inner glow — themed for dark and light via the --c-* channels).
 *
 * The audit found ~170 files repeating `card-border` by hand; this contract is
 * the migration target. Existing call sites migrate gradually (no big-bang);
 * the visual-contract guard ratchets raw usage so it can only shrink.
 *
 * Variants say what a surface IS, not what the product thinks of its content:
 *   standard    → default resting card
 *   interactive → hover glow + a focus ring when the focusable control inside
 *                 it has focus (the card itself stays a plain region; the real
 *                 <a>/<button> inside carries keyboard semantics)
 *   selected    → the one currently chosen item in a set
 *   muted       → present but visually recessed
 *   elevated    → raised above sibling cards (token shadow, no new grammar)
 *   empty       → an honest "nothing here yet" surface
 *   error       → a surface whose content failed to load
 *   disabled    → visually inert; callers must ALSO disable the controls
 *                 inside it — the primitive only paints, it cannot reach them
 *
 * No scoring, trust, verification or AI semantics live here — a card never
 * knows what the product claims about its content. Product-domain logic in
 * this file is a guard failure (visual-contract-v1.test.ts).
 */
export type CardVariant =
  | "standard"
  | "interactive"
  | "selected"
  | "muted"
  | "elevated"
  | "empty"
  | "error"
  | "disabled";

const variants: Record<CardVariant, string> = {
  standard: "",
  // glow-hover is the existing shared hover treatment (globals.css); the ring
  // lights when the link/button inside the card holds focus, so keyboard users
  // get the same affordance pointer users get from the glow.
  interactive:
    "glow-hover focus-within:ring-2 focus-within:ring-brand-blue/70",
  selected: "ring-2 ring-brand-blue/60",
  muted: "opacity-80",
  elevated: "shadow-card-hover",
  empty: "text-text-muted",
  error: "ring-1 ring-state-danger/50",
  disabled: "opacity-50 pointer-events-none select-none",
};

/**
 * Utilities a caller writes on <Card> to arrange ITS CONTENT (flex/grid,
 * direction, gaps, alignment, child spacing). The content lives in the inner
 * `relative` wrapper (it must stay positioned to paint above the card-border
 * glow), so on the outer div these utilities arranged one single child and
 * did nothing — production 2026-10-25: "LietuvaPERŽIŪRĖTI" on
 * /labour-market, and 44 call sites whose gap/justify never applied. They
 * now move to the inner wrapper; sizing of the card itself (flex-1, w-*, h-*,
 * self-*) and surface utilities stay on the outer div.
 */
const CONTENT_LAYOUT =
  /^(?:flex|inline-flex|grid|inline-grid|flex-(?:row|col|wrap|nowrap)(?:-reverse)?|gap(?:-[xy])?-.+|space-[xy]-.+|divide-.+|justify-(?:start|end|center|between|around|evenly|stretch|normal)|items-.+|place-(?:content|items)-.+|grid-(?:cols|rows|flow)-.+)$/;

export function splitCardClassName(className?: string): {
  surface: string;
  content: string;
} {
  const surface: string[] = [];
  const content: string[] = [];
  for (const token of (className ?? "").split(/\s+/).filter(Boolean)) {
    // Variant prefixes (sm:, hover:, …) — the utility is after the last ":".
    const utility = token.slice(token.lastIndexOf(":") + 1).replace(/^!/, "");
    (CONTENT_LAYOUT.test(utility) ? content : surface).push(token);
  }
  return { surface: surface.join(" "), content: content.join(" ") };
}

export function Card({
  label,
  live,
  variant = "standard",
  compact = false,
  className,
  children,
}: {
  label?: string;
  live?: boolean;
  variant?: CardVariant;
  /** Dense listing contexts: p-4 instead of the default p-6. */
  compact?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { surface, content } = splitCardClassName(className);
  return (
    <div
      data-variant={variant === "standard" ? undefined : variant}
      className={cn(
        "card-border",
        compact ? "p-4" : "p-6",
        variants[variant],
        // A content layout makes the card a column so the inner wrapper can
        // fill it (justify-center on a stretched card keeps working).
        content && "flex flex-col",
        surface,
      )}
    >
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
      <div className={cn("relative", content && "min-w-0 flex-1", content)}>{children}</div>
    </div>
  );
}
