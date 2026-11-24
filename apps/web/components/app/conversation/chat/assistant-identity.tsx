import { LmLogo } from "@/components/ui/lm-logo";

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
 * The mark is the CANONICAL LabourMarket.ai mark (`LmLogo`, the owner's
 * original vector) — the same artwork the one top bar wears, so the thing
 * speaking in the stream is visibly the thing named in the header: one
 * identity, not two. It used to be a yellow letter tile standing in for the
 * mark; a letter is not the brand (owner §19), and a second drawing would be
 * a fork of it, so this file renders the component and never an image, an
 * inline vector or a letter of its own.
 *
 * The tile is a NEUTRAL graphite token surface (not a gold fill): the mark's
 * own metallic ramp is the brand colour, and gold-on-gold would erase it.
 * Rendered at two sizes: the greeting eyebrow, and every assistant turn
 * including the typing indicator. Decorative (`aria-hidden`, empty logo
 * title) — each turn announces the assistant's NAME to assistive tech.
 */
const SIZE = {
  /** Beside the greeting eyebrow. */
  sm: "size-5 rounded-xs p-0.5",
  /** Every assistant turn and the typing indicator. */
  md: "size-7 rounded-sm p-1",
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
      className={`flex flex-none items-center justify-center border border-ink-500 bg-ink-800 ${SIZE[size]} ${className}`}
    >
      <LmLogo title="" className="size-full" />
    </span>
  );
}
