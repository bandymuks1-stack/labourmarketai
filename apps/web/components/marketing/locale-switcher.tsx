"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { AnchoredOverlay } from "@/components/ui/anchored-overlay";
import { activeLocales, tier1Locales } from "@/lib/i18n/config";
import { persistLocalePreferenceAction } from "@/lib/i18n/locale-actions";
import { cn } from "@/lib/utils";

const TIER1 = new Set<string>(tier1Locales);

// Native language names — language-invariant, so not in the i18n bundle.
// Exported for other language pickers (the invitation recipient-language
// select) so the product never grows a second, drifting name map.
export const NATIVE_LOCALE_NAMES: Record<string, string> = {
  en: "English",
  lt: "Lietuvių",
  lv: "Latviešu",
  et: "Eesti",
  nl: "Nederlands",
  de: "Deutsch",
  da: "Dansk",
  no: "Norsk",
  sv: "Svenska",
  pl: "Polski",
  ru: "Русский",
};

/**
 * Compact premium locale selector (§2.4, 10 locales). Replaces the long inline
 * code list with a globe + current-language button that opens a tidy popover of
 * language NAMES. `usePathname` returns the path without the locale prefix, so
 * each entry re-links the same page in another language. Non-Tier-1 locales are
 * tagged as preview ([EN] placeholders until translated).
 *
 * Changing language must change ONLY the locale: the same page, the same
 * query string (?next=, ?editing=, ?view=…) and the same #hash travel with
 * the switch. `usePathname` strips both, so the live search+hash is read
 * from `window.location` at the moment the menu opens (client-only —
 * avoids a useSearchParams Suspense boundary on statically rendered pages).
 *
 * ── THE MENU ESCAPES THE HEADER (owner window 11 §25/§27, 2026-09-07) ──────
 * The owner opened this selector on the production dashboard and the language
 * options rendered BEHIND the map. The cause is written down one file over,
 * in `components/ui/anchored-overlay.tsx`: the authenticated header carries
 * `backdrop-blur`, which creates a stacking context with `z-index: auto`, so
 * a dropdown rendered inside it competes as part of the whole header group
 * against later siblings — and Leaflet's panes run 400–700. **No z value
 * inside the header can win that.** `NotificationPanel`, `AccountMenu` and
 * `WorkspaceChip` were moved to the portal for exactly this reason (owner
 * audit P0.3) and this component — their immediate neighbour in the same
 * header cluster — was left behind, still painting an `absolute z-50` panel.
 *
 * It also explains the owner's §27 observation that only "Lietuvių" and
 * "English" appeared: five rows are rendered from `activeLocales`, and the
 * map card begins a few dozen pixels below the header — the rows past the
 * first two were behind it, not missing.
 */
export function LocaleSwitcher({
  className,
  compactBelowSm = false,
  inline = false,
}: {
  className?: string;
  /**
   * Render the panel in place instead of through the ONE overlay portal.
   *
   * OPT-OUT, and there is exactly one legitimate caller: the account menu
   * renders this switcher INSIDE its own `AnchoredOverlay`, so the panel is
   * already free of the header's stacking context — and portalling again
   * would put the language rows outside `panelRef`, which is what
   * AnchoredOverlay's outside-close test uses. A tap on a language would
   * then count as "outside" the account menu, unmounting it between
   * mousedown and click so the link never navigates (the failure mode
   * `anchored-overlay.tsx` documents for the mobile sheet).
   */
  inline?: boolean;
  /**
   * Show the locale CODE ("LT") instead of the native name ("Lietuvių")
   * below `sm`. OPT-IN, because it is a downgrade in clarity that only a
   * width-starved host should pay: the public header at 320px cannot spend
   * the 109px the native name costs (beta foundation audit M1 measurement).
   * The footer, the account page and the dashboard have the room and keep
   * the full name.
   */
  compactBelowSm?: boolean;
}) {
  const pathname = usePathname();
  const active = useLocale();
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [suffix, setSuffix] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setSuffix(window.location.search + window.location.hash);
  }, [open]);

  // Outside-click + Escape are owned by AnchoredOverlay in the portal case
  // (the ONE overlay contract); the `inline` case keeps its own listeners
  // because there is no overlay to own them.
  useEffect(() => {
    if (!open || !inline) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, inline]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("localeSwitch")}
        className={cn(
          // min-h-11 = the product's 44px touch floor. `py-1.5` alone rendered
          // this 30px tall in the public header, next to a disclosure button
          // the floor is guard-pinned on. The minimum only takes effect where
          // the box was too short — padding, radius and colours are unchanged.
          "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800/70 px-3 py-1.5",
          "text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary",
        )}
      >
        <Globe aria-hidden className="h-3.5 w-3.5 text-text-muted" />
        {/* The button keeps its `localeSwitch` aria-label in both modes, so
            the ACCESSIBLE name never shrinks with the visible text. */}
        {compactBelowSm ? (
          <>
            <span className="hidden sm:inline">
              {NATIVE_LOCALE_NAMES[active] ?? active.toUpperCase()}
            </span>
            <span className="sm:hidden">{active.toUpperCase()}</span>
          </>
        ) : (
          <span>{NATIVE_LOCALE_NAMES[active] ?? active.toUpperCase()}</span>
        )}
        <ChevronDown
          aria-hidden
          className={cn(
            "h-3 w-3 text-text-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <Panel inline={inline} open={open} anchorRef={ref} onClose={() => setOpen(false)}>
        <div
          role="menu"
          data-testid="locale-switcher-menu"
          className={cn(
            "max-h-[60vh] w-48 overflow-auto rounded-xl border border-ink-600 bg-ink-900/95 p-1.5 shadow-xl backdrop-blur-md",
            // Positioning belongs to the host: the portal panel is placed by
            // AnchoredOverlay; the inline one hangs off the trigger itself.
            inline && "absolute right-0 z-50 mt-2",
          )}
        >
          {activeLocales.map((l) => {
            const preview = !TIER1.has(l);
            const isActive = l === active;
            return (
              <Link
                key={l}
                href={`${pathname}${suffix}`}
                locale={l}
                role="menuitem"
                aria-current={isActive ? "true" : undefined}
                onClick={() => {
                  setOpen(false);
                  // Best-effort ACCOUNT persistence (V8 W4-B item 2): the
                  // cookie makes the switch work now; this makes it follow
                  // the account to the next device. No-op when signed out,
                  // silent on failure — navigation never waits on it.
                  if (l !== active) void persistLocalePreferenceAction(l);
                }}
                className={cn(
                  // Menu rows carry the 44px floor for the same reason the
                  // mobile nav panel's rows do (`min-h-11`, pinned by
                  // lib/guards/mobile-marketing-nav.test.ts): a row in an open
                  // menu is a primary touch control, not decorative chrome.
                  // These measured 30px — under even the 36px that D-19 fixed.
                  "flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-brand-blue/10 text-text-primary"
                    : "text-text-secondary hover:bg-ink-800 hover:text-text-primary",
                )}
              >
                <span className="flex items-center gap-2">
                  {NATIVE_LOCALE_NAMES[l] ?? l.toUpperCase()}
                  {preview && (
                    <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {t("localePreview")}
                    </span>
                  )}
                </span>
                {isActive && (
                  <Check aria-hidden className="h-3.5 w-3.5 text-brand-blue" />
                )}
              </Link>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

/**
 * The panel host. Portal by default — the header's `backdrop-blur` stacking
 * context is escaped the same way every other header dropdown escapes it, so
 * the map can never paint over the language options again. `inline` keeps the
 * in-place render for the ONE caller that is already inside a portal.
 */
function Panel({
  inline,
  open,
  anchorRef,
  onClose,
  children,
}: {
  inline: boolean;
  open: boolean;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  if (inline) return open ? <>{children}</> : null;
  return (
    <AnchoredOverlay anchorRef={anchorRef} open={open} onClose={onClose} align="right">
      {children}
    </AnchoredOverlay>
  );
}
