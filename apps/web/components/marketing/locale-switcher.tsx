"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { activeLocales, tier1Locales } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const TIER1 = new Set<string>(tier1Locales);

// Native language names — language-invariant, so not in the i18n bundle.
const NATIVE: Record<string, string> = {
  en: "English",
  lt: "Lietuvių",
  lv: "Latviešu",
  et: "Eesti",
  nl: "Nederlands",
  de: "Deutsch",
  da: "Dansk",
  no: "Norsk",
  sv: "Svenska",
  pl: "Polski",
};

/**
 * Compact premium locale selector (§2.4, 10 locales). Replaces the long inline
 * code list with a globe + current-language button that opens a tidy popover of
 * language NAMES. `usePathname` returns the path without the locale prefix, so
 * each entry re-links the same page in another language. Non-Tier-1 locales are
 * tagged as preview ([EN] placeholders until translated).
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const pathname = usePathname();
  const active = useLocale();
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("localeSwitch")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800/70 px-3 py-1.5",
          "text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary",
        )}
      >
        <Globe aria-hidden className="h-3.5 w-3.5 text-text-muted" />
        <span>{NATIVE[active] ?? active.toUpperCase()}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            "h-3 w-3 text-text-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 max-h-[60vh] w-48 overflow-auto rounded-xl border border-ink-600 bg-ink-900/95 p-1.5 shadow-xl backdrop-blur-md"
        >
          {activeLocales.map((l) => {
            const preview = !TIER1.has(l);
            const isActive = l === active;
            return (
              <Link
                key={l}
                href={pathname}
                locale={l}
                role="menuitem"
                aria-current={isActive ? "true" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-brand-blue/10 text-text-primary"
                    : "text-text-secondary hover:bg-ink-800 hover:text-text-primary",
                )}
              >
                <span className="flex items-center gap-2">
                  {NATIVE[l] ?? l.toUpperCase()}
                  {preview && (
                    <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                      {t("localePreview")}
                    </span>
                  )}
                </span>
                {isActive && (
                  <Check aria-hidden className="h-3.5 w-3.5 text-brand-blue" />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
