import { describe, expect, it } from "vitest";

import { classifyIntent } from "./intent-router";

/**
 * Dutch and German invite verbs SPLIT around the person in the imperative:
 * "Nodig Mateusz uit…", "Lade Anna … ein". Measured in a browser walk
 * (2026-10-11): "Nodig Mateusz uit in ons team als lasser: <e-mail>" opened a
 * staffing-NEED form, because "nodig" alone also means "needed".
 */
describe("separable NL/DE invite verbs route to the invitation", () => {
  it.each([
    "Nodig Mateusz uit in ons team als lasser: mateusz.kowalski@example.test",
    "Nodig Piet uit",
    "Lade Anna ins Team ein",
    "Lade unseren neuen Schweißer ein: anna@example.test",
    "Kun je Mateusz uitnodigen in ons team?",
  ])("%s", (text) => {
    expect(classifyIntent(text).intent).toBe("invite-candidate");
  });

  it.each([
    "We hebben 3 lassers nodig in Rotterdam vanaf 2 november",
    "We hebben 3 lassers nodig uit Polen",
    "We hebben dringend mensen nodig in ons team",
  ])("a need stays a need: %s", (text) => {
    expect(classifyIntent(text).intent).not.toBe("invite-candidate");
  });
});

describe("'what should I do next?' in Russian and Polish", () => {
  it.each(["Что мне делать дальше?", "Что мне теперь делать?", "Что делать дальше?", "Co mam teraz zrobić?", "Co mam robić dalej?"])(
    "%s",
    (text) => {
      expect(classifyIntent(text).intent).toBe("next-action");
    },
  );
  it("'Co mogę tu zrobić?' stays the capabilities question", () => {
    expect(classifyIntent("Co mogę tu zrobić?").intent).toBe("capabilities");
  });
});
