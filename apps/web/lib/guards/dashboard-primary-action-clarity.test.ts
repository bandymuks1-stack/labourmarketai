import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guard for Dashboard Primary-Action Clarity v1.
 *
 * Each dashboard room should present one clear primary action and must not
 * ship the confusing anti-patterns: a "fake clickable card" (a non-interactive
 * <div>/<li>/etc. wired with onClick or role="button" that looks tappable but
 * isn't a real control), a dead primary-styled element, or two primary CTAs
 * competing for the same decision at the room's top level.
 *
 * Verified state (2026-06-01): every onClick in the dashboard surface is on a
 * real control; no room page has more than one top-level primary CTA; the one
 * primary CTA (/dashboard "next step") is a real <Link>. This guard pins that
 * against regression. It does NOT force a primary CTA where the room is
 * intentionally informational (account/profile) or delegates its single action
 * to one section form — so the invariant is "<= 1", not "exactly 1".
 *
 * Runs in CI via `pnpm -F web test`. Pure source assertions; invents nothing.
 */

const APP_ROOT = join(__dirname, "..", "..");
const DASH = "app/[locale]/dashboard";

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

const ROOM_PAGES = [
  // The card-overview home moved to Advanced mode; `/dashboard` is now the
  // conversation surface (its own interaction contract).
  "advanced/page.tsx",
  "account/page.tsx",
  "profile/page.tsx",
  "buyer/page.tsx",
  "company/page.tsx",
  "agency/page.tsx",
  "journal/page.tsx",
] as const;

// Native HTML elements that are legitimately interactive. A custom component
// (Capitalized tag, e.g. <Button>, <Link>) is also fine — onClick is then a
// prop the component owns, not a styled-div masquerading as a button.
const INTERACTIVE_NATIVE = new Set([
  "button",
  "a",
  "summary",
  "label",
  "input",
  "select",
  "textarea",
  "option",
  "details",
  "form",
]);

const OPEN_TAG = /<([A-Za-z][A-Za-z0-9]*)/g;

/** Opener (tag + start index) controlling the JSX attribute at `pos`. */
function controllingOpener(
  src: string,
  pos: number,
): { tag: string; index: number } | null {
  let opener: { tag: string; index: number } | null = null;
  OPEN_TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN_TAG.exec(src)) && m.index < pos)
    opener = { tag: m[1], index: m.index };
  return opener;
}

function isInteractive(tag: string | null): boolean {
  if (!tag) return false;
  // Uppercase first letter => React component (owns its own behaviour).
  if (/^[A-Z]/.test(tag)) return true;
  return INTERACTIVE_NATIVE.has(tag);
}

// A modal/overlay backdrop is a non-interactive element that legitimately
// carries onClick (dismiss-on-click-outside). It is NOT a fake clickable card.
const OVERLAY_MARKER = /role="(?:dialog|presentation|none)"|aria-modal=/;

/** All app components a dashboard room can render. */
function appComponentFiles(): string[] {
  const dir = join(APP_ROOT, "components", "app");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `components/app/${f}`);
}

const FAKE_CARD_SURFACE = [
  ...ROOM_PAGES.map((p) => `${DASH}/${p}`),
  ...appComponentFiles(),
];

// "Interactive" attributes that, on a non-interactive native element, signal a
// fake clickable card.
const CLICK_ATTR = /\bonClick=|\brole="button"/g;

describe("Guard: no fake clickable cards in dashboard surface", () => {
  for (const rel of FAKE_CARD_SURFACE) {
    it(`${rel} — onClick/role=button only on real controls`, () => {
      const src = read(rel);
      const offenders: string[] = [];
      CLICK_ATTR.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = CLICK_ATTR.exec(src))) {
        const opener = controllingOpener(src, m.index);
        if (isInteractive(opener?.tag ?? null)) continue;
        const isRoleButton = m[0].startsWith("role");
        // onClick on a dialog/overlay backdrop is a legit dismisser, not a card.
        const openTag = opener ? src.slice(opener.index, m.index) : "";
        if (!isRoleButton && OVERLAY_MARKER.test(openTag)) continue;
        const line = src.slice(0, m.index).split(/\r?\n/).length;
        offenders.push(`L${line}: <${opener?.tag ?? "?"}> has ${m[0]}`);
      }
      expect(
        offenders,
        `Fake clickable element(s) in ${rel} — use <button>/<Button>/<Link>, not a styled <div>: ${offenders.join(" | ")}`,
      ).toEqual([]);
    });
  }
});

// A top-level primary CTA = an explicit primary Button or the CTA gradient link
// pattern. NOTE: the decorative `bg-gradient-cta` fill (e.g. progress bars) is
// deliberately NOT counted — only `variant="primary"` and the CTA-link gradient
// `from-brand-blue to-brand-cyan`.
const PRIMARY_CTA = /variant="primary"|from-brand-blue to-brand-cyan/g;

describe("Guard: at most one primary action per room (page level)", () => {
  for (const page of ROOM_PAGES) {
    it(`${page} has <= 1 top-level primary CTA`, () => {
      const src = read(`${DASH}/${page}`);
      const count = (src.match(PRIMARY_CTA) ?? []).length;
      expect(
        count,
        `${page} has ${count} top-level primary CTAs — keep one clear primary action per room.`,
      ).toBeLessThanOrEqual(1);
    });
  }

  it("the /dashboard primary CTA is a real interactive element (not a dead card)", () => {
    // The single /dashboard primary CTA moved into <DashboardNextAction>
    // (slice role-next-action-simplicity-v1): one role-based gradient CTA,
    // mounted from the page. Assert it's mounted and the gradient lives in a
    // real interactive element inside that component.
    // The card-overview home (with its Next Action CTA) is now Advanced mode.
    const page = read(`${DASH}/advanced/page.tsx`);
    expect(page).toMatch(/<DashboardNextAction\b/);
    const src = read("components/app/dashboard-next-action.tsx");
    const idx = src.indexOf("from-brand-blue to-brand-cyan");
    expect(idx, "expected the Next Action primary CTA gradient").toBeGreaterThan(0);
    expect(
      isInteractive(controllingOpener(src, idx)?.tag ?? null),
      "the Next Action primary CTA must be a <Link>/<Button>/<a>, not a styled <div>",
    ).toBe(true);
  });
});
