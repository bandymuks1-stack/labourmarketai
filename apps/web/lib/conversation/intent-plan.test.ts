import { describe, expect, it } from "vitest";

import { INTENT_REGISTRY, type RoutedIntent } from "@/lib/conversation/intent-registry";
import { validatePlan } from "@/lib/conversation/intent-plan";

const ids = Object.keys(INTENT_REGISTRY) as RoutedIntent[];
const byAccess = (a: string) => ids.filter((i) => INTENT_REGISTRY[i].access === a);
const [r1, r2, r3] = byAccess("read");
const [w1, w2] = byAccess("write");
const [route1] = byAccess("route");
const S = "parodyk mano savaitę ir projektus, tada užregistruok darbą";

describe("validatePlan — an ordered plan inside the existing authority", () => {
  it("accepts 2–3 distinct reads, in order, with the person's own words as labels", () => {
    expect(validatePlan([{ intent: r1, words: "mano savaitę" }, { intent: r2, words: "projektus" }], S)).toEqual([
      { intent: r1, label: "mano savaitę" },
      { intent: r2, label: "projektus" },
    ]);
  });

  it("allows ONE write, and only as the last step (it opens the confirm card)", () => {
    expect(validatePlan([{ intent: r1 }, { intent: w1, words: "užregistruok darbą" }], S)?.[1]).toEqual({
      intent: w1,
      label: "užregistruok darbą",
    });
    expect(validatePlan([{ intent: w1 }, { intent: r1 }], S)).toBeNull();
    expect(validatePlan([{ intent: r1 }, { intent: w1 }, { intent: w2 }], S)).toBeNull();
  });

  it("refuses a navigating step, an unknown id, a duplicate, and the wrong length", () => {
    if (route1) expect(validatePlan([{ intent: r1 }, { intent: route1 }], S)).toBeNull();
    expect(validatePlan([{ intent: r1 }, { intent: "delete-everything" }], S)).toBeNull();
    expect(validatePlan([{ intent: r1 }, { intent: r1 }], S)).toBeNull();
    expect(validatePlan([{ intent: r1 }], S)).toBeNull();
    expect(validatePlan([{ intent: r1 }, { intent: r2 }, { intent: r3 }, { intent: r1 }], S)).toBeNull();
    expect(validatePlan("not a list", S)).toBeNull();
  });

  it("drops a label that is not in the person's sentence (no invented words)", () => {
    expect(validatePlan([{ intent: r1, words: "delete my account" }, { intent: r2 }], S)?.[0].label).toBeNull();
  });
});
