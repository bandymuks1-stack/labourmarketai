"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom sheet — slides up from the bottom on phones; on tablet/desktop
 * the caller should render the content inline instead. Used by the auth
 * header's notification + role surfaces so popovers don't cover the hero on
 * narrow viewports (Mobile UX §1).
 *
 * Portal'd to document.body so `position: fixed` is anchored to the viewport
 * and not to a transformed / filtered / backdrop-blurred ancestor (the auth
 * header uses backdrop-blur, which would otherwise re-anchor `fixed` and
 * push the sheet into the header band).
 */
export function MobileSheet({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  // SSR-safe portal: only render once the DOM is available, otherwise
  // `document.body` blows up during the server render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onEsc);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-label={title}
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col justify-end md:hidden"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/70 backdrop-blur-sm"
      />
      <div
        className={cn(
          "relative mt-auto max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border-t border-ink-500 bg-ink-900 pb-[env(safe-area-inset-bottom)] shadow-card",
          className,
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-600 bg-ink-900/95 px-4 py-3 backdrop-blur">
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">
            {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary hover:border-brand-blue hover:text-text-primary"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
