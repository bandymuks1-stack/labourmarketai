"use client";

import { useEffect } from "react";

/**
 * A page loaded before a deploy still holds the OLD build's server-action ids.
 * After the deploy, every action it calls is answered by Next with
 * `x-nextjs-action-not-found: 1` and the click fails ("could not switch",
 * "could not save") although nothing is wrong with the person's data. This
 * watches the action responses and, the first time one says the build moved,
 * reloads the page once so the person is on the current build. A loop guard
 * allows at most one such reload per minute.
 */
const HEADER = "x-nextjs-action-not-found";
const GUARD_KEY = "lm-stale-build-reload-at";
const GUARD_MS = 60_000;

let installed = false;

function recentlyReloaded(): boolean {
  try {
    const at = Number(window.sessionStorage.getItem(GUARD_KEY) ?? "0");
    return Number.isFinite(at) && Date.now() - at < GUARD_MS;
  } catch {
    return false;
  }
}

export function StaleBuildRecovery() {
  useEffect(() => {
    if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
    installed = true;
    const original = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original(...args);
      if (res.headers.get(HEADER) === "1" && !recentlyReloaded()) {
        try {
          window.sessionStorage.setItem(GUARD_KEY, String(Date.now()));
        } catch {
          // storage blocked: the minute guard is best-effort; still reload once
        }
        window.location.reload();
      }
      return res;
    };
  }, []);
  return null;
}
