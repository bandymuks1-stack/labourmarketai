"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Icon-only light/dark toggle for the PUBLIC header (F1: the public site had
 * no theme control at all, so a light-theme user who landed logged-out could
 * not recover from the dark default). Same storage contract as ThemeToggle
 * and AccountMenu: flips `document.documentElement.dataset.theme` and writes
 * the single shared localStorage "theme" key (never locale-keyed), which the
 * no-flash bootstrap in app/[locale]/layout.tsx replays before paint and the
 * ThemeReapply watcher protects across locale switches.
 */
export function ThemeToggleIcon({
  labels,
}: {
  labels: { toDark: string; toLight: string };
}) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  const next: "dark" | "light" = theme === "light" ? "dark" : "light";

  function toggle() {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode — toggle still works for the session */
    }
    setTheme(next);
  }

  const label = next === "dark" ? labels.toDark : labels.toLight;

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="public-theme-toggle"
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
    >
      {next === "dark" ? (
        <Moon className="h-4 w-4" aria-hidden />
      ) : (
        <Sun className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}
