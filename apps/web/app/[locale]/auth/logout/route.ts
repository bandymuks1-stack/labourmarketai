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
  return NextResponse.redirect(new URL(`/${locale}`, url.origin));
}

/** Accept POST (form submit from the dashboard) and GET (direct link), both
 *  clear the session and return the visitor to the locale home. */
export const POST = handle;
export const GET = handle;
