"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, LogIn, Menu, MessageCircle, X } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { INTENT_ICONS, type RenderedIntent } from "@/components/layouts/intent-icons";

export type MobileNavItem = {
  key: string;
  href: string;
  label: string;
};

/**
 * Mobile disclosure menu for the PUBLIC header (beta foundation audit M1:
 * the six marketing links lived only inside `hidden lg:flex`, so a phone
 * visitor could not reach any marketing page from the header at all).
 *
 * Same popover contract as LocaleSwitcher in the same header row: outside
 * click and Escape close it, every link click closes it (navigation may be
 * a same-page #anchor, so the Link's own onClick is the reliable close
 * signal, not a route change). The trigger is a 44×44px target (h-11 w-11)
 * per the audit's touch-target requirement; Escape returns focus to the
 * trigger so keyboard users are not dropped on a detached element.
 *
 * The link LIST is owned by the server-side SiteNav (single source of truth
 * incl. the /vision publication gate) — this component only renders what it
 * is handed and never hardcodes an href.
 *
 * Premium navigation (owner P0 2026-11-12): the panel opens with the SAME six
 * intents the desktop mega-menu shows (`lib/navigation/public-intents.ts`),
 * each a disclosure that reveals its destinations — the hierarchy is intent →
 * destination on every width, never two different menus. The panel is as wide
 * as the phone allows and scrolls inside itself when the content is taller
 * than the screen.
 */
export function MobileNavMenu({
  items,
  openLabel,
  closeLabel,
  className,
  authSection,
  intents = [],
  accountLabel = "",
  assistant,
}: {
  items: readonly MobileNavItem[];
  openLabel: string;
  closeLabel: string;
  className?: string;
  /** Server-rendered auth CTAs shown below `sm`, where the header row has no
   *  room for them. Passed in (not built here) so the destinations stay
   *  defined once, in SiteNav. */
  authSection?: ReactNode;
  /** The six public intents, labels resolved on the server. */
  intents?: readonly RenderedIntent[];
  /** Short note beside links that live inside the signed-in product. */
  accountLabel?: string;
  /** The "ask the assistant" entry — the existing conversation home. */
  assistant?: { readonly href: string; readonly label: string };
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

  const label = open ? closeLabel : openLabel;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="mobile-nav-toggle"
        aria-expanded={open}
        aria-controls="mobile-nav-menu"
        aria-label={label}
        title={label}
        className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden />
        ) : (
          <Menu className="h-5 w-5" aria-hidden />
        )}
      </button>

      {open && (
        <nav
          id="mobile-nav-menu"
          data-testid="mobile-nav-menu"
          aria-label={openLabel}
          className="absolute right-0 z-50 mt-2 max-h-[calc(100dvh-5.5rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-xl border border-ink-600 bg-ink-900/95 p-1.5 shadow-xl backdrop-blur-md"
        >
          {/* Rendered verbatim, container and breakpoint included: which
              widths the panel owns the auth CTAs at is SiteNav's decision,
              and duplicating that `sm` here would be a second place to keep
              in sync with the header.

              No onClick close either: AuthCtaLink is a plain <a>, so
              following it is a FULL document navigation that unmounts this
              menu with the rest of the page. A handler would be dead code
              pretending to do work the browser already does.

              It sits ABOVE the secondary links (first-visitor finding
              2026-11-12): on a 360px phone sign in / sign up were below the
              fold of the panel, after five links nobody came for. */}
          {authSection}
          {intents.length > 0 && (
            <ul data-testid="mobile-nav-intents" className="mb-1.5 border-b border-ink-600 pb-1.5">
              {intents.map((intent) => {
                const Icon = INTENT_ICONS[intent.iconKey];
                const isOpen = expanded === intent.id;
                const regionId = `mobile-intent-${intent.id}`;
                return (
                  <li key={intent.id}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={regionId}
                      data-testid={`mobile-intent-toggle-${intent.id}`}
                      onClick={() => setExpanded(isOpen ? null : intent.id)}
                      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-primary transition-colors hover:bg-ink-800"
                    >
                      <Icon aria-hidden className="h-4 w-4 shrink-0 text-brand-blue" />
                      <span className="min-w-0 flex-1">{intent.title}</span>
                      <ChevronDown
                        aria-hidden
                        className={cn(
                          "h-4 w-4 shrink-0 text-text-muted transition-transform motion-reduce:transition-none",
                          isOpen && "rotate-180",
                        )}
                      />
                    </button>
                    {isOpen && (
                      <div id={regionId} className="pb-1 pl-10 pr-1">
                        <p className="px-2 pb-1 text-xs leading-snug text-text-muted">
                          {intent.description}
                        </p>
                        {intent.links.map((link) => (
                          <Link
                            key={link.id}
                            href={link.href}
                            onClick={() => setOpen(false)}
                            data-testid={`mobile-intent-link-${intent.id}-${link.id}`}
                            className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm text-text-secondary transition-colors hover:bg-ink-800 hover:text-text-primary"
                          >
                            <span>{link.label}</span>
                            {link.account && (
                              <span className="inline-flex shrink-0 items-center gap-1 font-mono text-meta uppercase tracking-label text-text-muted">
                                <LogIn aria-hidden className="h-3.5 w-3.5" />
                                {accountLabel}
                              </span>
                            )}
                          </Link>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {assistant && (
            <Link
              href={assistant.href}
              onClick={() => setOpen(false)}
              data-testid="mobile-nav-assistant"
              className="mb-1.5 flex min-h-11 items-center gap-3 rounded-lg border-b border-ink-600 px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-ink-800"
            >
              <MessageCircle aria-hidden className="h-4 w-4 shrink-0 text-brand-blue" />
              <span className="min-w-0 flex-1">{assistant.label}</span>
              <span className="inline-flex shrink-0 items-center gap-1 font-mono text-meta uppercase tracking-label text-text-muted">
                <LogIn aria-hidden className="h-3.5 w-3.5" />
                {accountLabel}
              </span>
            </Link>
          )}
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-ink-800 hover:text-text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
