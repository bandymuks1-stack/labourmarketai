"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "@/lib/i18n/navigation";

/**
 * Silent server-data refresh for surfaces whose state changes while the
 * user is away (unread messages, booking responses). Re-runs the current
 * route's server components via router.refresh() when the tab regains
 * focus / becomes visible, and on a gentle interval while visible.
 *
 * Honest by construction: it only re-reads REAL server state — it never
 * simulates realtime, never invents "delivered/read" transitions. Throttled
 * so rapid alt-tabbing cannot hammer the server.
 */
export function RefreshOnFocus({
  intervalMs = 60_000,
  minGapMs = 15_000,
}: {
  intervalMs?: number;
  minGapMs?: number;
}) {
  const router = useRouter();
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    const refresh = () => {
      const now = Date.now();
      if (now - lastRefreshAt.current < minGapMs) return;
      lastRefreshAt.current = now;
      router.refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [router, intervalMs, minGapMs]);

  return null;
}
