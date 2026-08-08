"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

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
 */
export function MobileNavMenu({
  items,
  openLabel,
  closeLabel,
  className,
  authSection,
}: {
  items: readonly MobileNavItem[];
  openLabel: string;
  closeLabel: string;
  className?: string;
  /** Server-rendered auth CTAs shown below `sm`, where the header row has no
   *  room for them. Passed in (not built here) so the destinations stay
   *  defined once, in SiteNav. */
  authSection?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
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
          className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-ink-600 bg-ink-900/95 p-1.5 shadow-xl backdrop-blur-md"
        >
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
          {/* Rendered verbatim, container and breakpoint included: which
              widths the panel owns the auth CTAs at is SiteNav's decision,
              and duplicating that `sm` here would be a second place to keep
              in sync with the header.

              No onClick close either: AuthCtaLink is a plain <a>, so
              following it is a FULL document navigation that unmounts this
              menu with the rest of the page. A handler would be dead code
              pretending to do work the browser already does. */}
          {authSection}
        </nav>
      )}
    </div>
  );
}
