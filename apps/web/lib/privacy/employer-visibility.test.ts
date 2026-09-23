import { afterEach, describe, expect, it } from "vitest";

import {
  DISCOVERABILITY_CONSENT_SOURCES,
  EMPLOYER_VISIBILITY_HREF,
  VISIBILITY_ASK_KEY,
  discoverabilityConsentSourceOf,
  employerVisibilityOf,
  readVisibilityAskRecord,
  shouldAskEmployerVisibility,
  visibilityAskEnded,
  writeVisibilityAskRecord,
} from "./employer-visibility";

/**
 * "Matomas darbdaviams" — the pure reading every door shares, and the
 * one-time ask. The states here are the product's claims about a person's
 * own profile, so every branch is pinned, including the ones that must NOT
 * produce a claim.
 */

const ok = (status: "granted" | "withdrawn" | "granted_stale_version" | "not_set") =>
  ({ kind: "ok", status }) as const;

describe("employerVisibilityOf — three honest states (SEP-7: unknown ≠ off)", () => {
  it("a current-version grant is ON", () => {
    expect(employerVisibilityOf(ok("granted"))).toBe("on");
  });

  it("never decided, withdrawn, or granted under a superseded text is OFF (fail closed, like the RLS predicate)", () => {
    expect(employerVisibilityOf(ok("not_set"))).toBe("off");
    expect(employerVisibilityOf(ok("withdrawn"))).toBe("off");
    expect(employerVisibilityOf(ok("granted_stale_version"))).toBe("off");
  });

  it("a failed / unavailable / reader-less read is UNKNOWN — never OFF", () => {
    for (const kind of ["error", "needs-migration", "not-authed"] as const) {
      // The read helpers return status "not_set" alongside a non-ok kind;
      // that placeholder must never be read as a decision.
      expect(employerVisibilityOf({ kind, status: "not_set" }), kind).toBe("unknown");
    }
    expect(employerVisibilityOf(null)).toBe("unknown");
    expect(employerVisibilityOf(undefined)).toBe("unknown");
  });

  it("the door is the consent's canonical home", () => {
    expect(EMPLOYER_VISIBILITY_HREF).toBe("/dashboard/privacy#visibility");
  });
});

describe("shouldAskEmployerVisibility — ONE ask, after a save, never repeated", () => {
  it("asks exactly when a save just happened, nothing ended the ask, and the ledger was never decided", () => {
    expect(
      shouldAskEmployerVisibility({ justSaved: true, consent: ok("not_set"), askRecord: null }),
    ).toBe(true);
  });

  it("never asks without a save", () => {
    expect(
      shouldAskEmployerVisibility({ justSaved: false, consent: ok("not_set"), askRecord: null }),
    ).toBe(false);
  });

  it("never repeats once this device ended it (opened the consent, or 'not now')", () => {
    for (const record of ["opened", "dismissed"]) {
      expect(
        shouldAskEmployerVisibility({ justSaved: true, consent: ok("not_set"), askRecord: record }),
        record,
      ).toBe(false);
    }
  });

  it("a stray value in storage is not an answer (negative control)", () => {
    expect(visibilityAskEnded("yes")).toBe(false);
    expect(visibilityAskEnded("")).toBe(false);
    expect(
      shouldAskEmployerVisibility({ justSaved: true, consent: ok("not_set"), askRecord: "yes" }),
    ).toBe(true);
  });

  it("never asks once the LEDGER holds any decision — on every device", () => {
    for (const status of ["granted", "withdrawn", "granted_stale_version"] as const) {
      expect(
        shouldAskEmployerVisibility({ justSaved: true, consent: ok(status), askRecord: null }),
        status,
      ).toBe(false);
    }
  });

  it("never asks on an unknown state — a question built on a failed read", () => {
    expect(
      shouldAskEmployerVisibility({
        justSaved: true,
        consent: { kind: "error", status: "not_set" },
        askRecord: null,
      }),
    ).toBe(false);
    expect(
      shouldAskEmployerVisibility({ justSaved: true, consent: null, askRecord: null }),
    ).toBe(false);
  });
});

describe("the device-local ask record — one key, one of two values", () => {
  const g = globalThis as { window?: unknown };
  const original = g.window;
  afterEach(() => {
    g.window = original;
  });

  it("round-trips through localStorage under the versioned key", () => {
    const store = new Map<string, string>();
    g.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    };
    expect(readVisibilityAskRecord()).toBeNull();
    writeVisibilityAskRecord("dismissed");
    expect(store.get(VISIBILITY_ASK_KEY)).toBe("dismissed");
    expect(readVisibilityAskRecord()).toBe("dismissed");
    expect(VISIBILITY_ASK_KEY).toBe("lm.employerVisibilityAsk.v1");
  });

  it("an unavailable storage never throws (private mode, blocked)", () => {
    g.window = {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    };
    expect(readVisibilityAskRecord()).toBeNull();
    expect(() => writeVisibilityAskRecord("opened")).not.toThrow();
  });
});

describe("consent provenance — the ledger's source is a closed set", () => {
  it("the conversation records itself; anything else records the canonical screen", () => {
    expect(DISCOVERABILITY_CONSENT_SOURCES).toEqual(["dashboard_privacy_screen", "conversation"]);
    expect(discoverabilityConsentSourceOf("conversation")).toBe("conversation");
    expect(discoverabilityConsentSourceOf("dashboard_privacy_screen")).toBe(
      "dashboard_privacy_screen",
    );
    // Negative controls: a client cannot write an arbitrary provenance.
    for (const raw of [undefined, null, "", "admin_console", 42, "CONVERSATION"]) {
      expect(discoverabilityConsentSourceOf(raw), String(raw)).toBe("dashboard_privacy_screen");
    }
  });
});
