import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { discoverabilityScreen, type DiscoverabilityPhase } from "./discoverability-screen";
import type { DiscoverabilityStatus } from "./discoverability-actions";

/**
 * MATCHABILITY IN ONE TAP EACH WAY (owner goal 2026-10-24).
 *
 * Local walk 2026-10-24, before this change: turning employer visibility ON
 * took two taps (a button labelled with the consent title that only opened the
 * text, then the grant), OFF took two (a "review or switch off" button, then
 * the withdraw), and ON again after a withdrawal took two or three (the
 * withdrawn screen's "manage", then the grant — and before #2656 the grant
 * never appeared at all, found by the production walk P-8).
 *
 * Now: ON shows the switch-off button; OFF — never decided, withdrawn, or a
 * grant under a superseded text — shows the choice with the text and the grant
 * already on screen.
 */
type Ui = { status: DiscoverabilityStatus; phase: DiscoverabilityPhase };
const screen = (ui: Ui) => discoverabilityScreen(ui);

// The component's own transitions (components/app/discoverability-consent.tsx).
const withdrawOk = (ui: Ui): Ui => ({ ...ui, phase: "withdrawn" });
const grantOk = (ui: Ui): Ui => ({ ...ui, phase: "done" });
const reload = (status: DiscoverabilityStatus): Ui => ({ status, phase: "idle" });

describe("discoverabilityScreen — off and on again, one screen each", () => {
  it("granted → withdraw → the choice screen (with grant) → granted", () => {
    let ui: Ui = { status: "granted", phase: "idle" };
    expect(screen(ui)).toBe("granted");
    ui = withdrawOk(ui);
    expect(screen(ui), "a fresh withdrawal wins over the not-yet-refreshed stored grant").toBe("choice");
    ui = grantOk(ui);
    expect(screen(ui)).toBe("granted");
  });

  it("works the same after a reload, when the STORED status is withdrawn", () => {
    let ui = reload("withdrawn");
    expect(screen(ui), "withdrawn is the choice screen directly — no extra 'manage' tap").toBe("choice");
    ui = grantOk(ui);
    expect(screen(ui), "a fresh grant wins over the not-yet-refreshed stored status").toBe("granted");
    ui = withdrawOk({ ...ui, status: "granted" });
    expect(screen(ui)).toBe("choice");
  });

  it("only a CURRENT-version grant is ON (same rule as the RLS predicate)", () => {
    expect(screen({ status: "not_set", phase: "idle" })).toBe("choice");
    expect(screen({ status: "granted_stale_version", phase: "idle" })).toBe("choice");
    expect(screen({ status: "not_set", phase: "declined" })).toBe("choice");
    expect(screen({ status: "granted", phase: "error" })).toBe("granted");
    expect(screen({ status: "not_set", phase: "done" })).toBe("granted");
    expect(screen({ status: "withdrawn", phase: "idle" })).toBe("choice");
  });
});

describe("the component — one action each way, the result said", () => {
  const src = readFileSync(join(__dirname, "..", "..", "components/app/discoverability-consent.tsx"), "utf8");
  const choice = src.slice(src.indexOf('data-testid="discoverability-choice"'));
  const granted = src.slice(
    src.indexOf('data-testid="discoverability-granted"'),
    src.indexOf('data-testid="discoverability-choice"'),
  );

  it("decides the screen from the pure helper", () => {
    expect(src).toContain("discoverabilityScreen({ status, phase })");
  });

  it("ON: the withdraw button is rendered directly, not behind a 'manage' step", () => {
    expect(granted).toContain('data-testid="discoverability-withdraw"');
    expect(granted.split('data-testid="discoverability-withdraw"')[0]).not.toMatch(/setManaging|discoverability-manage/);
    expect(src).not.toContain("discoverability-reopen");
  });

  it("OFF (non-compact): the full legal text and the grant render without an 'open' tap", () => {
    expect(src).toContain("const showTerms = !compact || opened;");
    expect(choice).toContain("{legalBlock}");
    expect(choice).toContain('data-testid="discoverability-grant"');
    // The 'open' button exists ONLY for the compact (home) form, and it says
    // what it does: read the terms — it never grants.
    const openBtn = choice.split('data-testid="discoverability-open"')[0].split("onClick=").pop() ?? "";
    expect(openBtn).toContain("setOpened(true)");
    expect(openBtn).not.toMatch(/onGrant|grantProfileDiscoverability/);
  });

  it("the result of a grant and of a withdrawal is announced (role=status)", () => {
    expect(src).toMatch(/role="status"[\s\S]{0,160}data-testid="discoverability-granted-note"/);
    expect(src).toMatch(/role="status"[\s\S]{0,160}data-testid="discoverability-withdrawn-note"/);
  });

  it("every screen starts with the same status line (icon + word, not colour alone)", () => {
    expect(granted).toContain("{statusLine(true)}");
    expect(choice).toContain("{statusLine(false)}");
    expect(src).toContain("{on ? labels.stateOn : labels.stateOff}");
  });
});
