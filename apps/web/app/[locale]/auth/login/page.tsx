import { authPageMetadata } from "@/lib/auth/auth-page-metadata";
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
    // The form reads the URL on the client, so it is not in the server's HTML: it
    // appears once the scripts have run (5–6 s on a slow phone). Until then the page
    // shows the form's outline AT THE FORM'S HEIGHT, not nothing. With nothing there,
    // the consent notice below the form sat where the form would be and jumped down
    // when it arrived (a measured layout shift of 0.11 on every load).
    <Suspense fallback={<LoginFormSkeleton />}>
      <LoginForm
        linkedinEnabled={providers.linkedin_oidc}
        facebookEnabled={providers.facebook}
      />
    </Suspense>
  );
}

/**
 * The sign-in form's outline. Its height is the height of the shortest real form
 * (measured on the live page: 778–875 px across four languages and four widths), so
 * what follows the form starts where it will stay. Decorative: hidden from assistive
 * technology, which is told the region is loading.
 */
function LoginFormSkeleton() {
  return (
    <div className="flex min-h-[48.5rem] flex-col gap-5 sm:gap-6" aria-busy="true" data-testid="login-form-skeleton">
      <div aria-hidden className="flex flex-col gap-3">
        <div className="h-9 w-2/3 animate-pulse rounded-md bg-ink-700/40" />
        <div className="h-4 w-full animate-pulse rounded-md bg-ink-700/30" />
      </div>
      <div aria-hidden className="flex flex-col gap-3">
        <div className="h-11 w-full animate-pulse rounded-md bg-ink-700/30" />
        <div className="h-11 w-full animate-pulse rounded-md bg-ink-700/30" />
        <div className="h-11 w-full animate-pulse rounded-md bg-ink-700/30" />
      </div>
      <div aria-hidden className="flex flex-col gap-4">
        <div className="h-11 w-full animate-pulse rounded-md bg-ink-700/30" />
        <div className="h-11 w-full animate-pulse rounded-md bg-ink-700/30" />
        <div className="h-11 w-full animate-pulse rounded-md bg-ink-700/50" />
      </div>
    </div>
  );
}
