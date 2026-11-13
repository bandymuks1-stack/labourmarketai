"use client";

import { useEffect } from "react";

import { useAuthOptional } from "@/lib/auth/context";
import { usePathname } from "@/lib/i18n/navigation";
import {
  parseRecentPlaces,
  recentPlacesKey,
  recordRecentPlace,
} from "@/lib/workspace/recent-places";

/**
 * Notes which dashboard AREA the person just opened, so the home can offer it
 * back under "Recent" (`lib/workspace/recent-places.ts`). Renders nothing.
 * This browser only, per signed-in user; an area path, never an entity id; a
 * browser without storage simply keeps no recents.
 */
export function RecentPlacesRecorder() {
  const pathname = usePathname();
  const userId = useAuthOptional()?.user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    try {
      const key = recentPlacesKey(userId);
      const next = recordRecentPlace(parseRecentPlaces(localStorage.getItem(key)), pathname, Date.now());
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* no storage: no recents */
    }
  }, [pathname, userId]);
  return null;
}
