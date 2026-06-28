import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary: "bg-gradient-cta text-white shadow-cta-glow hover:opacity-95",
  secondary:
    "border border-ink-500 text-text-primary hover:border-brand-blue",
  ghost: "text-text-secondary hover:text-text-primary",
};

const sizes: Record<Size, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-6 py-3 text-sm",
};

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
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <ButtonSpinner />}
      {children}
    </button>
  );
}
