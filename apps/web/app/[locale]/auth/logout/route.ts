import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function handle(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Logout should never error to the user; cookies still cleared by signOut.
  }
  const url = new URL(request.url);
  // Localized login (not the locale home) so the next action after sign
  // out is unambiguous: re-authenticate, switch account, or close the
  // tab. Owner-requested in the account-menu-logout-admin-visibility
  // hotfix doc.
  return NextResponse.redirect(new URL(`/${locale}/auth/login`, url.origin));
}

/** Accept POST (form submit from the dashboard) and GET (direct link), both
 *  clear the session and route the visitor to the localized login page. */
export const POST = handle;
export const GET = handle;
