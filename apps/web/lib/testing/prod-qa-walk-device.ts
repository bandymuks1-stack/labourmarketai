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
 */
export type WalkDevice = "desktop" | "phone" | "phone-375";

export const WALK_DEVICES: readonly WalkDevice[] = ["desktop", "phone", "phone-375"];

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

/** The screen a phone device opens with; `null` for the desktop, which adds nothing. */
export function walkPhone(device: WalkDevice): typeof WALK_PHONE | null {
  if (device === "phone") return WALK_PHONE;
  if (device === "phone-375") return WALK_PHONE_375;
  return null;
}

/** The device named by the environment. Unset or empty is the desktop; anything else unknown is refused. */
export function walkDevice(env: Readonly<Record<string, string | undefined>>): WalkDevice {
  const raw = (env.PROD_QA_DEVICE ?? "").trim();
  if (raw === "" || raw === "desktop") return "desktop";
  if (raw === "phone" || raw === "phone-375") return raw;
  throw new Error(`PROD_QA_DEVICE must be "desktop", "phone" or "phone-375", not "${raw.slice(0, 20)}"`);
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
