"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/lib/i18n/navigation";
import { useAuth } from "@/lib/auth/context";
import { activeLocales, type ActiveLocale } from "@/lib/i18n/config";
import {
  matchCommands,
  type CommandAudience,
} from "@/lib/navigation/command-registry";

/**
 * Command finder (WAGON 3) — type a normal term ("cv", "kortelė",
 * "žurnalas", "brigada", "kainos", "gdpr" …) and get links to the right
 * EXISTING page. Renders results ONLY from the curated registry
 * (lib/navigation/command-registry.ts) — no free navigation invention, no
 * AI, no external search, plain normalized substring matching.
 *
 * Audience filtering uses ONLY server-derived signals passed through the
 * dashboard layout's AuthProvider (isAdmin + roles resolved server-side in
 * app/[locale]/dashboard/layout.tsx). Display convenience only — every
 * destination page keeps its own server-side auth / role / superadmin gate.
 *
 * Keyboard accessible by construction: a labelled search input followed by
 * a plain list of links (native tab order). Progressive enhancement
 * (control room PR B): Ctrl/Cmd+K focuses the inline input from anywhere on
 * the page — no modal palette, the existing finder just becomes reachable
 * without the mouse. Everything works identically without the shortcut.
 */
export function CommandFinder() {
  const t = useTranslations("commandFinder");
  const rawLocale = useLocale();
  const locale: ActiveLocale = (activeLocales as readonly string[]).includes(
    rawLocale,
  )
    ? (rawLocale as ActiveLocale)
    : "lt";
  const { isAdmin, roles } = useAuth();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd+K focuses the finder input (progressive enhancement — the
  // finder stays a plain labelled input either way, no modal).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const allowedAudiences = useMemo(() => {
    const a = new Set<CommandAudience>(["public"]);
    if (roles.includes("worker")) a.add("worker");
    if (roles.includes("company") || roles.includes("agency")) a.add("company");
    if (isAdmin) {
      // Admin sees everything — including the admin-only entries. Non-admins
      // NEVER get audience:"admin" rows (guard-tested).
      a.add("worker");
      a.add("company");
      a.add("admin");
    }
    return a;
  }, [roles, isAdmin]);

  const results = useMemo(
    () => matchCommands(query, locale, allowedAudiences),
    [query, locale, allowedAudiences],
  );
  const showNoResults = query.trim().length > 0 && results.length === 0;

  return (
    <section
      role="search"
      data-testid="command-finder"
      className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor="command-finder-input"
          className="font-mono text-[10px] uppercase tracking-label text-text-muted"
        >
          {t("title")}
        </label>
        {/* Shortcut hint — decorative for pointer users, so hidden from AT
            (the input itself stays fully labelled + focusable). */}
        <span
          aria-hidden
          data-testid="command-finder-shortcut-hint"
          className="hidden rounded border border-ink-500 bg-ink-800/60 px-1.5 py-0.5 font-mono text-[10px] text-text-muted sm:inline-flex"
        >
          {t("shortcutHint")}
        </span>
      </div>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
        />
        <input
          ref={inputRef}
          id="command-finder-input"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("inputLabel")}
          data-testid="command-finder-input"
          className="w-full rounded-md border border-ink-500 bg-ink-800/60 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none"
        />
      </div>

      {results.length > 0 && (
        <nav aria-label={t("resultsLabel")}>
          <ul
            data-testid="command-finder-results"
            className="flex flex-col gap-1"
          >
            {results.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={entry.route as "/dashboard"}
                  data-testid={`command-finder-result-${entry.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2 text-sm text-text-primary transition-colors hover:border-brand-blue"
                >
                  <span className="min-w-0 truncate font-medium">
                    {entry.labels[locale]}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-text-muted">
                    {entry.route}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {showNoResults && (
        <p
          data-testid="command-finder-no-results"
          className="text-xs leading-relaxed text-text-muted"
          aria-live="polite"
        >
          {t("noResults")}
        </p>
      )}
    </section>
  );
}
