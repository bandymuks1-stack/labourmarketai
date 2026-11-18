import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * The CV's auth gate, hoisted ABOVE `cv/loading.tsx`.
 *
 * `loading.tsx` wraps everything below it in a Suspense boundary, and a
 * `redirect()` thrown inside a Suspense boundary can no longer set an HTTP
 * status — Next has already committed a 200. The page's own bounce
 * (`buildVerifiedCv()` → `not_authenticated` → `redirect(/auth/login)`) sits
 * under that boundary, so it was being downgraded to a 200 that streams the CV
 * skeleton to someone with no session and then redirects on the client.
 *
 * THIS WAS BELIEVED LATENT, AND IT WAS NOT. The middleware lists `/cv` in
 * `REQUIRES_AUTH`, which does catch every ANONYMOUS visitor (measured: 307 to
 * `/lt/auth/login?next=%2Flt%2Fcv`, 30 bytes, no shell). But the P0 fast path
 * above that gate returns as soon as the session cookie's `exp` is comfortably
 * in the future, and reading `exp` means base64-decoding the JWT payload —
 * never verifying its signature. That is deliberate and documented: the RSC
 * layer performs the real validated `getUser()` and RLS enforces authz. The
 * consequence is that a cookie GoTrue REJECTS but whose `exp` is still fresh —
 * a revoked session, a deleted user, a password change, or a forged value —
 * skips the middleware gate entirely and reaches this page unauthenticated.
 *
 * Measured on the local production build 2026-09-23, session cookie with a
 * corrupted signature and an unexpired `exp`:
 *
 *     /lt/cv          HTTP 200, 21 125 bytes, 15 chunks, cv-loading@2882
 *     /lt/onboarding  HTTP 307   (this same gate, in the onboarding layout)
 *     /lt/dashboard   HTTP 307   (this same gate, PR #1841)
 *
 * So `/cv` was the one remaining tree where that request streamed a document.
 * The page's own check STAYS — it is the authority on a soft navigation (React
 * reuses this layout, so it does not re-run) and it is what distinguishes
 * `no_worker` from `not_authenticated`. This gate only ever refuses EARLIER,
 * and it refuses to the exact same destination.
 *
 * `createClient` is `cache()`-wrapped and memoizes `auth.getUser()`, so this
 * shares the call `buildVerifiedCv()` makes a moment later — no extra
 * round-trip. The layout renders `children` unchanged: the CV prints, so it
 * must not gain a wrapper element.
 */
export default async function CvLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Byte-identical to the page's own bounce, so the two gates cannot disagree
  // about where a person without a session belongs.
  if (!user) redirect(`/${locale}/auth/login`);

  return <>{children}</>;
}
