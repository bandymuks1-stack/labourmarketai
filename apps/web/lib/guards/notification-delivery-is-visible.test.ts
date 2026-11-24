import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";

import { activeLocales } from "@/lib/i18n/config";

/**
 * A BELL THAT CANNOT FAIL LOUDLY MUST AT LEAST BE COUNTABLE.
 *
 * `emitDemandInterestNotification` swallows every error by design — a failed
 * notification must never fail a worker's expression of interest. The cost of
 * that correct choice is that a PERMANENT delivery failure is invisible from
 * inside the product: no error surfaces, no test fails, and the employer
 * simply never hears anything.
 *
 * Production on 2026-08-26: five `demand_interest_signals`, two
 * `demand_interest_expressed` events — and both of those carry `created_at`
 * identical to their signal rows to the microsecond, which this emitter cannot
 * produce because it never sets `created_at`. They are backfill artifacts, so
 * the live emitter has delivered nothing since it shipped.
 *
 * Read beside the interest counts that gap is legible. Alone, neither number
 * says anything — which is why the tile sits with them and why "unknown" must
 * stay distinct from zero.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

describe("the delivery side of the interest event is counted", () => {
  const signals = read("lib", "admin", "launch-signals.ts");

  it("counts the durable events, not something inferred", () => {
    expect(signals).toMatch(/interestNotified/);
    expect(signals).toMatch(/"notification_events"/);
    expect(signals).toMatch(/eq\("event_type", "demand_interest_expressed"\)/);
  });

  it("an unreadable store is unknown, never zero", () => {
    // `count` returns null on error and the board renders null as "—".
    // Reporting 0 for "could not look" would read as "delivered nothing" —
    // the same fabricated-analytics failure §18 forbids, pointed the other way.
    expect(signals).toMatch(/if \(error\) return null;/);
    const board = read("components", "app", "admin-launch-board.tsx");
    expect(board).toMatch(/typeof n === "number" \? n\.toLocaleString\(\) : "—"/);
  });

  it("the tile sits with the interest counts", () => {
    const board = read("components", "app", "admin-launch-board.tsx");
    const tiles = board.slice(
      board.indexOf("const signalTiles"),
      board.indexOf("];", board.indexOf("const signalTiles")),
    );
    expect(tiles).toMatch(/interestActive/);
    expect(tiles).toMatch(/interestNotified/);
    // Immediately after the interest trio — the numbers only mean something
    // read together.
    expect(tiles.indexOf("interestNotified")).toBeGreaterThan(
      tiles.indexOf("interestContacted"),
    );
  });

  it("the grid actually has room for the extra tile", () => {
    // Eight tiles in a seven-column grid silently wraps one onto its own row,
    // which reads as a different kind of number.
    const board = read("components", "app", "admin-launch-board.tsx");
    const tiles = board.slice(
      board.indexOf("const signalTiles"),
      board.indexOf("];", board.indexOf("const signalTiles")),
    );
    const count = (tiles.match(/\{ key: "/g) ?? []).length;
    expect(board).toMatch(new RegExp(`lg:grid-cols-${count}`));
  });
});

describe("the label ships in every routable locale", () => {
  it.each([...activeLocales])("%s", (loc) => {
    const messages = JSON.parse(read("messages", `${loc}.json`));
    const t = createTranslator({ locale: loc, messages });
    const key = "admin.launch.signals.interestNotified";
    const out = t(key as never);
    expect(typeof out, loc).toBe("string");
    expect(out.trim().length, `${loc} empty`).toBeGreaterThan(0);
    expect(out, `${loc} did not resolve`).not.toContain(key);
  });

  it("is present wherever the sibling signals are", () => {
    const dir = join(WEB, "messages");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const msgs = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const sig = msgs?.admin?.launch?.signals;
      if (!sig) continue; // non-routable catalogues are partial by design
      expect(sig.interestNotified, `${f}`).toBeTruthy();
    }
  });
});
