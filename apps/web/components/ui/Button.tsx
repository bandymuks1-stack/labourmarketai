import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "pill";
type Size = "sm" | "md";

// Shape and weight live in the variant strings (not `base`) because `cn` is a
// plain joiner with no conflict resolution: a variant could never override a
// `rounded-md`/`font-semibold` baked into the base. Each variant therefore
// spells out its full look; the rendered class SET for the three original
// variants is unchanged.
const base =
  "inline-flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary:
    "rounded-md font-semibold bg-gradient-cta text-white shadow-cta-glow hover:opacity-95",
  secondary:
    "rounded-md font-semibold border border-ink-500 text-text-primary hover:border-brand-blue",
  ghost: "rounded-md font-semibold text-text-secondary hover:text-text-primary",
  // THE canonical quiet pill action (visual contract v1). Result components
  // repeated this exact string by hand (~11 sites); the guard ratchets the raw
  // string so new call sites must come here instead. min-h-11 = 44px touch
  // target (audit PR8).
  pill: "min-h-11 rounded-full font-medium border border-ink-500 text-text-secondary hover:border-brand-blue hover:text-brand-blue",
};

const sizes: Record<Size, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-6 py-3 text-sm",
};

/** The pill sets its own height (min-h-11) and type role; the sm/md paddings
 *  would fight it, so it carries a fixed size. */
const pillSize = "px-3.5 text-support";

/**
 * Link-shaped pill CTAs (next-intl <Link> / <a>) can't render a <button>; they
 * share the exact same grammar through this constant instead of re-typing the
 * class string. Layout (e.g. `self-start`) stays at the call site.
 */
export const pillLinkClassName = cn(base, variants.pill, pillSize);

/** Inline pending spinner — same border-spinner idiom as `NavLinkPending`, so
 *  the loading affordance is consistent across the app. Honours
 *  prefers-reduced-motion via Tailwind's `motion-reduce` variant. */
function ButtonSpinner() {
  return (
    <span
      aria-hidden
      data-testid="button-spinner"
      className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent align-middle motion-reduce:animate-none"
    />
  );
}

/**
 * Shared button. Adds an honest `loading` state on top of the existing
 * variants: when `loading` is true the button shows a spinner, sets
 * `aria-busy`, and is disabled so a slow async action can't be double-fired.
 * `disabled` styling stays explicit (`disabled:opacity-50` + `cursor-not-allowed`)
 * so the not-pressable state reads clearly. Success/error feedback stays the
 * caller's responsibility (surrounding copy), keeping this primitive generic.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      className={cn(
        base,
        variants[variant],
        variant === "pill" ? pillSize : sizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <ButtonSpinner />}
      {children}
    </button>
  );
}
