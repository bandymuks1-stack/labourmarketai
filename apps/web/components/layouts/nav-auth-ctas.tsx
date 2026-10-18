"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * The public header's auth slot for someone who is ALREADY signed in.
 *
 * The marketing shell is static-friendly on purpose (the board and ~39,000
 * public job pages must not pay a server session read per anonymous hit), so
 * the header cannot ask the server who is looking. The session cookie
 * `@supabase/ssr` writes (`sb-<ref>-auth-token`, possibly chunked) is readable
 * here, which is enough to stop offering "Sign in / Start now" to a person who
 * is in (owner audit 2026-10-02: a signed-in worker on /jobs was asked to sign
 * in). The first paint is always the guest slot, so server and client markup
 * agree; the swap happens after hydration.
 *
 * It is a presentation hint, never an authorisation decision: a stale or forged
 * cookie only changes which link is shown, and /dashboard re-checks the session.
 */
function hasAuthCookie(): boolean {
  try {
    return document.cookie
      .split("; ")
      .some((c) => c.startsWith("sb-") && c.split("=")[0].includes("auth-token"));
  } catch {
    return false;
  }
}

export function NavAuthCtas({
  guest,
  member,
}: {
  guest: ReactNode;
  member: ReactNode;
}) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    setSignedIn(hasAuthCookie());
  }, []);
  return <>{signedIn ? member : guest}</>;
}
