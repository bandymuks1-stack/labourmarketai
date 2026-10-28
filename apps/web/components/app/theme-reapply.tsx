"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { defaultThemeForPath, resolveTheme } from "@/lib/visual/theme-default";

/**
 * Keeps the user's saved theme applied for the whole client session.
 *
 * Two real strip paths exist (locale-theme continuity contract, area D):
 *  1. the 404/not-found flow re-renders <html> itself;
 *  2. a LOCALE SWITCH re-renders the [locale] layout's <html lang=…> and
 *     React reconciliation drops the data-theme attribute the no-flash
 *     head bootstrap set before paint (caught by the PR #744 production
 *     smoke: a light-theme user flipped to dark by changing language).
 *
 * So this component (rendered once in the [locale] layout body) both
 * re-applies the saved theme after hydration AND installs a
 * MutationObserver that restores it the moment anything removes the
 * attribute — observer callbacks run before the next paint, so the user
 * never sees the wrong theme. Same storage contract as ThemeToggle:
 * the single shared localStorage "theme" key; the default is per page. Deliberate
 * theme CHANGES keep working: the observer only reacts when the attribute
 * is missing — a user toggle sets the attribute, never removes it.
 */
export function ThemeReapply() {
  // Re-resolved on every client-side route change (review on #2849): a
  // person with no saved choice who follows an in-app link from the
  // workspace to the public site gets that page's default, and back.
  const pathname = usePathname();
  useEffect(() => {
    // Resolves to the PAGE'S DEFAULT (lib/visual/theme-default.ts: public site
    // light, workspace dark) rather than null, so a stripped attribute is
    // always restored to a definite value — the same resolution the pre-paint
    // bootstrap performs. A saved choice always wins.
    const saved = (): "light" | "dark" => {
      try {
        return resolveTheme(localStorage.getItem("theme"), window.location.pathname);
      } catch {
        return defaultThemeForPath(window.location.pathname); /* no storage */
      }
    };

    const apply = () => {
      const t = saved();
      if (document.documentElement.dataset.theme !== t) {
        document.documentElement.dataset.theme = t;
      }
    };
    apply();

    const observer = new MutationObserver(() => {
      // Only restore when the attribute was STRIPPED — a user toggle sets
      // the attribute (and localStorage first), it never removes it.
      if (!document.documentElement.hasAttribute("data-theme")) apply();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}
