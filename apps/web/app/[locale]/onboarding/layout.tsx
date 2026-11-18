import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import {
  AUTH_CLIENT_MESSAGE_ROOTS,
  pickMessages,
} from "@/lib/i18n/client-messages";
import { getSessionProfile } from "@/lib/auth/session-profile";
import {
  ONBOARDING_RETURN_HEADER,
  getSafeReturnPath,
} from "@/lib/auth/redirect";

/** Performance Reality Audit v2 (route-group provider subsetting): the
 *  onboarding tree's client components (OnboardingWizard) reach only the
 *  `auth` namespace, so this provider REPLACES the root layout's minimal
 *  message context with the auth pick (~28 KB) instead of the union client
 *  pick (~300 KB serialized). Purely a message-scope wrapper — no chrome,
 *  no layout change. Re-derived from this tree's import graph by
 *  lib/guards/client-messages-allowlist.test.ts on every CI run. */
/** Private flow: never indexable — robots.txt disallow alone does not stop
 *  URL-only indexing from inbound links. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function OnboardingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // ── THE LIFECYCLE GATE, WHERE IT CAN STILL BE AN HTTP REDIRECT ────────────
  //
  // Same defect, same mechanism, same fix as the dashboard's role gate
  // (PR #1841 — see `lib/auth/role-gated-routes.ts`). `onboarding/loading.tsx`
  // wraps everything below this layout in a Suspense boundary, and a
  // `redirect()` thrown inside a Suspense boundary can no longer set an HTTP
  // status: Next has already committed a 200, so the browser performs the
  // redirect itself after painting Next's `__next_error__` shell
  // ("Application error: a client-side exception has occurred").
  //
  // Measured on the local production build 2026-09-22 with an ONBOARDED
  // fixture session: `GET /lt/onboarding` → HTTP 200, 60 346 bytes, 20 chunks —
  // the onboarding skeleton and form streamed to someone who had already
  // finished onboarding, and only then did the browser move. The counter-proof
  // is `/lt/live-market-review`, which has no `loading.tsx` above it and
  // answers a real 307 from the same kind of page-level `redirect()`.
  //
  // This layout is the last frame ABOVE that boundary. It adds NO new reader:
  // `getSessionProfile()` is the ONE request-cached `profiles` read, and the
  // page below now shares it instead of running a second SELECT of its own —
  // so this removes a duplicate read rather than adding one. The page keeps
  // its own copies of both checks: they are the authority on a soft navigation
  // (React reuses this layout, so it does not re-run) and on any request where
  // the middleware header never arrived.
  const session = await getSessionProfile();
  if (!session.user) redirect(`/${locale}/auth/login`);

  // A FAILED profile read is not "already onboarded" (W6 honesty). `profile`
  // is null in both cases, and falling through to the wizard is the safe
  // direction: the person can finish onboarding again, where a bounce would
  // strand them. This is the behaviour the page already had.
  if (session.profile?.onboarded_at) {
    // WHERE they were going is the one fact a layout cannot see — Next hands
    // it no query string — so the middleware resolves `?next=` through
    // `getSafeReturnPath` and passes the result. Without it every invite link
    // and landing door would silently collapse to the bare dashboard.
    //
    // SANITISED AGAIN HERE, and not out of superstition. `withGateHeaders`
    // replaces any inbound header of this name, but only on a GET — a POST
    // (a server action re-rendering through this layout) keeps the request
    // untouched, so a header the client supplied could reach this line. Run
    // through the same pure sanitiser it is idempotent, and the redirect
    // cannot leave the origin no matter who wrote the value. `null` (header
    // absent: non-GET, or middleware skipped) resolves to the same
    // `/<locale>/dashboard` default, so the fallback needs no second spelling.
    const returnTo = (await headers()).get(ONBOARDING_RETURN_HEADER);
    redirect(getSafeReturnPath(returnTo, locale));
  }

  return (
    <NextIntlClientProvider
      messages={pickMessages(await getMessages(), AUTH_CLIENT_MESSAGE_ROOTS)}
    >
      {children}
    </NextIntlClientProvider>
  );
}
