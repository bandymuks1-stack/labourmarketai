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
import { placeOverlay, samePosition, type OverlayPosition } from "@/lib/ui/overlay-placement";

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
 * Z TIERS (portal children compete only at the root; named in
 * tokens/zindex.ts — never a raw z-[n]):
 *   z-modal (60) — anchored dropdown menus (account, workspace, notifications)
 *   z-toast (70) — the command search dialog, above everything
 *
 * The overlay anchors to its trigger with fixed positioning recomputed on
 * resize, scroll and its own resize; it stays inside the screen and scrolls
 * inside itself when taller than the room it has (`overlay-placement.ts`).
 * Escape and outside-pointerdown close it (clicks inside the portal or on the
 * trigger never count as outside).
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
  const [pos, setPos] = useState<OverlayPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const panel = panelRef.current;
      const next = placeOverlay(
        r,
        panel ? { width: panel.offsetWidth, height: panel.scrollHeight } : null,
        { width: document.documentElement.clientWidth, height: window.innerHeight },
        align,
      );
      setPos((prev) => (prev && samePosition(prev, next) ? prev : next));
    };
    update();
    window.addEventListener("resize", update);
    // Capture-phase scroll: any scrolling ancestor re-anchors the panel.
    window.addEventListener("scroll", update, true);
    // The panel's own size decides where it fits; it is only known once it is
    // rendered, and it changes when its content does (a submenu, a list).
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    const observe = () => {
      if (panelRef.current && ro) ro.observe(panelRef.current);
    };
    observe();
    const raf = requestAnimationFrame(() => {
      observe();
      update();
    });
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
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
      // A CSS-hidden panel must not own outside-close. Callers pair this
      // popover with a MobileSheet and hide THIS panel at <md (`hidden
      // md:block`) while both stay mounted: without this guard, mousedown on
      // a link INSIDE the sheet counted as "outside", onClose() unmounted the
      // sheet between mousedown and click, and the link never navigated
      // (real phone taps fail the same way — compatibility mousedown fires
      // before click).
      if (!panelRef.current || panelRef.current.getClientRects().length === 0)
        return;
      const t = e.target as Node;
      if (panelRef.current.contains(t)) return;
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
      style={{
        position: "fixed",
        top: pos.top,
        bottom: pos.bottom,
        left: pos.left,
        right: pos.right,
        maxHeight: pos.maxHeight,
        maxWidth: pos.maxWidth,
        // Taller than the room it has (a phone on its side, 200 % text): the
        // panel scrolls inside itself instead of running off the screen. Only
        // then, so a panel that fits keeps its shadow unclipped.
        overflowY: pos.scroll ? "auto" : undefined,
        overscrollBehavior: pos.scroll ? "contain" : undefined,
      }}
      className={`z-modal ${className}`}
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
 * keeps its own `fixed inset-0 z-toast` classes.
 */
export function OverlayPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
