import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "@/lib/i18n/routing";
import { env } from "@/lib/env";
import {
  CANONICAL_ORIGIN,
  isLegacyRedirectHost,
} from "@/lib/domain/canonical";

const intl = createIntlMiddleware(routing);

/** Pure host-normalization: if request lands on labourmarket.ai
 *  or www.labourmarket.ai, 308-redirect to the canonical
 *  app.labourmarket.ai origin preserving path + query. Returns
 *  undefined when no redirect is needed. */
function maybeRedirectToCanonicalHost(request: NextRequest): NextResponse | undefined {
  const host = request.headers.get("host");
  if (!isLegacyRedirectHost(host)) return undefined;
  const target = new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    CANONICAL_ORIGIN,
  );
  // 308 = permanent + method-preserving. Owner wants the apex/www
  // surface to stop showing old LABMA content; the redirect makes
  // every request land on the new labourmarket.ai product.
  return NextResponse.redirect(target, 308);
}

/** Locale-stripped pathname, e.g. "/lt/dashboard" → "/dashboard". */
function stripLocale(pathname: string): { locale: string; rest: string } {
  const parts = pathname.split("/");
  const maybeLocale = parts[1];
  if ((routing.locales as readonly string[]).includes(maybeLocale)) {
    return { locale: maybeLocale, rest: "/" + parts.slice(2).join("/") };
  }
  return { locale: routing.defaultLocale, rest: pathname };
}

const REQUIRES_AUTH = ["/dashboard", "/onboarding"];

export async function middleware(request: NextRequest) {
  // 0. Canonical host normalization runs BEFORE locale/intl + auth
  //    so labourmarket.ai + www.labourmarket.ai never even reach
  //    the app shell — they 308 straight to app.labourmarket.ai.
  const hostRedirect = maybeRedirectToCanonicalHost(request);
  if (hostRedirect) return hostRedirect;

  // 1. Locale routing — may redirect (`/` → `/lt`) or rewrite.
  const intlResponse = intl(request);

  const { locale, rest } = stripLocale(request.nextUrl.pathname);
  const needsAuth = REQUIRES_AUTH.some((p) => rest === p || rest.startsWith(p + "/"));
  const onboardingPage = rest === "/onboarding";

  // Marketing / auth flow / static routes — no session check needed.
  if (!needsAuth) return intlResponse;

  // Without the anon key configured we cannot check the session; let the
  // request through (page itself will surface the misconfiguration).
  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return intlResponse;

  // 2. Authenticated route — verify session and onboarding state.
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `/${locale}/auth/login`;
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Gate /dashboard behind onboarding; /onboarding itself is allowed.
  if (!onboardingPage) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", user.id)
      .single();
    if (!profile?.onboarded_at) {
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}/onboarding`;
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Run on everything except API, Next internals and static files.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
