import { authPageMetadata } from "@/lib/auth/auth-page-metadata";
import { setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/app/login-form";
import { getEnabledProviders } from "@/lib/auth/enabled-providers";

/** The provider surface can change without a deploy (owner flips a provider
 *  in the auth dashboard; the 300 s settings cache expires), so the page
 *  revalidates on the same window instead of being frozen at build time. */
export const revalidate = 300;

/** Login page. The form is in the server HTML: it reads `?next=…` through
 *  `useUrlQuery` (lib/auth/use-url-query.ts), which does not make Next drop
 *  the component from the prerender the way `useSearchParams()` did.
 *
 *  Provider flags are fetched HERE (server) from the auth server's own
 *  settings endpoint and passed down as plain booleans — the client form
 *  never guesses which providers exist (§18: never advertise a sign-in
 *  button the auth server cannot complete). */
export function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return authPageMetadata(params, "login");
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const providers = await getEnabledProviders();
  return (
    <LoginForm
      linkedinEnabled={providers.linkedin_oidc}
      facebookEnabled={providers.facebook}
    />
  );
}
