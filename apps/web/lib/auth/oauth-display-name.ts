/**
 * OAuth display-name repair — the pure decision behind the callback route.
 *
 * Where the synthetic value comes from: the onboarding wizard defaults the
 * name field to the e-mail local part when nothing better is known
 * (`app/[locale]/onboarding/page.tsx`, `emailLocal`), and people accept the
 * default. Later, a social sign-in (Google / LinkedIn / Facebook) delivers a
 * real human name in `user.user_metadata`. This module decides whether that
 * provider name may replace the stored one.
 *
 * Contract (pinned by oauth-display-name.test.ts):
 *   • repair ONLY when the stored name still equals the e-mail local part
 *     (case-insensitive, whitespace-trimmed) — a clearly synthetic value;
 *   • never touch a name a human entered (anything else, including empty —
 *     an empty name is the onboarding wizard's job, not a silent write);
 *   • the provider name must be a bounded, non-e-mail string (2–120 chars);
 *   • the returned `syntheticName` is the EXACT stored value so the caller
 *     can use it as a compare-and-set guard in the UPDATE (`eq(full_name,
 *     syntheticName)`) — a concurrent human edit then makes the write a
 *     no-op instead of an overwrite.
 *
 * No I/O here; the route owns the writes and their RLS (own-row only).
 */

export type OauthDisplayNameRepair =
  | { repair: false; reason: "no_provider_name" | "no_email" | "stored_not_synthetic" }
  | { repair: true; providerName: string; syntheticName: string };

export const PROVIDER_NAME_MIN = 2;
export const PROVIDER_NAME_MAX = 120;

/** First bounded, non-e-mail string among the provider's name claims. */
export function pickProviderName(
  userMetadata: Record<string, unknown> | null | undefined,
): string | null {
  const meta = userMetadata ?? {};
  for (const key of ["full_name", "name"] as const) {
    const value = meta[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (
      trimmed.length >= PROVIDER_NAME_MIN &&
      trimmed.length <= PROVIDER_NAME_MAX &&
      !trimmed.includes("@")
    ) {
      return trimmed;
    }
  }
  return null;
}

export function decideOauthDisplayNameRepair(input: {
  /** `profiles.full_name` as stored (raw, untrimmed). */
  storedFullName: string | null | undefined;
  /** `profiles.email`, falling back to the auth user's e-mail. */
  profileEmail: string | null | undefined;
  userEmail: string | null | undefined;
  userMetadata: Record<string, unknown> | null | undefined;
}): OauthDisplayNameRepair {
  const providerName = pickProviderName(input.userMetadata);
  if (!providerName) return { repair: false, reason: "no_provider_name" };

  const email = (input.profileEmail ?? input.userEmail ?? "").trim();
  const localPart = email.split("@")[0]?.trim() ?? "";
  if (!localPart) return { repair: false, reason: "no_email" };

  const stored = input.storedFullName ?? "";
  const storedTrimmed = stored.trim();
  if (
    storedTrimmed.length === 0 ||
    storedTrimmed.toLocaleLowerCase() !== localPart.toLocaleLowerCase()
  ) {
    return { repair: false, reason: "stored_not_synthetic" };
  }
  // Already the provider name (e.g. the person is literally named like their
  // local part and the provider agrees) → nothing to write.
  if (storedTrimmed === providerName) {
    return { repair: false, reason: "stored_not_synthetic" };
  }
  return { repair: true, providerName, syntheticName: stored };
}
