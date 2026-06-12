"use client";

import { useEffect, type RefObject } from "react";
import { usePathname } from "next/navigation";

/**
 * Shared dismiss behaviour for header popovers/drawers (owner smoke fix:
 * the right-side panel stayed open after navigating to another page).
 *
 * Closes the surface when:
 *   1. the route changes (client-side navigation keeps the dashboard
 *      header mounted, so an open popover would otherwise survive it);
 *   2. the user clicks/taps outside the popover root;
 *   3. the user presses Escape.
 *
 * Works on desktop and mobile; the visible ✕ button stays the caller's
 * responsibility (every surface must also render one).
 */
export function usePopoverDismiss(
  open: boolean,
  onClose: () => void,
  rootRef: RefObject<HTMLElement | null>,
) {
  const pathname = usePathname();

  // 1. Route change → close. Deliberately NOT keyed on `open` so the
  //    effect only fires when the path actually changes.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // 2 + 3. Outside click + Escape while open.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, rootRef]);
}
