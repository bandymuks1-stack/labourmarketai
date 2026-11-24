import { describe, it, expect } from "vitest";

import { evaluateEurostatSwitch } from "./eurostat-kill-switch";

describe("Eurostat kill switch (fail-closed dual flag)", () => {
  it("is NON-operational by default (source disabled) — dormant after deploy", () => {
    const s = evaluateEurostatSwitch({});
    expect(s.operational).toBe(false);
    expect(s.blockedReason).toBe("source_disabled");
  });

  it("is operational only when explicitly enabled AND not killed", () => {
    const s = evaluateEurostatSwitch({ EUROSTAT_SOURCE_ENABLED: "on" });
    expect(s.operational).toBe(true);
    expect(s.blockedReason).toBeNull();
  });

  it("the kill switch OUTRANKS the enable flag", () => {
    const s = evaluateEurostatSwitch({
      EUROSTAT_SOURCE_ENABLED: "on",
      EUROSTAT_KILL_SWITCH: "on",
    });
    expect(s.operational).toBe(false);
    expect(s.blockedReason).toBe("kill_switch_engaged");
    expect(s.killEngaged).toBe(true);
  });

  it("only exact truthy tokens enable — anything else stays off", () => {
    for (const v of ["", "0", "false", "yes", "OFF", "enabled"]) {
      expect(evaluateEurostatSwitch({ EUROSTAT_SOURCE_ENABLED: v }).operational, v).toBe(false);
    }
    for (const v of ["1", "true", "on"]) {
      expect(evaluateEurostatSwitch({ EUROSTAT_SOURCE_ENABLED: v }).operational, v).toBe(true);
    }
  });
});
