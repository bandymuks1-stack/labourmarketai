import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link callback. Supabase redirects here after the user clicks the
 * email link, with `?code=…` (PKCE flow). We exchange it for a session
 * cookie, then route the user to:
 *   • `/[locale]/onboarding` if they haven't onboarded yet
 *   • `/[locale]/dashboard`  otherwise
 * On any failure we bounce to `/[locale]/auth/login?error=callback`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const loginUrl = new URL(`/${locale}/auth/login`, url.origin);

  if (!code) {
    loginUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      loginUrl.searchParams.set("error", "exchange_failed");
      return NextResponse.redirect(loginUrl);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      loginUrl.searchParams.set("error", "no_user");
      return NextResponse.redirect(loginUrl);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", user.id)
      .single();

    const next = profile?.onboarded_at
      ? `/${locale}/dashboard`
      : `/${locale}/onboarding`;
    return NextResponse.redirect(new URL(next, url.origin));
  } catch {
    loginUrl.searchParams.set("error", "callback");
    return NextResponse.redirect(loginUrl);
  }
}
