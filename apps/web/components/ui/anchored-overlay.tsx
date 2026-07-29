"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

/**
 * THE ONE OVERLAY PORTAL ROOT (owner audit P0.3: "vienas portal root; aiški
 * z-index skalė").
 *
 * WHY A PORTAL, NOT A Z-INDEX. The header carries `backdrop-blur`, which
 * creates a stacking context with `z-index: auto`. Any dropdown rendered
 * INSIDE the header is trapped in that context: against the page content —
 * a later sibling — the whole header group loses at equal z, so a menu with
 * z-60 was still painted UNDER the workspace map. Production showed exactly
 * that (the map covered the open notifications popover and account menu).
 * No z value inside the header can fix that; escaping the ancestor stacking
 * context is the architectural fix, and a portal to `document.body` is the
 * one escape hatch the platform gives us.
 *
 * Z SCALE (portal children compete only at the root):
 *   60 — anchored dropdown menus (account, workspace, notifications)
 *   70 — modal dialogs (command search)
 *
 * The overlay anchors to its trigger with fixed positioning recomputed on
 * resize and scroll; Escape and outside-pointerdown close it (clicks inside
 * the portal or on the trigger never count as outside).
 */
export function AnchoredOverlay({
  anchorRef,
  open,
  onClose,
  align = "right",
  children,
  className = "",
}: {
  /** The trigger the overlay hangs from. */
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  /** Which trigger edge the overlay hugs. */
  align?: "left" | "right";
  children: ReactNode;
  /** Panel classes (the caller keeps its own look; this wrapper only owns
   *  position + the z tier). */
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    left?: number;
    right?: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos(
        align === "right"
          ? { top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) }
          : { top: r.bottom + 8, left: Math.max(8, r.left) },
      );
    };
    update();
    window.addEventListener("resize", update);
    // Capture-phase scroll: any scrolling ancestor re-anchors the panel.
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, align, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open || pos === null || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, right: pos.right }}
      className={`z-[60] ${className}`}
      data-overlay-root="anchored"
    >
      {children}
    </div>,
    document.body,
  );
}

/**
 * Plain body portal for FULL-SCREEN overlays (the command search dialog) —
 * same escape from ancestor stacking contexts, no anchor math. The child
 * keeps its own `fixed inset-0 z-[70]` classes.
 */
export function OverlayPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
