import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A WORKER IS ASKED WHERE THEY START (production 2026-10-09).
 *
 * 0 of 22 real workers had ever granted `profile_discoverability` — the last
 * grant by anyone was a test account on 2026-08-06 — so no real worker could be
 * found by any company. The consent, its ledger and its RPCs were complete, and
 * `DISCOVERABILITY_CONSENT_SOURCES` already named "onboarding" (owner P0
 * 2026-09-30), but onboarding never rendered it.
 *
 * Pinned: onboarding renders the EXISTING consent component through the same
 * loader the chat uses, with source "onboarding"; the wizard shows it only for
 * a worker context; nothing on the page grants anything by itself.
 */

const APP = join(__dirname, "..", "..");
const page = readFileSync(join(APP, "app", "[locale]", "onboarding", "page.tsx"), "utf8");
const wizard = readFileSync(join(APP, "components", "app", "onboarding-wizard.tsx"), "utf8");

describe("onboarding asks for employer visibility", () => {
  it("the page renders the existing consent component with source onboarding", () => {
    expect(page).toMatch(/loadEmployerVisibilityForChat\(\)/);
    expect(page).toMatch(/<DiscoverabilityConsent[^>]*source="onboarding"/);
  });

  it("an unknown state or a missing worker embeds nothing (SEP-7)", () => {
    expect(page).toMatch(/visibility\.kind === "state" && visibility\.consent/);
  });

  it("the wizard shows it only for a worker context", () => {
    expect(wizard).toMatch(/employerVisibility && roles\.has\("worker"\)/);
  });

  it("nothing is granted by default", () => {
    expect(page).not.toMatch(/grantProfileDiscoverability/);
    expect(wizard).not.toMatch(/grantProfileDiscoverability/);
  });
});
