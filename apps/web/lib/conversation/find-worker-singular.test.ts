import { describe, expect, it } from "vitest";

import { classifyIntent } from "./intent-router";

describe("finding a worker is scouting, not the demand form", () => {
  it.each(["Rask darbuotoją", "Rask darbuotojų", "Noriu rasti darbuotoją", "Surask darbuotoją"])(
    "%s -> find-workers",
    (sentence) => {
      expect(classifyIntent(sentence).intent).toBe("find-workers");
    },
  );

  it.each([
    ["Rask man darbą", "find-work"],
    ["Rask partnerius", "find-partners"],
    ["Reikia 5 darbuotojų", "need-workers"],
  ])("%s keeps %s", (sentence, intent) => {
    expect(classifyIntent(sentence).intent).toBe(intent);
  });
});
