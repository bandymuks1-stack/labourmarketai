"use client";

import { useEffect } from "react";

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
 * the single shared localStorage "theme" key, LIGHT default. Deliberate
 * theme CHANGES keep working: the observer only reacts when the attribute
 * is missing — a user toggle sets the attribute, never removes it.
 */
export function ThemeReapply() {
  useEffect(() => {
    // Resolves to the PRODUCT DEFAULT (light) rather than null, so a stripped
    // attribute is always restored to a definite value — the same resolution
    // the pre-paint bootstrap performs.
    const saved = (): "light" | "dark" => {
      try {
        return localStorage.getItem("theme") === "dark" ? "dark" : "light";
      } catch {
        return "light"; /* no storage → the product default */
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
  }, []);
  return null;
}
