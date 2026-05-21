"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { locales, tier1Locales } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const TIER1 = new Set<string>(tier1Locales);

/**
 * Locale switcher across the full canonical set (§2.4, 10 locales).
 * `usePathname` returns the path WITHOUT the locale prefix, so re-linking with
 * a `locale` prop keeps the visitor on the same page in the other language.
 * Non-Tier-1 locales are visually de-emphasised (preview: `[EN]` placeholders
 * until translated).
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const pathname = usePathname();
  const active = useLocale();
  const t = useTranslations("common");

  return (
    <nav
      aria-label={t("localeSwitch")}
      className={cn(
        "flex flex-wrap items-center gap-x-1 gap-y-0.5 font-mono text-xs uppercase tracking-label",
        className,
      )}
    >
      {locales.map((l, i) => {
        const preview = !TIER1.has(l);
        return (
          <span key={l} className="flex items-center gap-1">
            <Link
              href={pathname}
              locale={l}
              aria-current={l === active ? "true" : undefined}
              className={cn(
                "px-1 transition-colors",
                l === active
                  ? "text-text-primary"
                  : "text-text-muted hover:text-text-secondary",
                preview && l !== active && "opacity-50",
              )}
            >
              {l.toUpperCase()}
            </Link>
            {i < locales.length - 1 && (
              <span className="text-ink-500">/</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
