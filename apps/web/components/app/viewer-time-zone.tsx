"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { VIEWER_TZ_COOKIE, isValidTimeZone } from "@/lib/time/local-day";

/**
 * Tells the server which IANA zone the viewer lives in (cookie `lm_tz`) so
 * "today" and "is this work day in the future" are judged in the person's own
 * frame — the same frame the composer stamps `work_date` in (see
 * `lib/time/local-day.ts`). Not personal data beyond a zone name; session
 * cookie semantics are not needed, so it carries a one-year max-age. When the
 * value changes (first visit, travel) the current page is refreshed once so
 * the figures already rendered are re-read in the right frame.
 */
export function ViewerTimeZone() {
  const router = useRouter();
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!isValidTimeZone(tz)) return;
      const current = document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${VIEWER_TZ_COOKIE}=`))
        ?.split("=")[1];
      if (current && decodeURIComponent(current) === tz) return;
      document.cookie = `${VIEWER_TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    } catch {
      /* no cookie access — the server falls back to the UTC+1 horizon */
    }
  }, [router]);
  return null;
}
