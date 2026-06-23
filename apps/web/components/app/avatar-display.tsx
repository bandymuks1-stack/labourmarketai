import { avatarMonogram } from "@/lib/visual/avatar-monogram";

/**
 * Avatar display with an honest initials-monogram fallback. When the user has
 * uploaded a consented photo we render it (from a short-lived signed URL);
 * otherwise we show their initials — never a synthesised or placeholder face.
 */
export function AvatarDisplay({
  signedUrl,
  displayName,
  alt,
  size = "md",
}: {
  signedUrl: string | null;
  displayName: string;
  alt: string;
  size?: "md" | "lg";
}) {
  const dim = size === "lg" ? "h-20 w-20 text-xl" : "h-14 w-14 text-base";
  if (signedUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={signedUrl}
        alt={alt}
        data-testid="avatar-photo"
        className={`${dim} shrink-0 rounded-full border border-ink-500 object-cover`}
        loading="lazy"
      />
    );
  }
  return (
    <div
      data-testid="avatar-monogram"
      aria-hidden
      className={`${dim} flex shrink-0 items-center justify-center rounded-full border border-ink-500 bg-ink-800 font-semibold text-text-secondary`}
    >
      {avatarMonogram(displayName)}
    </div>
  );
}