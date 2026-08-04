import { describe, it, expect } from "vitest";
import {
  GLOBAL_KILL_ENV_NAME,
  evaluateVacancySwitch,
  providerEnabledEnvName,
  providerEnvSuffix,
  providerKillEnvName,
} from "./vacancy-kill-switch";

const KEY = "arbetsformedlingen";
const ENABLED = providerEnabledEnvName(KEY);
const KILL = providerKillEnvName(KEY);

describe("env names", () => {
  it("derives legal env names from a provider key", () => {
    expect(providerEnvSuffix("arbetsformedlingen")).toBe("ARBETSFORMEDLINGEN");
    expect(ENABLED).toBe("VACANCY_SOURCE_ARBETSFORMEDLINGEN_ENABLED");
    expect(KILL).toBe("VACANCY_SOURCE_ARBETSFORMEDLINGEN_KILL_SWITCH");
  });

  it("sanitizes a hyphenated future key into a legal env name", () => {
    expect(providerEnvSuffix("nav-no")).toBe("NAV_NO");
    expect(providerEnabledEnvName("nav-no")).toBe(
      "VACANCY_SOURCE_NAV_NO_ENABLED",
    );
  });
});

describe("fail-closed by default", () => {
  it("an EMPTY environment is NOT operational — deploying is not switching on", () => {
    const state = evaluateVacancySwitch(KEY, {});
    expect(state.operational).toBe(false);
    expect(state.blockedReason).toBe("provider_disabled");
  });

  it("an unrelated value is not 'on'", () => {
    for (const value of ["off", "0", "false", "yes", "ON ", ""]) {
      expect(
        evaluateVacancySwitch(KEY, { [ENABLED]: value }).operational,
        value,
      ).toBe(false);
    }
  });

  it("accepts the three canonical truthy spellings", () => {
    for (const value of ["1", "true", "on"]) {
      expect(
        evaluateVacancySwitch(KEY, { [ENABLED]: value }).operational,
        value,
      ).toBe(true);
    }
  });
});

describe("kill precedence — a kill always wins over an enable", () => {
  it("the global kill stops an enabled provider", () => {
    const state = evaluateVacancySwitch(KEY, {
      [ENABLED]: "on",
      [GLOBAL_KILL_ENV_NAME]: "on",
    });
    expect(state.operational).toBe(false);
    expect(state.blockedReason).toBe("global_kill_switch_engaged");
  });

  it("the per-provider kill stops that provider only", () => {
    const env = { [ENABLED]: "on", [KILL]: "on" };
    expect(evaluateVacancySwitch(KEY, env).blockedReason).toBe(
      "provider_kill_switch_engaged",
    );
    // A different provider in the same environment is unaffected.
    const other = evaluateVacancySwitch("nav-no", {
      ...env,
      VACANCY_SOURCE_NAV_NO_ENABLED: "on",
    });
    expect(other.operational).toBe(true);
  });

  it("the global kill outranks the per-provider kill in the reported reason", () => {
    const state = evaluateVacancySwitch(KEY, {
      [ENABLED]: "on",
      [KILL]: "on",
      [GLOBAL_KILL_ENV_NAME]: "on",
    });
    expect(state.blockedReason).toBe("global_kill_switch_engaged");
  });

  it("a kill on a DISABLED provider still reports the kill, not the disable", () => {
    expect(
      evaluateVacancySwitch(KEY, { [GLOBAL_KILL_ENV_NAME]: "on" })
        .blockedReason,
    ).toBe("global_kill_switch_engaged");
  });
});

describe("state is fully reported, never just a boolean", () => {
  it("exposes each gate independently so an operator can see WHY", () => {
    const state = evaluateVacancySwitch(KEY, {
      [ENABLED]: "on",
      [KILL]: "on",
    });
    expect(state).toMatchObject({
      providerKey: KEY,
      operational: false,
      globalKillEngaged: false,
      providerKillEngaged: true,
      providerEnabled: true,
    });
  });
});
