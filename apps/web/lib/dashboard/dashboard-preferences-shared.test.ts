import { describe, expect, it } from "vitest";

import {
  DASHBOARD_PREFERENCES_MAX_BYTES,
  DASHBOARD_PREFERENCES_MAX_IDS,
  EMPTY_CARD_PREFS,
  fitsPreferencesByteBudget,
  isDashboardPreferencesContext,
  sanitizeCardPrefs,
} from "./dashboard-preferences-shared";

describe("dashboard preferences context slugs (§10 closed set)", () => {
  it("accepts exactly person and company", () => {
    expect(isDashboardPreferencesContext("person")).toBe(true);
    expect(isDashboardPreferencesContext("company")).toBe(true);
  });

  it("rejects anything else (default-closed)", () => {
    for (const bad of ["admin", "worker", "", "PERSON", "company ", "org"]) {
      expect(isDashboardPreferencesContext(bad)).toBe(false);
    }
  });
});

describe("sanitizeCardPrefs (bounded ids-only shape)", () => {
  it("valid payload passes through", () => {
    expect(
      sanitizeCardPrefs({ order: ["journal", "market_map"], hidden: ["assist"] }),
    ).toEqual({ order: ["journal", "market_map"], hidden: ["assist"] });
  });

  it("non-object / null / arrays → empty prefs, never a throw", () => {
    expect(sanitizeCardPrefs(null)).toEqual(EMPTY_CARD_PREFS);
    expect(sanitizeCardPrefs("journal")).toEqual(EMPTY_CARD_PREFS);
    expect(sanitizeCardPrefs(42)).toEqual(EMPTY_CARD_PREFS);
    expect(sanitizeCardPrefs(undefined)).toEqual(EMPTY_CARD_PREFS);
  });

  it("non-string members, empty ids and duplicates are dropped", () => {
    expect(
      sanitizeCardPrefs({
        order: ["journal", 5, null, "", "journal", {}],
        hidden: [["nested"], "tasks", "tasks"],
      }),
    ).toEqual({ order: ["journal"], hidden: ["tasks"] });
  });

  it("ids with a foreign charset are dropped (never query text or PII)", () => {
    expect(
      sanitizeCardPrefs({
        order: ["<script>", "user@mail.com", "id with spaces", "UPPER", "ok_id-1"],
        hidden: [],
      }),
    ).toEqual({ order: ["ok_id-1"], hidden: [] });
  });

  it("over-long ids are dropped, list length is capped", () => {
    const longId = "a".repeat(65);
    const many = Array.from({ length: 200 }, (_, i) => `id-${i}`);
    const out = sanitizeCardPrefs({ order: [longId, ...many], hidden: many });
    expect(out.order).not.toContain(longId);
    expect(out.order.length).toBeLessThanOrEqual(DASHBOARD_PREFERENCES_MAX_IDS);
    expect(out.hidden.length).toBeLessThanOrEqual(DASHBOARD_PREFERENCES_MAX_IDS);
  });

  it("a sanitized worst-case payload always fits the DB byte budget", () => {
    const worstId = (i: number) => `${"x".repeat(60)}${i.toString().padStart(3, "0")}`;
    const worst = sanitizeCardPrefs({
      order: Array.from({ length: 200 }, (_, i) => worstId(i)),
      hidden: Array.from({ length: 200 }, (_, i) => worstId(i + 500)),
    });
    expect(fitsPreferencesByteBudget(worst)).toBe(true);
    expect(JSON.stringify(worst).length).toBeLessThanOrEqual(
      DASHBOARD_PREFERENCES_MAX_BYTES,
    );
  });

  it("fitsPreferencesByteBudget rejects an oversize raw payload", () => {
    const oversize = {
      order: ["a".repeat(10_000)] as readonly string[],
      hidden: [] as readonly string[],
    };
    expect(fitsPreferencesByteBudget(oversize)).toBe(false);
  });
});
