"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Icon-only light/dark toggle for the PUBLIC header (F1: the public site had
 * no theme control at all, so a light-theme user who landed logged-out could
 * not recover from the dark default). Same storage contract as ThemeToggle
 * and AccountMenu: flips `document.documentElement.dataset.theme` and writes
 * the single shared localStorage "theme" key (never locale-keyed), which the
 * no-flash bootstrap in app/[locale]/layout.tsx resolves before paint and the
 * ThemeReapply watcher protects across locale switches.
 */
export function ThemeToggleIcon({
  labels,
  testId = "public-theme-toggle",
  className,
}: {
  labels: { toDark: string; toLight: string };
  /** Distinguishes the mount point in tests. Defaults to the public header's
   *  id so existing guards keep pointing at the same control. */
  testId?: string;
  /** Lets a host header match its own control sizing (e.g. the conversation
   *  header's 44px row) without forking the toggle. */
  className?: string;
}) {
  // LIGHT is the product default, so an absent attribute means light.
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "dark" ? "dark" : "light");
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
      data-testid={testId}
      aria-label={label}
      aria-pressed={theme === "dark"}
      title={label}
      className={
        className ??
        "inline-flex h-9 w-9 items-center justify-center rounded-control border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
      }
    >
      {next === "dark" ? (
        <Moon className="h-4 w-4" aria-hidden />
      ) : (
        <Sun className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}
