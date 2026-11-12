"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LogIn } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { INTENT_ICONS, type RenderedIntent } from "@/components/layouts/intent-icons";

/**
 * The public header's MEGA-MENU (desktop, `lg` and up) — owner P0 2026-11-12.
 *
 * One disclosure button opens a panel with the six top-level intents
 * (`lib/navigation/public-intents.ts`), each a column: icon, name, one plain
 * line, and its real destinations. It is the disclosure-navigation pattern
 * (a button with aria-expanded controlling a region of plain links), NOT an
 * ARIA `menu`: links stay links, Tab walks them in reading order, and screen
 * readers announce them as navigation.
 *
 * Closing rules match the mobile menu and the locale switcher in the same
 * header: Escape (focus returns to the trigger), an outside click, a link
 * click, and focus leaving the whole widget with Tab.
 *
 * Every href arrives as data from the server-side SiteNav; this component
 * spells no route of its own.
 */
export function IntentMegaMenu({
  intents,
  triggerLabel,
  accountLabel,
  className,
}: {
  intents: readonly RenderedIntent[];
  triggerLabel: string;
  /** Short note beside links that live inside the signed-in product. */
  accountLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={className}
      onBlur={(e) => {
        // Tab past the last link (or Shift+Tab before the trigger) closes it.
        const next = e.relatedTarget as Node | null;
        if (next && rootRef.current && !rootRef.current.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        data-testid="intent-menu-toggle"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm font-medium text-text-primary transition-colors hover:text-brand-blue"
      >
        {triggerLabel}
        <ChevronDown
          aria-hidden
          className={cn(
            "h-4 w-4 transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          id={panelId}
          data-testid="intent-menu-panel"
          role="region"
          aria-label={triggerLabel}
          className="absolute inset-x-0 top-full z-50 border-b border-ink-600 bg-ink-900/95 shadow-xl backdrop-blur-md"
        >
          <ul className="mx-auto grid max-w-container grid-cols-3 gap-3 px-12 py-6">
            {intents.map((intent) => {
              const Icon = INTENT_ICONS[intent.iconKey];
              return (
                <li
                  key={intent.id}
                  data-testid={`intent-column-${intent.id}`}
                  className="rounded-xl border border-ink-600/70 bg-ink-800/40 p-4"
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink-500 bg-ink-900 text-brand-blue"
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-display text-base font-semibold text-text-primary">
                        {intent.title}
                      </h2>
                      <p className="mt-0.5 text-sm leading-snug text-text-secondary">
                        {intent.description}
                      </p>
                    </div>
                  </div>
                  <ul className="mt-3 flex flex-col">
                    {intent.links.map((link) => (
                      <li key={link.id}>
                        <Link
                          href={link.href}
                          onClick={() => setOpen(false)}
                          data-testid={`intent-link-${intent.id}-${link.id}`}
                          className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 text-sm text-text-secondary transition-colors hover:bg-ink-800 hover:text-text-primary"
                        >
                          <span>{link.label}</span>
                          {link.account && (
                            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-meta uppercase tracking-label text-text-muted">
                              <LogIn aria-hidden className="h-3.5 w-3.5" />
                              {accountLabel}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
