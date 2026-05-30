"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type Theme = "dark" | "light";

/**
 * Dark↔light theme toggle — the working proof that the design system is
 * token-swappable with ZERO component edits. It only flips
 * `document.documentElement.dataset.theme`; every component re-themes because
 * they all consume the CSS-variable colour tokens (tokens/colors.ts →
 * rgb(var(--c-*) / …), defined per theme in globals.css). The no-flash bootstrap
 * in the root layout applies the saved choice before paint.
 */
export function ThemeToggle({
  labels,
}: {
  labels: { appearance: string; toDark: string; toLight: string };
}) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = (document.documentElement.dataset.theme as Theme) || "dark";
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function apply(next: Theme) {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode — toggle still works for the session */
    }
    setTheme(next);
  }

  const next: Theme = theme === "light" ? "dark" : "light";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-text-secondary">{labels.appearance}</span>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => apply(next)}
        data-testid="theme-toggle"
        aria-label={next === "dark" ? labels.toDark : labels.toLight}
      >
        {next === "dark" ? labels.toDark : labels.toLight}
      </Button>
    </div>
  );
}
