"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus contract of a modal dialog (`role="dialog"` + `aria-modal="true"`),
 * extracted verbatim from `MobileSheet` (2026-09-19) so every modal in the
 * product owns focus the same way while it is open:
 *
 *   1. focus moves INTO the panel (the `initialFocus` element when given,
 *      otherwise the first focusable control, otherwise the panel itself);
 *   2. Tab / Shift+Tab cycle inside the panel instead of escaping to the
 *      page underneath;
 *   3. Escape calls `onClose`;
 *   4. on close the element that opened the dialog gets focus back.
 *
 * Without 1–4 a screen-reader or keyboard user stays on the page beneath a
 * dialog they cannot reach. `lib/guards/dialog-focus-contract.test.ts` pins
 * that every `aria-modal` dialog under `components/` uses this hook (or
 * carries the same handling inline).
 *
 * Body scroll locking is deliberately NOT here — it is a presentation choice
 * each sheet makes for itself.
 */
export function useDialogFocus(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>,
  initialFocus?: RefObject<HTMLElement | null>,
): void {
  // The latest `onClose` is read through a ref so an inline arrow from the
  // caller never re-runs the effect (which would re-focus the first control
  // and bounce focus to the opener on every render while the dialog is open).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const focusables = (): HTMLElement[] =>
      Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = initialFocus?.current ?? focusables()[0] ?? panelRef.current;
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const head = items[0];
      const tail = items[items.length - 1];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [open, panelRef, initialFocus]);
}
