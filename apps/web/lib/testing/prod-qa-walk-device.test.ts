import type { BrowserContextOptions } from "@playwright/test";
import { describe, expect, it } from "vitest";

import { WALK_PHONE, walkDevice, withWalkDevice } from "./prod-qa-walk-device";

describe("which device a production walk runs on", () => {
  it("is the desktop unless the walk is told otherwise", () => {
    expect(walkDevice({})).toBe("desktop");
    expect(walkDevice({ PROD_QA_DEVICE: "" })).toBe("desktop");
    expect(walkDevice({ PROD_QA_DEVICE: "desktop" })).toBe("desktop");
    expect(walkDevice({ PROD_QA_DEVICE: " phone " })).toBe("phone");
  });

  it("refuses a device it does not know instead of quietly running on a desktop", () => {
    expect(() => walkDevice({ PROD_QA_DEVICE: "tablet" })).toThrow(/must be "desktop" or "phone"/);
    expect(() => walkDevice({ PROD_QA_DEVICE: "Phone" })).toThrow();
  });
});

describe("the screen a context is opened with", () => {
  it("on the desktop nothing is added: the options are the spec's, untouched", () => {
    const options = { storageState: "x.json" };
    expect(withWalkDevice("desktop", options)).toBe(options);
  });

  it("on a phone a context that names no screen becomes a 390 px touch phone", () => {
    const made: BrowserContextOptions = withWalkDevice<BrowserContextOptions>("phone", { storageState: "x.json", locale: "lt-LT" });
    expect(made).toEqual({ ...WALK_PHONE, storageState: "x.json", locale: "lt-LT" });
    expect(made.viewport).toEqual({ width: 390, height: 844 });
    expect(made.isMobile).toBe(true);
    expect(made.hasTouch).toBe(true);
    expect(made.userAgent).toMatch(/Mobile/);
  });

  it("a step that names its own screen keeps it, and is shielded from the phone defaults", () => {
    const desktop = { userAgent: "DesktopUA", deviceScaleFactor: 1 };
    const desktopStep = { viewport: { width: 1280, height: 800 }, storageState: "x.json" };
    expect(withWalkDevice("phone", desktopStep, desktop)).toEqual({ ...desktopStep, isMobile: false, hasTouch: false, userAgent: "DesktopUA", deviceScaleFactor: 1 });
    // A step that already is a phone of its own keeps every choice it made.
    const phoneStep = { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true };
    expect(withWalkDevice("phone", phoneStep, desktop)).toEqual({ ...phoneStep, userAgent: "DesktopUA", deviceScaleFactor: 1 });
    // `viewport: null` (no fixed size) is a choice too.
    expect(withWalkDevice("phone", { viewport: null }, desktop).viewport).toBeNull();
    // On a desktop run such a step is returned untouched.
    expect(withWalkDevice("desktop", desktopStep, desktop)).toBe(desktopStep);
  });

  it("the phone is inside the width class the acceptance gate names", () => {
    expect(WALK_PHONE.viewport?.width).toBeGreaterThanOrEqual(375);
    expect(WALK_PHONE.viewport?.width).toBeLessThanOrEqual(390);
  });
});
