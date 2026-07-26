/**
 * The assistant's identity — ONE mark, used everywhere it speaks.
 *
 * The audit found the assistant was an anonymous `Sparkles` glyph: no name, no
 * consistent presence. Advice from a nameless box reads as output from a form,
 * which is the opposite of the "professional career consultant" this product is
 * meant to be.
 *
 * DELIBERATELY NOT a mascot. No character, no face, no anthropomorphic
 * illustration, no invented human name — the repo defines no canonical
 * assistant name (the only candidate found is the PLATFORM name, not an
 * assistant one), so per the owner brief the product name is used and the
 * naming decision stays open for the owner.
 *
 * The mark is the SAME square-L product mark the header wears, so the thing
 * speaking in the stream is visibly the thing named in the header — one
 * identity, not two. Rendered at two sizes: the greeting eyebrow, and every
 * assistant turn including the typing indicator.
 */
const SIZE = {
  /** Beside the greeting eyebrow. */
  sm: "size-5 text-meta rounded-xs",
  /** Every assistant turn and the typing indicator. */
  md: "size-7 text-meta rounded-sm",
} as const;

export function AssistantMark({
  size = "md",
  className = "",
}: {
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-testid="assistant-mark"
      className={`flex flex-none items-center justify-center bg-brand-blue font-display font-bold text-white ${SIZE[size]} ${className}`}
    >
      L
    </span>
  );
}
