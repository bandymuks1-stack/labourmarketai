import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  FUNNEL_MAX_ROWS,
  summariseFunnel,
} from "@/lib/admin/conversion-funnel";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * Guard for W14 item 7 — KPI DISPLAY TRUTH.
 *
 * THE DEFECT. #1086 and #1088 made the funnel's backend honest: a rate is
 * `null` when the denominator is empty AND when the read was truncated, and the
 * `note` says which. The panel then rendered:
 *
 *   {r.pct === null ? "—" : `${r.pct}%`}
 *
 * One dash for both. "We have no landings yet" and "we refuse to state a share
 * because the read hit its cap" are different answers to different questions,
 * and the reader — the owner deciding whether to spend on ads — saw the same
 * character for each. The `note` that distinguishes them was computed on every
 * request and rendered nowhere.
 *
 * A trustworthy backend behind a collapsing frontend is still a product defect,
 * and this is the shape it takes: the honesty was all present in memory and
 * none of it reached the screen.
 *
 * THE RULE. These states must never share a rendering:
 *   0%                              — a real measured zero
 *   INSUFFICIENT_DATA               — nothing to divide by yet
 *   TRUNCATED                       — a share exists but cannot be stated
 * and the page must additionally carry HISTORICAL_CONTAMINATION_UNKNOWN, which
 * is a property of the whole period rather than of one rate.
 */

const APP = resolve(__dirname, "..", "..");
const PAGE = readFileSync(
  resolve(APP, "app", "[locale]", "dashboard", "admin", "telemetry", "page.tsx"),
  "utf8",
);

const ev = (event: string) => ({
  event_name: event,
  metadata: null as Record<string, unknown> | null,
  profile_id: null as string | null,
});
const rows = (event: string, n: number) => Array.from({ length: n }, () => ev(event));

describe("W14 item 7 — a rate says WHICH kind of nothing it is", () => {
  it("distinguishes a real zero from insufficient data", () => {
    // 0 clicks over 100 landings is a MEASURED zero — a real answer.
    const measured = summariseFunnel(rows(FUNNEL_EVENTS.landingViewed, 100));
    const zero = measured.rates.find((r) => r.label === "Landing → CTA click")!;
    expect(zero.pct).toBe(0);
    expect(zero.state).toBe("ok");

    // No landings at all is NOT zero — there is nothing to divide by.
    const empty = summariseFunnel(rows(FUNNEL_EVENTS.ctaClicked, 5));
    const unknown = empty.rates.find((r) => r.label === "Landing → CTA click")!;
    expect(unknown.pct).toBeNull();
    expect(unknown.state).toBe("insufficient_data");
  });

  it("distinguishes insufficient data from a truncated read", () => {
    const saturated = summariseFunnel([
      ...rows(FUNNEL_EVENTS.landingViewed, FUNNEL_MAX_ROWS - 5),
      ...rows(FUNNEL_EVENTS.ctaClicked, 5),
    ]);
    const r = saturated.rates.find((rt) => rt.label === "Landing → CTA click")!;
    expect(r.pct).toBeNull();
    // Both are null — the STATE is what tells them apart, and it must not be
    // inferred by the UI from string-matching the note.
    expect(r.state).toBe("truncated");
    expect(r.state).not.toBe("insufficient_data");
  });

  it("every rate carries a state, and only three are legal", () => {
    const out = summariseFunnel(rows(FUNNEL_EVENTS.landingViewed, 10));
    for (const r of out.rates) {
      expect(["ok", "insufficient_data", "truncated"]).toContain(r.state);
    }
  });

  it("state and pct can never disagree", () => {
    for (const input of [
      rows(FUNNEL_EVENTS.landingViewed, 100),
      rows(FUNNEL_EVENTS.ctaClicked, 5),
      [...rows(FUNNEL_EVENTS.landingViewed, FUNNEL_MAX_ROWS)],
      [],
    ]) {
      for (const r of summariseFunnel(input).rates) {
        if (r.state === "ok") expect(typeof r.pct).toBe("number");
        else expect(r.pct).toBeNull();
      }
    }
  });
});

describe("W14 item 7 — the panel renders the distinction", () => {
  it("does not collapse every null into one dash", () => {
    // The exact defect: a single ternary on `pct === null`.
    expect(PAGE).not.toMatch(/r\.pct === null \? "—" : `\$\{r\.pct\}%`/);
  });

  it("branches on the state, not on the pct alone", () => {
    expect(PAGE).toMatch(/r\.state/);
  });

  it("renders the note that explains the rate", () => {
    // Computed on every request since #1086 and shown nowhere until now.
    expect(PAGE).toMatch(/\{r\.note\}/);
  });

  it("still carries the period-level caveats from #1086 / #1088", () => {
    expect(PAGE).toContain("historicalContaminationUnknown");
    expect(PAGE).toContain("countsAreLowerBound");
    expect(PAGE).toContain("windowDays");
    expect(PAGE).toContain("excludedAdmin");
  });
});

describe("W14 item 7 — other rate hosts were checked, not assumed", () => {
  /**
   * The prior report claimed /dashboard/admin/telemetry was the only KPI host.
   * It is not — these render a percentage too. They are correct for a reason
   * worth pinning: the fit percentage is null-guarded at its source
   * (`computeContextFit` returns null for an empty need) and the surfaces
   * render it with its basis rather than alone.
   */
  const hosts = [
    ["app/[locale]/dashboard/admin/matching/page.tsx", true],
    ["app/[locale]/dashboard/admin/launch-readiness/page.tsx", false],
  ] as const;

  it("the matching workbench never shows a bare percentage", () => {
    const src = readFileSync(resolve(APP, hosts[0][0]), "utf8");
    // "§19: the coverage % never without its basis" — the basis is rendered
    // adjacent to every pct.
    expect(src).toMatch(/skillFit\.pct/);
    expect(src).toMatch(/matchedTotal|needTotal|basis/i);
  });

  it("launch readiness shows counts and states it shows no percentages", () => {
    const src = readFileSync(resolve(APP, hosts[1][0]), "utf8");
    expect(src).toMatch(/No percentages/i);
    // A failed read renders an em dash rather than a zero.
    expect(src).toMatch(/—/);
  });
});
