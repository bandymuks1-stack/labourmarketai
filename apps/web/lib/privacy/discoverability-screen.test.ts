import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  discoverabilityScreen,
  type ConfirmedVisibility,
  type DiscoverabilityPhase,
} from "./discoverability-screen";
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
 * The component's state is modelled here exactly as it holds it: the server
 * read (`status`, which some doors never refresh), the REQUEST phase, and the
 * last CONFIRMED write. A failed request must never move the screen.
 */
type Ui = { status: DiscoverabilityStatus; phase: DiscoverabilityPhase; confirmed: ConfirmedVisibility };
const screen = (ui: Ui) => discoverabilityScreen({ status: ui.status, confirmed: ui.confirmed });

// The component's own transitions (components/app/discoverability-consent.tsx).
const grantOk = (ui: Ui): Ui => ({ ...ui, phase: "idle", confirmed: "on" });
const withdrawOk = (ui: Ui): Ui => ({ ...ui, phase: "idle", confirmed: "off" });
const requestFailed = (ui: Ui): Ui => ({ ...ui, phase: "error" }); // confirmed untouched
const load = (status: DiscoverabilityStatus): Ui => ({ status, phase: "idle", confirmed: null });

describe("discoverabilityScreen — off and on again, one screen each", () => {
  it("granted → withdraw → the choice screen (with grant) → granted", () => {
    let ui = load("granted");
    expect(screen(ui)).toBe("granted");
    ui = withdrawOk(ui);
    expect(screen(ui), "a fresh withdrawal wins over the not-yet-refreshed stored grant").toBe("choice");
    ui = grantOk(ui);
    expect(screen(ui)).toBe("granted");
  });

  it("works the same when the STORED status is withdrawn", () => {
    let ui = load("withdrawn");
    expect(screen(ui), "withdrawn is the choice screen directly — no extra 'manage' tap").toBe("choice");
    ui = grantOk(ui);
    expect(screen(ui), "a fresh grant wins over the not-yet-refreshed stored status").toBe("granted");
    ui = withdrawOk(ui);
    expect(screen(ui)).toBe("choice");
  });

  it("only a CURRENT-version grant is ON (same rule as the RLS predicate)", () => {
    expect(screen(load("not_set"))).toBe("choice");
    expect(screen(load("granted_stale_version"))).toBe("choice");
    expect(screen({ ...load("not_set"), phase: "declined" })).toBe("choice");
    expect(screen(load("withdrawn"))).toBe("choice");
  });
});

describe("a FAILED request never changes the visibility shown (#2730 review)", () => {
  it("granted → withdraw OK → grant FAILS: still OFF, the grant button stays for a retry", () => {
    // The conversation embed keeps its first props: status stays "granted".
    let ui = load("granted");
    ui = withdrawOk(ui);
    ui = requestFailed(ui);
    expect(ui.status, "the stale read the embed still holds").toBe("granted");
    expect(screen(ui), "the profile IS hidden — never claim it is visible").toBe("choice");
    ui = grantOk(ui); // the retry succeeds
    expect(screen(ui)).toBe("granted");
  });

  it("not_set → grant OK → withdraw FAILS: still ON, the withdraw button stays", () => {
    let ui = load("not_set");
    ui = grantOk(ui);
    ui = requestFailed(ui);
    expect(screen(ui), "the profile IS visible — never claim it is hidden").toBe("granted");
  });

  it("a failure before any success shows the server read", () => {
    expect(screen(requestFailed(load("granted")))).toBe("granted");
    expect(screen(requestFailed(load("not_set")))).toBe("choice");
  });
});

describe("the component — one action each way, the result said", () => {
  const src = readFileSync(join(__dirname, "..", "..", "components/app/discoverability-consent.tsx"), "utf8");
  const choice = src.slice(src.indexOf('data-testid="discoverability-choice"'));
  const granted = src.slice(
    src.indexOf('data-testid="discoverability-granted"'),
    src.indexOf('data-testid="discoverability-choice"'),
  );
  const handler = (name: string) => src.slice(src.indexOf(`function ${name}()`), src.indexOf("}\n", src.indexOf(`function ${name}()`) + 400) + 400);

  it("decides the screen from the server read and the last CONFIRMED write only", () => {
    expect(src).toContain("discoverabilityScreen({ status, confirmed })");
  });

  it("a failed grant / withdrawal sets only the request phase, never `confirmed`", () => {
    for (const name of ["onGrant", "onWithdraw"]) {
      const body = handler(name).replace(/\r\n/g, "\n");
      const okBranch = body.slice(body.indexOf('if (res.kind === "ok")'), body.indexOf('} else if (res.kind === "needs-migration")'));
      const failBranch = body.slice(body.indexOf('} else if (res.kind === "needs-migration")'));
      expect(okBranch, name).toMatch(/setConfirmed\("(on|off)"\)/);
      expect(failBranch.slice(0, failBranch.indexOf("});")), name).not.toContain("setConfirmed");
    }
  });

  it("ON: the withdraw button is rendered directly, not behind a 'manage' step", () => {
    expect(granted).toContain('{withdrawButton}');
    expect(granted.split('{withdrawButton}')[0]).not.toMatch(/setManaging|discoverability-manage/);
    expect(src).toMatch(/const withdrawButton = \(\s+<button[\s\S]{0,400}data-testid="discoverability-withdraw"/);
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
