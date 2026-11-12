"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LogIn, MessageCircle } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { INTENT_ICONS, type RenderedIntent } from "@/components/layouts/intent-icons";

/**
 * THE INTENT BAR + MEGA-MENU of the public header (desktop, `lg` and up) —
 * owner P0 2026-11-12.
 *
 * The six intents (`lib/navigation/public-intents.ts`) are the FIRST LEVEL of
 * the header: a row of six plainly named buttons, always visible, so a first
 * visitor reads the main choices without opening anything. Pressing one opens
 * the panel with all six columns, marks that intent's column and moves focus
 * to its first destination — so the start of a function is two actions away
 * (intent, destination), by mouse or by keyboard (Enter, Enter).
 *
 * It is the disclosure-navigation pattern (buttons with aria-expanded
 * controlling a region of plain links), NOT an ARIA `menu`: links stay links,
 * Tab walks them in reading order, screen readers announce navigation.
 *
 * Closing: Escape (focus returns to the intent that opened it), an outside
 * click, a link click, pressing the open intent again, and focus leaving the
 * widget with Tab.
 *
 * Every href arrives as data from the server-side SiteNav; this component
 * spells no route of its own.
 */
export function IntentMegaMenu({
  intents: allIntents,
  goalsOnPage = false,
  askInHeader = false,
  navLabel,
  accountLabel,
  assistant,
  more,
  className,
}: {
  intents: readonly RenderedIntent[];
  /** True where the page itself shows the six goals (the landing): the bar
   *  then carries only "More" and the assistant, so the goals appear once. */
  goalsOnPage?: boolean;
  /** True where the header row carries the assistant INPUT (inner pages):
   *  the bar then shows no second "ask the assistant" entry. */
  askInHeader?: boolean;
  /** Accessible name of the intent navigation. */
  navLabel: string;
  /** Short note beside links that live inside the signed-in product. */
  accountLabel: string;
  /** The "ask the assistant" entry — the existing conversation home. */
  assistant?: { readonly href: string; readonly label: string };
  /** The secondary links (jobs, pricing, about …) behind one "More". */
  more?: {
    readonly label: string;
    readonly links: ReadonlyArray<{ readonly key: string; readonly href: string; readonly label: string }>;
  };
  className?: string;
}) {
  const intents = goalsOnPage ? [] : allIntents;
  const [active, setActive] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const open = active !== null;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setActive(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActive(null);
        openerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Opening an intent puts focus on its first destination: the second action
  // is then one key press (or one click) away.
  useEffect(() => {
    if (!active) return;
    rootRef.current
      ?.querySelector<HTMLAnchorElement>(`[data-intent-column="${active}"] a`)
      ?.focus();
  }, [active]);

  return (
    <nav
      ref={rootRef}
      aria-label={navLabel}
      data-testid="intent-bar"
      // Inner pages: the goal bar is the header's second row. The landing has
      // no goal bar (its cards carry the goals), so "More" and the assistant
      // sit in the header's first row and no second row is drawn.
      className={cn(className, !goalsOnPage && "border-t border-ink-600/60")}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (next && rootRef.current && !rootRef.current.contains(next)) setActive(null);
      }}
    >
      <div
        className={cn(
          "flex items-center gap-1",
          !goalsOnPage && "mx-auto max-w-container px-12",
        )}
      >
        <ul className={cn("flex min-w-0 items-center gap-1", !goalsOnPage && "flex-1")}>
          {intents.map((intent) => {
            const Icon = INTENT_ICONS[intent.iconKey];
            const isActive = active === intent.id;
            return (
              <li key={intent.id} className="min-w-0">
                <button
                  type="button"
                  aria-expanded={isActive}
                  aria-controls={panelId}
                  data-testid={`intent-toggle-${intent.id}`}
                  onClick={(e) => {
                    openerRef.current = e.currentTarget;
                    setActive(isActive ? null : intent.id);
                  }}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm font-medium transition-colors motion-reduce:transition-none xl:px-3",
                    isActive
                      ? "bg-ink-800 text-text-primary"
                      : "text-text-secondary hover:bg-ink-800/60 hover:text-text-primary",
                  )}
                >
                  <Icon aria-hidden className="h-4 w-4 shrink-0 text-brand-blue" />
                  <span className="whitespace-nowrap">{intent.short}</span>
                </button>
              </li>
            );
          })}
          {more && more.links.length > 0 && (
            <li>
              <button
                type="button"
                aria-expanded={active === "more"}
                aria-controls={panelId}
                data-testid="intent-toggle-more"
                onClick={(e) => {
                  openerRef.current = e.currentTarget;
                  setActive(active === "more" ? null : "more");
                }}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-control px-2 text-sm font-medium transition-colors motion-reduce:transition-none xl:px-3",
                  active === "more"
                    ? "bg-ink-800 text-text-primary"
                    : "text-text-muted hover:bg-ink-800/60 hover:text-text-primary",
                )}
              >
                <span className="whitespace-nowrap">{more.label}</span>
              </button>
            </li>
          )}
        </ul>
        {assistant && !askInHeader && (
          <Link
            href={assistant.href}
            // The conversation home is behind sign-in: never prefetch it from
            // a public page (a guest would request it on every view).
            prefetch={false}
            data-testid="intent-bar-assistant"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-control px-2.5 text-sm font-medium text-text-primary transition-colors hover:text-brand-blue motion-reduce:transition-none"
          >
            <MessageCircle aria-hidden className="h-4 w-4 text-brand-blue" />
            <span className="sr-only xl:not-sr-only">{assistant.label}</span>
          </Link>
        )}
      </div>

      {open && (
        <div
          id={panelId}
          data-testid="intent-menu-panel"
          className="absolute inset-x-0 top-full z-50 border-b border-ink-600 bg-ink-900/95 shadow-xl backdrop-blur-md"
        >
          <ul
            className={cn(
              "mx-auto grid max-w-container grid-cols-3 gap-3 px-12 py-6",
              intents.length === 0 && "hidden",
            )}
          >
            {intents.map((intent) => {
              const Icon = INTENT_ICONS[intent.iconKey];
              return (
                <li
                  key={intent.id}
                  data-testid={`intent-column-${intent.id}`}
                  data-intent-column={intent.id}
                  data-active={active === intent.id || undefined}
                  className={cn(
                    "rounded-xl border p-4",
                    active === intent.id
                      ? "border-brand-blue/60 bg-ink-800/70"
                      : "border-ink-600/70 bg-ink-800/40",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink-500 bg-ink-900 text-brand-blue"
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      {/* Not a heading: this sits in the site header, before the
                          page's own h1, and must not enter the page outline. */}
                      <p className="font-display text-base font-semibold text-text-primary">
                        {intent.title}
                      </p>
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
                          prefetch={link.account ? false : undefined}
                          onClick={() => setActive(null)}
                          data-testid={`intent-link-${intent.id}-${link.id}`}
                          className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 text-sm text-text-secondary transition-colors hover:bg-ink-800 hover:text-text-primary motion-reduce:transition-none"
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
          {more && more.links.length > 0 && (
            <ul
              data-testid="intent-more-links"
              data-intent-column="more"
              className="mx-auto flex max-w-container flex-wrap gap-x-2 border-t border-ink-600/70 px-12 py-3"
            >
              {more.links.map((link) => (
                <li key={link.key}>
                  <Link
                    href={link.href}
                    onClick={() => setActive(null)}
                    className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-text-secondary transition-colors hover:bg-ink-800 hover:text-text-primary motion-reduce:transition-none"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </nav>
  );
}
