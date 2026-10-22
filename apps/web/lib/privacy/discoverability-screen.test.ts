import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { discoverabilityScreen, type DiscoverabilityPhase } from "./discoverability-screen";
import type { DiscoverabilityStatus } from "./discoverability-actions";

/**
 * Employer visibility can be turned back on from the screen that turned it
 * off. Before the fix, the withdrawn screen's "manage" button set the phase to
 * "expanded" while the stored status stayed "withdrawn", so the component kept
 * choosing the withdrawn screen — the button vanished and no grant button ever
 * appeared (found by the production walk prod-search-support-privacy P-8).
 */
type Ui = { status: DiscoverabilityStatus; phase: DiscoverabilityPhase; reopened: boolean };
const screen = (ui: Ui) => discoverabilityScreen(ui);

// The component's own transitions (components/app/discoverability-consent.tsx).
const withdrawOk = (ui: Ui): Ui => ({ ...ui, phase: "withdrawn", reopened: false });
const reopen = (ui: Ui): Ui => ({ ...ui, phase: "expanded", reopened: true });
const grantOk = (ui: Ui): Ui => ({ ...ui, phase: "done", reopened: false });
const reload = (status: DiscoverabilityStatus): Ui => ({ status, phase: "idle", reopened: false });

describe("discoverabilityScreen — withdraw, then grant again", () => {
  it("granted → withdraw → manage → the choice screen (with grant) → granted", () => {
    let ui: Ui = { status: "granted", phase: "idle", reopened: false };
    expect(screen(ui)).toBe("granted");
    ui = withdrawOk(ui);
    expect(screen(ui)).toBe("withdrawn");
    ui = reopen(ui);
    expect(screen(ui), "manage opens the decision again").toBe("choice");
    expect(ui.phase, "the choice screen is already expanded: the grant button shows").toBe("expanded");
    ui = grantOk(ui);
    expect(screen(ui)).toBe("granted");
  });

  it("works the same after a reload, when the STORED status is withdrawn", () => {
    let ui = reload("withdrawn");
    expect(screen(ui)).toBe("withdrawn");
    ui = reopen(ui);
    expect(screen(ui)).toBe("choice");
    ui = grantOk(ui);
    expect(screen(ui), "a fresh grant wins over the not-yet-refreshed stored status").toBe("granted");
    // And a second withdrawal goes back to the withdrawn screen, not the choice.
    ui = withdrawOk({ ...ui, status: "granted" });
    expect(screen(ui)).toBe("withdrawn");
  });

  it("keeps every earlier screen decision", () => {
    expect(screen({ status: "not_set", phase: "idle", reopened: false })).toBe("choice");
    expect(screen({ status: "granted_stale_version", phase: "idle", reopened: false })).toBe("choice");
    expect(screen({ status: "not_set", phase: "declined", reopened: false })).toBe("choice");
    expect(screen({ status: "granted", phase: "error", reopened: false })).toBe("granted");
    expect(screen({ status: "not_set", phase: "done", reopened: false })).toBe("granted");
    expect(screen({ status: "withdrawn", phase: "idle", reopened: false })).toBe("withdrawn");
  });

  it("the component wires the reopen button and both results to these transitions", () => {
    const src = readFileSync(join(__dirname, "..", "..", "components/app/discoverability-consent.tsx"), "utf8");
    expect(src).toContain("discoverabilityScreen({ status, phase, reopened })");
    const reopenButton = src.split('data-testid="discoverability-reopen"')[0].split("onClick=").pop() ?? "";
    expect(reopenButton).toContain("setReopened(true)");
    expect(reopenButton).toContain('setPhase("expanded")');
    // The reopen button is no longer hidden behind the phase it sets.
    expect(src).not.toMatch(/phase !== "expanded" \? \(\s*<button[\s\S]{0,200}discoverability-reopen/);
  });
});
