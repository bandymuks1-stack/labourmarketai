import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/app/login-form";
import { getEnabledProviders } from "@/lib/auth/enabled-providers";

/** The provider surface can change without a deploy (owner flips a provider
 *  in the auth dashboard; the 300 s settings cache expires), so the page
 *  revalidates on the same window instead of being frozen at build time. */
export const revalidate = 300;

/** Login page. The form reads `?next=…` via `useSearchParams()`, so we wrap
 *  it in `<Suspense>` to keep the rest of the auth shell statically
 *  prerenderable (Next 15 requirement for CSR-bailout components).
 *
 *  Provider flags are fetched HERE (server) from the auth server's own
 *  settings endpoint and passed down as plain booleans — the client form
 *  never guesses which providers exist (§18: never advertise a sign-in
 *  button the auth server cannot complete). */
export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const providers = await getEnabledProviders();
  return (
    <Suspense fallback={null}>
      <LoginForm
        linkedinEnabled={providers.linkedin_oidc}
        facebookEnabled={providers.facebook}
      />
    </Suspense>
  );
}
