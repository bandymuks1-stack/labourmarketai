import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * ONE professional identity mark, three honest states:
 *   - photo     a portrait we are allowed to show (real_portrait, or a labelled
 *               sample_fixture — see public-imagery.ts)
 *   - initials  NO PORTRAIT: a premium mark, never a grey silhouette
 * Marketing photography is not a portrait and uses <Image> directly.
 */
export function ProfessionalPortrait({
  name,
  initials,
  src,
  size = 40,
  className,
}: {
  name: string;
  initials: string;
  src?: string;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size } as const;
  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={size * 2}
        height={size * 2}
        style={style}
        className={cn("shrink-0 rounded-full object-cover object-top", className)}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={name}
      style={{ ...style, fontSize: Math.round(size * 0.38) }}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-ink-600 to-ink-800 font-display font-semibold text-brand-blue",
        className,
      )}
    >
      {initials}
    </span>
  );
}
