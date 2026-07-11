import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  booleanToTriState,
  clampNote,
  classifyPrefsError,
  CONTRACT_TYPES,
  NOTE_MAX_LENGTH,
  parseContractType,
  parseMaxTripDays,
  triStateToBoolean,
} from "../worker/availability-prefs-model";

/**
 * Structured work preferences honesty guard (PR 3 — wires the 8
 * applied-but-orphaned availability-pref columns from migration
 * 20260613100000 into a worker-facing form).
 *
 * Pins:
 *   (a) tri-state honesty — null / "not stated" is NEVER collapsed to false;
 *   (b) DB-error classification — missing function/column/table surfaces as
 *       needs_migration, not a generic error;
 *   (c) the contract-type vocabulary matches the migration CHECK exactly;
 *   (d) the free-text note is trimmed and clamped to the 2000-char CHECK.
 */

const root = join(__dirname, "..", "..");
const repo = join(root, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const mig = readFileSync(
  join(repo, "supabase", "migrations", "20260613100000_worker_availability_preferences.sql"),
  "utf8",
);

describe("(a) tri-state honesty — an unset pref is never a fabricated 'no'", () => {
  it("null / undefined map to 'not_stated', never 'no'", () => {
    expect(booleanToTriState(null)).toBe("not_stated");
    expect(booleanToTriState(undefined)).toBe("not_stated");
    expect(booleanToTriState(true)).toBe("yes");
    expect(booleanToTriState(false)).toBe("no");
  });
  it("only an explicit yes/no becomes a boolean; everything else stays null", () => {
    expect(triStateToBoolean("yes")).toBe(true);
    expect(triStateToBoolean("no")).toBe(false);
    expect(triStateToBoolean("not_stated")).toBeNull();
    expect(triStateToBoolean("")).toBeNull();
    expect(triStateToBoolean(null)).toBeNull();
    expect(triStateToBoolean(undefined)).toBeNull();
    expect(triStateToBoolean("garbage")).toBeNull();
    // The forbidden fabrication: null must NOT round-trip into false.
    expect(triStateToBoolean(booleanToTriState(null))).toBeNull();
  });
  it("the form renders all three options as real choices (segmented control)", () => {
    const form = read("components/app/worker-availability-prefs-form.tsx");
    expect(form).toMatch(/TRI_STATE_VALUES\.map/);
    expect(form).toMatch(/role="radiogroup"/);
    // The "" listbox option for contract type is the not-stated choice.
    expect(form).toMatch(/value: "",\s*label: labels\.triState\.not_stated/);
  });
});

describe("(b) DB-error classification — missing migration is surfaced honestly", () => {
  it("42703 / 42P01 / 42883 / PGRST202 → needs_migration", () => {
    for (const code of ["42703", "42P01", "42883", "PGRST202"]) {
      expect(classifyPrefsError(code)).toBe("needs_migration");
    }
  });
  it("42501 → unauthenticated, P0002 → no_worker, unknown → error", () => {
    expect(classifyPrefsError("42501")).toBe("unauthenticated");
    expect(classifyPrefsError("P0002")).toBe("no_worker");
    expect(classifyPrefsError("XX000")).toBe("error");
    expect(classifyPrefsError(undefined)).toBe("error");
  });
  it("the action writes ONLY via the owner-scoped RPC (no direct table update)", () => {
    const action = read("lib/worker/availability-prefs-actions.ts");
    expect(action).toMatch(/rpc\("save_worker_availability_prefs"/);
    expect(action).not.toMatch(/\.from\(["']workers["']\)[\s\S]*?\.update\(/);
  });
});

describe("(c) contract-type vocabulary matches the migration CHECK exactly", () => {
  it("model set = ('employment','subcontract','temporary','any')", () => {
    expect([...CONTRACT_TYPES]).toEqual([
      "employment",
      "subcontract",
      "temporary",
      "any",
    ]);
  });
  it("every model value appears in the migration CHECK, and vice versa", () => {
    const checkMatch = mig.match(
      /preferred_contract_type is null or preferred_contract_type in\s*\(([^)]+)\)/,
    );
    expect(checkMatch).not.toBeNull();
    const migValues = [...checkMatch![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect([...migValues].sort()).toEqual([...CONTRACT_TYPES].sort());
  });
  it("values outside the closed set are rejected to null, never coerced", () => {
    expect(parseContractType("employment")).toBe("employment");
    expect(parseContractType(" any ")).toBe("any");
    expect(parseContractType("")).toBeNull();
    expect(parseContractType("freelance")).toBeNull();
    expect(parseContractType(undefined)).toBeNull();
  });
});

describe("(d) note + trip-days respect the migration CHECK bounds", () => {
  it("note is trimmed, clamped to 2000, empty → null", () => {
    expect(NOTE_MAX_LENGTH).toBe(2000);
    expect(clampNote("  hello  ")).toBe("hello");
    expect(clampNote("")).toBeNull();
    expect(clampNote("   ")).toBeNull();
    expect(clampNote(undefined)).toBeNull();
    const long = "x".repeat(2500);
    expect(clampNote(long)).toHaveLength(2000);
  });
  it("max trip days: empty → null; 1..3650 valid; out-of-range/garbage is INVALID (not silently null)", () => {
    expect(parseMaxTripDays("")).toEqual({ ok: true, value: null });
    expect(parseMaxTripDays("1")).toEqual({ ok: true, value: 1 });
    expect(parseMaxTripDays("3650")).toEqual({ ok: true, value: 3650 });
    expect(parseMaxTripDays("0")).toEqual({ ok: false });
    expect(parseMaxTripDays("3651")).toEqual({ ok: false });
    expect(parseMaxTripDays("-5")).toEqual({ ok: false });
    expect(parseMaxTripDays("abc")).toEqual({ ok: false });
    expect(parseMaxTripDays("2.5")).toEqual({ ok: false });
  });
});

describe("mounted on the canonical profile surface (no new route)", () => {
  it("the profile page renders the form, worker-gated", () => {
    const page = read("app/[locale]/dashboard/profile/page.tsx");
    expect(page).toMatch(/<WorkerAvailabilityPrefsForm\b/);
    expect(page).toMatch(/workerId && availabilityPrefs/);
  });
  it("LT + EN copy exists with the not-stated option", () => {
    const lt = JSON.parse(read("messages/lt.json"));
    const en = JSON.parse(read("messages/en.json"));
    expect(lt.workerPrefs.triState.notStated).toBeTruthy();
    expect(en.workerPrefs.triState.notStated).toBeTruthy();
    for (const v of CONTRACT_TYPES) {
      expect(lt.workerPrefs.contract[v]).toBeTruthy();
      expect(en.workerPrefs.contract[v]).toBeTruthy();
    }
  });
});
