import Image from "next/image";
import { cn } from "@/lib/utils";

export function Avatar({
  src,
  alt,
  initials,
  size = 48,
  glow = false,
}: {
  src?: string;
  alt: string;
  initials?: string;
  size?: number;
  glow?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-grid place-items-center overflow-hidden rounded-full border border-ink-500 bg-ink-700 text-text-secondary",
        glow && "shadow-portrait",
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="font-display text-sm font-semibold">
          {initials ?? "?"}
        </span>
      )}
    </span>
  );
}
