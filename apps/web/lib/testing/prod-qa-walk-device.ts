import type { BrowserContextOptions } from "@playwright/test";

/**
 * THE SCREEN A PRODUCTION WALK RUNS ON.
 *
 * Every signed-in production walk ran on a desktop screen only (the one Playwright
 * project is Desktop Chrome), so nothing proved a journey at phone width with touch.
 * `PROD_QA_DEVICE=phone` (390 px) or `phone-375` (375 px) runs the SAME spec, with the
 * same synthetic accounts and the same writes, on a phone: every browser context the
 * walk opens WITHOUT naming its own screen gets that phone.
 *
 * A step that names its own viewport keeps it, on either device. Those steps are
 * deliberate: "the worker sees it on a phone", "the same page at 1280". Rewriting them
 * would silently change what the step proves, so the device is a default, never an
 * override.
 *
 * `tablet-768` (768 px, touch) and `desktop-1440` (a wide computer screen) complete the
 * size matrix the owner ordered for the production UX measurement (#3679 addendum:
 * 375, 390, 768 and 1440). `desktop` stays the walk's own Desktop Chrome screen.
 */
export type WalkDevice = "desktop" | "phone" | "phone-375" | "tablet-768" | "desktop-1440";

export const WALK_DEVICES: readonly WalkDevice[] = ["desktop", "phone", "phone-375", "tablet-768", "desktop-1440"];

/**
 * 390 × 844, touch, a phone's user agent: the size class the acceptance gate names
 * (375–390 px). The user agent is Android Chrome so the page is served and behaves as
 * it does for a phone, in the Chrome build the walk already runs in.
 */
export const WALK_PHONE: Readonly<Required<Pick<BrowserContextOptions, "viewport" | "isMobile" | "hasTouch" | "deviceScaleFactor" | "userAgent">>> = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
};

/**
 * 375 × 667: the narrow end of the owner's phone range (2026-11-14: "375 px ir 390 px"),
 * with the short screen of a small phone, so a control that only just fits at 390 × 844
 * is seen leaving the first screen. Same touch and user agent as the 390 px phone: only
 * the size differs.
 */
export const WALK_PHONE_375: typeof WALK_PHONE = {
  ...WALK_PHONE,
  viewport: { width: 375, height: 667 },
  deviceScaleFactor: 2,
};

/**
 * 768 × 1024, touch: a tablet held upright, the size class between the phones and a
 * computer. Android Chrome without "Mobile" in the user agent, which is how a tablet
 * identifies itself.
 */
export const WALK_TABLET_768: typeof WALK_PHONE = {
  viewport: { width: 768, height: 1024 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

/** 1440 × 900, no touch: a wide computer screen, with the walk's own desktop browser identity. */
export const WALK_DESKTOP_1440: Readonly<Required<Pick<BrowserContextOptions, "viewport" | "isMobile" | "hasTouch">>> = {
  viewport: { width: 1440, height: 900 },
  isMobile: false,
  hasTouch: false,
};

/**
 * The screen a device opens with; `null` for the desktop, which adds nothing. (Named
 * for the first screens it carried; it carries every non-default screen.)
 */
export function walkPhone(device: WalkDevice): typeof WALK_PHONE | typeof WALK_DESKTOP_1440 | null {
  if (device === "phone") return WALK_PHONE;
  if (device === "phone-375") return WALK_PHONE_375;
  if (device === "tablet-768") return WALK_TABLET_768;
  if (device === "desktop-1440") return WALK_DESKTOP_1440;
  return null;
}

/** The device named by the environment. Unset or empty is the desktop; anything else unknown is refused. */
export function walkDevice(env: Readonly<Record<string, string | undefined>>): WalkDevice {
  const raw = (env.PROD_QA_DEVICE ?? "").trim();
  if (raw === "" || raw === "desktop") return "desktop";
  const known = WALK_DEVICES.find((d) => d === raw);
  if (known) return known;
  throw new Error(`PROD_QA_DEVICE must be one of ${WALK_DEVICES.map((d) => `"${d}"`).join(", ")}, not "${raw.slice(0, 20)}"`);
}

/**
 * THE COLOUR SCHEME A PRODUCTION WALK RUNS IN (owner order, #3679 addendum). `light` is
 * what every walk ran in before; `dark` asks the page for its dark scheme through the
 * browser, as a viewer's system setting would.
 */
export type WalkTheme = "light" | "dark";

export const WALK_THEMES: readonly WalkTheme[] = ["light", "dark"];

/** The theme named by the environment. Unset or empty is light; anything else unknown is refused. */
export function walkTheme(env: Readonly<Record<string, string | undefined>>): WalkTheme {
  const raw = (env.PROD_QA_THEME ?? "").trim();
  if (raw === "" || raw === "light") return "light";
  if (raw === "dark") return "dark";
  throw new Error(`PROD_QA_THEME must be "light" or "dark", not "${raw.slice(0, 20)}"`);
}

/** What a step that names its own screen ran as before the device existed: the desktop browser. */
export type WalkDesktopIdentity = Readonly<Pick<BrowserContextOptions, "userAgent" | "deviceScaleFactor">>;

/**
 * The options a context is opened with on this device. On a phone, a context that
 * does not name its own screen becomes the phone. One that does is left as the spec
 * wrote it AND is shielded from the phone defaults (touch, phone user agent), which
 * the test options would otherwise pour into it: it runs exactly as it does on a
 * desktop walk. On the desktop nothing is added at all.
 */
export function withWalkDevice<T extends BrowserContextOptions>(device: WalkDevice, options: T, desktop: WalkDesktopIdentity = {}): T {
  const phone = walkPhone(device);
  if (phone === null) return options;
  if (options.viewport !== undefined || options.isMobile !== undefined) {
    return { isMobile: false, hasTouch: false, ...desktop, ...options };
  }
  return { ...phone, ...options };
}
