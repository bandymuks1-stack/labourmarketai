/**
 * Auth provider configuration STRUCTURE.
 *
 * This describes how sign-in providers will be wired. It contains no secrets
 * and performs no authentication. Statuses are honest:
 *
 *  - "prepared"     UI + config structure exist; credentials are not connected
 *                   yet, so it does not actually sign anyone in.
 *  - "coming-soon"  Placeholder only; intentionally disabled.
 *
 * Nothing here should ever claim a provider works before it is wired.
 */
export type ProviderStatus = "prepared" | "coming-soon";

export type ProviderId = "google" | "facebook" | "instagram";

export interface AuthProvider {
  id: ProviderId;
  label: string;
  status: ProviderStatus;
  /** Honest, user-facing explanation of the current state. */
  note: string;
  /** Environment keys this provider will read once wired. No values here. */
  envKeys: string[];
}

export const AUTH_PROVIDERS: AuthProvider[] = [
  {
    id: "google",
    label: "Continue with Google",
    status: "prepared",
    note: "OAuth structure ready. Credentials are not connected yet — this does not sign you in.",
    envKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  },
  {
    id: "facebook",
    label: "Continue with Facebook",
    status: "coming-soon",
    note: "Provider placeholder — intentionally disabled.",
    envKeys: [],
  },
  {
    id: "instagram",
    label: "Continue with Instagram",
    status: "coming-soon",
    note: "Provider placeholder — intentionally disabled.",
    envKeys: [],
  },
];

export function isProviderInteractive(provider: AuthProvider): boolean {
  // No provider is interactive yet: "prepared" still needs wired credentials
  // and "coming-soon" is a deliberate placeholder. Kept as a single gate so
  // wiring a real provider later is a one-line change here.
  return provider.status !== "prepared" && provider.status !== "coming-soon";
}
