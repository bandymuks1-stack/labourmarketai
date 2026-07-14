"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { CommandFinder } from "@/components/app/command-finder";

/**
 * Universal OS search (owner UX recovery v1). One compact header button that
 * opens the ONE CommandFinder in an overlay on EVERY dashboard page — search
 * stops being a dashboard-bottom widget and becomes an always-reachable
 * system affordance. No second search implementation: this mounts the same
 * registry-first finder the dashboard embeds (one search truth).
 *
 * Ctrl/Cmd+K opens the overlay ONLY when no inline finder is on the page —
 * on the dashboard home the embedded finder keeps its own shortcut, so the
 * two mounts never fight over the key.
 */
export function HeaderSearch() {
  const t = useTranslations("commandFinder");
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        // The embedded dashboard finder handles the shortcut on its page.
        if (document.querySelector('[data-testid="command-finder"]')) return;
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Focus the finder input as soon as the overlay mounts it.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLInputElement>("#command-finder-input")
        ?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("title")}
        aria-haspopup="dialog"
        data-testid="header-search-button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
      >
        <Search aria-hidden className="h-4 w-4" strokeWidth={1.75} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/70 p-4 pt-[10vh] backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("title")}
            data-testid="header-search-dialog"
            className="relative w-full max-w-xl rounded-lg border border-ink-500 bg-ink-900 shadow-xl"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("closeLabel")}
              data-testid="header-search-close"
              className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
            <CommandFinder />
          </div>
        </div>
      )}
    </>
  );
}
