"use client";

import { useEffect } from "react";

/**
 * Re-applies the saved theme after hydration. Needed ONLY on documents that
 * React re-mounts from the root — the 404/not-found flow re-renders <html>
 * itself, which strips the data-theme attribute the no-flash head bootstrap
 * set before paint (normal pages hydrate without touching <html>, so they
 * never need this). Same storage contract as ThemeToggle: localStorage.theme,
 * dark default.
 */
export function ThemeReapply() {
  useEffect(() => {
    try {
      const t = localStorage.getItem("theme");
      if (t === "light" || t === "dark") {
        document.documentElement.dataset.theme = t;
      }
    } catch {
      /* no storage → stay on the dark default */
    }
  }, []);
  return null;
}
