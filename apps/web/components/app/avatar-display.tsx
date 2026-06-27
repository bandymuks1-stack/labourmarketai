import { avatarMonogram } from "@/lib/visual/avatar-monogram";
import {
  PLAYER_IDENTITY_AVATAR_BORDER,
  PLAYER_IDENTITY_FALLBACK_SURFACE,
} from "@/lib/identity/player-identity";

/**
 * Avatar display with an honest initials-monogram fallback. When the user has
 * uploaded a consented photo we render it (from a short-lived signed URL);
 * otherwise we show their initials — never a synthesised or placeholder face.
 *
 * The photo border + monogram tile use the shared Player Identity foundation, so
 * the profile avatar matches the player card header and map marker fallback
 * (one identity tile everywhere). See lib/identity/player-identity.ts.
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
        className={`${dim} shrink-0 rounded-full ${PLAYER_IDENTITY_AVATAR_BORDER} object-cover`}
        loading="lazy"
      />
    );
  }
  return (
    <div
      data-testid="avatar-monogram"
      aria-hidden
      className={`${dim} flex shrink-0 items-center justify-center rounded-full ${PLAYER_IDENTITY_AVATAR_BORDER} ${PLAYER_IDENTITY_FALLBACK_SURFACE} font-semibold`}
    >
      {avatarMonogram(displayName)}
    </div>
  );
}