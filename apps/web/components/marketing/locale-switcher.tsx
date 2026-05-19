"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { locales } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/**
 * LT ↔ EN switcher. `usePathname` (from our i18n navigation) returns the path
 * WITHOUT the locale prefix, so re-linking with a `locale` prop keeps the
 * visitor on the same page in the other language (both directions).
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const pathname = usePathname();
  const active = useLocale();
  const t = useTranslations("common");

  return (
    <nav
      aria-label={t("localeSwitch")}
      className={cn(
        "flex items-center gap-1 font-mono text-xs uppercase tracking-label",
        className,
      )}
    >
      {locales.map((l, i) => (
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
            )}
          >
            {l.toUpperCase()}
          </Link>
          {i === 0 && <span className="text-ink-500">/</span>}
        </span>
      ))}
    </nav>
  );
}
