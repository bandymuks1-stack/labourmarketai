import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SAVE_TIMEOUT_MS, withTimeout } from "@/lib/async/with-timeout";
import type { BookingActionResult } from "@/lib/booking/booking-actions";
import {
  PROPOSE_TIMEOUT_LABEL,
  isProposeTimeout,
  proposeOutcomeState,
} from "@/lib/booking/propose-outcome";

/**
 * Regression for the UX run 2026-10-24 (row 5.13): the company's propose form
 * stayed on "Siunčiama…". The proposal itself was stored and delivered (row +
 * worker bell, ~9 s after the click on the loaded local server); the form
 * simply had no way to end a send that did not answer, and a send that threw
 * escaped into the error boundary. These tests pin the three endings.
 */

describe("proposeOutcomeState — every answer has a visible state", () => {
  const cases: [BookingActionResult, string][] = [
    [{ kind: "ok", status: "proposed" }, "sent"],
    [{ kind: "needs-migration" }, "unavailable"],
    [{ kind: "not-entitled" }, "not_entitled"],
    [{ kind: "rate-limited" }, "rate_limited"],
    [{ kind: "already-accepted" }, "already_accepted"],
    [{ kind: "refused", reason: "worker-not-reachable" }, "refused_not_reachable"],
    [{ kind: "refused", reason: "need-closed" }, "refused_need_closed"],
    [{ kind: "refused", reason: "already-answered" }, "refused_answered"],
    [{ kind: "conflict" }, "error"],
    [{ kind: "not-authed" }, "error"],
    [{ kind: "error", message: "boom" }, "error"],
  ];
  it.each(cases)("%j → %s", (res, expected) => {
    expect(proposeOutcomeState(res)).toBe(expected);
  });

  it("no answer (a redirect answers without a result) is an error, never a silent success", () => {
    expect(proposeOutcomeState(undefined)).toBe("error");
    expect(proposeOutcomeState(null)).toBe("error");
    expect(proposeOutcomeState("ok" as unknown as BookingActionResult)).toBe("error");
  });
});

describe("a send that never answers ends as `unconfirmed`, not as a stuck pending", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("withTimeout rejects with the propose label and isProposeTimeout recognises it", async () => {
    vi.useFakeTimers();
    const never = new Promise<BookingActionResult>(() => undefined);
    const bounded = withTimeout(never, SAVE_TIMEOUT_MS, PROPOSE_TIMEOUT_LABEL);
    const caught = bounded.then(
      () => "resolved",
      (e: unknown) => (isProposeTimeout(e) ? "unconfirmed" : "error"),
    );
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS);
    await expect(caught).resolves.toBe("unconfirmed");
  });

  it("a thrown send (network drop, server-action error) is an error, not a timeout", () => {
    expect(isProposeTimeout(new TypeError("Failed to fetch"))).toBe(false);
    expect(isProposeTimeout(new Error("operation-timeout"))).toBe(false);
    expect(isProposeTimeout("propose-booking-timeout")).toBe(false);
    expect(isProposeTimeout(new Error(`${PROPOSE_TIMEOUT_LABEL}-timeout`))).toBe(true);
  });
});

describe("the propose form wires the bounded send (static guard)", () => {
  const src = readFileSync(
    join(__dirname, "..", "..", "components", "app", "propose-booking-button.tsx"),
    "utf8",
  );

  it("bounds the server action with withTimeout and catches what it throws", () => {
    expect(src).toMatch(/withTimeout\(\s*call,\s*SAVE_TIMEOUT_MS,\s*PROPOSE_TIMEOUT_LABEL\s*\)/);
    expect(src).toMatch(/try\s*\{[\s\S]*?withTimeout[\s\S]*?\}\s*catch\s*\(/);
    // No bare `await proposeBookingAction(` left — that was the hang.
    expect(src).not.toMatch(/await\s+proposeBookingAction\(/);
  });

  it("maps answers through the ONE mapping and renders the unconfirmed + error states", () => {
    expect(src).toMatch(/proposeOutcomeState\(res\)/);
    expect(src).toMatch(/proposeOutcomeState\(late\)/);
    expect(src).toMatch(/data-testid="propose-booking-unconfirmed"/);
    expect(src).toMatch(/tPropose\("unconfirmed"\)/);
    expect(src).toMatch(/data-testid="propose-booking-error"/);
  });

  it("the pending label rides on the form's own flag, not a transition's isPending", () => {
    // A transition stays pending while the router's server-action update is
    // in flight, so `useTransition` would keep "Siunčiama…" past the bound.
    expect(src).not.toMatch(/useTransition/);
    expect(src).toMatch(/const \[pending, setPending\] = useState\(false\)/);
    expect(src).toMatch(/finally\s*\{\s*if \(attempt\.current === mine\) setPending\(false\)/);
  });

  it("only the latest send may set the state (a late answer cannot overwrite a retry)", () => {
    expect(src).toMatch(/const mine = \+\+attempt\.current/);
    expect(src).toMatch(/attempt\.current === mine/);
  });
});
