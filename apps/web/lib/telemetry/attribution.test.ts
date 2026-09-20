import { afterEach, describe, expect, it } from "vitest";

import {
  captureFirstTouchAttribution,
  getFirstTouchAttribution,
} from "@/lib/telemetry/attribution";

/**
 * First-touch attribution — the BEHAVIOUR the funnel depends on.
 *
 * The campaign → job → registration handoff is only measurable if the same
 * first-touch block rides on every step of a session. Two properties make
 * that safe to do from inside a mount effect on the public job page:
 *
 *   1. reading it NEVER throws — a blocked, full or corrupt localStorage
 *      yields `{}`, so a storage failure cannot suppress a funnel event;
 *   2. the original campaign is never overwritten by a later visit.
 *
 * Run under vitest's `node` environment, so `window` is installed here
 * explicitly rather than inherited from a DOM — which is also what makes the
 * failure modes (a throwing accessor, unparseable JSON) directly expressible.
 */

type Store = {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
};

const KEY = "lm.attr.first";

function installWindow(store: Store, search = "", referrer = "") {
  (globalThis as { window?: unknown }).window = {
    localStorage: store,
    location: { search, pathname: "/lt/jobs/abc", host: "labourmarket.test" },
  };
  (globalThis as { document?: unknown }).document = { referrer };
}

function memoryStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
});

describe("getFirstTouchAttribution never throws — a storage failure is {}", () => {
  it("returns {} when localStorage.getItem throws (blocked / partitioned storage)", () => {
    installWindow({
      getItem: () => {
        throw new Error("SecurityError: storage is blocked");
      },
      setItem: () => {},
    });
    expect(getFirstTouchAttribution()).toEqual({});
  });

  it("returns {} when the stored value is not parseable JSON", () => {
    installWindow(memoryStore({ [KEY]: "{not json" }));
    expect(getFirstTouchAttribution()).toEqual({});
  });

  it("returns {} when the stored value is an array, not an object", () => {
    installWindow(memoryStore({ [KEY]: "[1,2,3]" }));
    expect(getFirstTouchAttribution()).toEqual({});
  });

  it("returns {} on the server (no window at all)", () => {
    expect(getFirstTouchAttribution()).toEqual({});
  });

  it("returns the stored block when one exists", () => {
    installWindow(
      memoryStore({
        [KEY]: JSON.stringify({
          utm_campaign: "welder-wave-1",
          utm_content: "pl",
        }),
      }),
    );
    expect(getFirstTouchAttribution()).toEqual({
      utm_campaign: "welder-wave-1",
      utm_content: "pl",
    });
  });
});

describe("capture is idempotent — the ORIGINAL campaign wins", () => {
  it("does not overwrite an existing first touch with a later one", () => {
    const store = memoryStore({
      [KEY]: JSON.stringify({ utm_campaign: "first", utm_content: "pl" }),
    });
    installWindow(store, "?utm_campaign=second&utm_content=ru");
    expect(captureFirstTouchAttribution()).toEqual({
      utm_campaign: "first",
      utm_content: "pl",
    });
    expect(JSON.parse(store.map.get(KEY)!)).toMatchObject({
      utm_campaign: "first",
    });
  });

  it("stores nothing for an untagged organic landing (no utm, no referrer)", () => {
    const store = memoryStore();
    installWindow(store, "");
    expect(captureFirstTouchAttribution()).toBeNull();
    expect(store.map.has(KEY)).toBe(false);
    expect(getFirstTouchAttribution()).toEqual({});
  });

  it("a write failure is survivable — the block is still returned to the caller", () => {
    installWindow(
      {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
      "?utm_campaign=welder-wave-1&utm_content=uk",
    );
    expect(captureFirstTouchAttribution()).toMatchObject({
      utm_campaign: "welder-wave-1",
      utm_content: "uk",
    });
  });
});

describe("the merge contract the emitting surfaces rely on", () => {
  it("explicit metadata wins over a stored first-touch value of the same key", () => {
    installWindow(
      memoryStore({
        [KEY]: JSON.stringify({ utm_campaign: "stored", landing_path: "/lt" }),
      }),
    );
    // This is the exact spread order every emitting surface uses:
    // attribution UNDER the caller's own keys.
    const merged = {
      ...getFirstTouchAttribution(),
      landing_path: "/explicit",
    };
    expect(merged.landing_path).toBe("/explicit");
    expect(merged.utm_campaign).toBe("stored");
  });
});
