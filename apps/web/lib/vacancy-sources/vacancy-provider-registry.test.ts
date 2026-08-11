import { describe, it, expect } from "vitest";
import {
  VACANCY_PROVIDERS,
  getVacancyEndpoint,
  getVacancyProvider,
  providerSupportsChannel,
  resolveProviderBounds,
  vacancyProvidersForCountry,
  type VacancyProviderDescriptorV1,
} from "./vacancy-provider-registry";
import { VACANCY_IMPORT_BOUNDS } from "./vacancy-contract";
import { INTELLIGENCE_SOURCE_PROFILES } from "@/lib/intelligence/source-governance";
import { getVacancyParser } from "./providers";

describe("registry shape — one entry is all a new country needs", () => {
  it("every provider has a governance row, a parser and at least one endpoint", () => {
    expect(VACANCY_PROVIDERS.length).toBeGreaterThan(0);
    for (const p of VACANCY_PROVIDERS) {
      const governance = INTELLIGENCE_SOURCE_PROFILES.find(
        (g) => g.key === p.governanceSourceKey,
      );
      expect(governance, `${p.key} has no governance row`).toBeTruthy();
      expect(getVacancyParser(p.key), `${p.key} has no parser`).toBeTypeOf(
        "function",
      );
      expect(p.endpoints.length).toBeGreaterThan(0);
      expect(p.countryIso).toMatch(/^[A-Z]{2}$/);
      expect(p.transformVersion.length).toBeGreaterThan(0);
    }
  });

  it("provider keys are unique and equal their governance key", () => {
    const keys = VACANCY_PROVIDERS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of VACANCY_PROVIDERS) {
      expect(p.governanceSourceKey).toBe(p.key);
    }
  });

  it("endpoints declare BARE HOSTNAMES — the pure layer holds no fetchable URL", () => {
    for (const p of VACANCY_PROVIDERS) {
      for (const e of p.endpoints) {
        expect(e.host, `${p.key}/${e.channel}`).not.toMatch(/:\/\//);
        expect(e.host).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
        expect(e.path.startsWith("/"), `${p.key}/${e.channel}`).toBe(true);
      }
    }
  });

  it("channels within one provider are unique", () => {
    for (const p of VACANCY_PROVIDERS) {
      const channels = p.endpoints.map((e) => e.channel);
      expect(new Set(channels).size).toBe(channels.length);
    }
  });
});

describe("Arbetsförmedlingen descriptor", () => {
  const se = getVacancyProvider("arbetsformedlingen")!;

  it("is registered for Sweden and writes Swedish", () => {
    expect(se.countryIso).toBe("SE");
    expect(se.sourceLanguage).toBe("sv");
    expect(vacancyProvidersForCountry("se").map((p) => p.key)).toEqual([
      "arbetsformedlingen",
    ]);
  });

  it("offers all three channels the spec asks for", () => {
    for (const channel of ["snapshot", "stream", "links"] as const) {
      expect(providerSupportsChannel(se, channel), channel).toBe(true);
    }
    expect(getVacancyEndpoint(se, "links")!.pagination).toBe("offset_limit");
  });

  it("the snapshot is a STREAMED, record-offset walk against the non-deprecated path", () => {
    // The live snapshot measured 389.94 MiB (37,014 ads, 2026-08-11) — 24×
    // the buffered transport cap, so it can only be read line by line. Three
    // facts make that work, and all three must hold together.
    const snapshot = getVacancyEndpoint(se, "snapshot")!;
    expect(snapshot.pagination).toBe("record_offset");
    expect(snapshot.bodyFormat).toBe("json_lines");
    // `/snapshot` is marked deprecated by the publisher's own swagger contract
    // and, decisively, ignores the jsonl Accept header — it answers one
    // newline-free array, which is unreadable at this size.
    expect(snapshot.path).toBe("/v2/snapshot");
  });

  it("every record-offset channel is streamed — the pairing is not optional", () => {
    // A record-offset walk over a buffered body would ask for the whole
    // 390 MiB in one request, which is the exact failure this replaced.
    for (const provider of VACANCY_PROVIDERS) {
      for (const endpoint of provider.endpoints) {
        if (endpoint.pagination !== "record_offset") continue;
        expect(
          endpoint.bodyFormat,
          `${provider.key}/${endpoint.channel}`,
        ).toBe("json_lines");
      }
    }
  });

  it("requires attribution and names it with an i18n code, not a string", () => {
    const governance = INTELLIGENCE_SOURCE_PROFILES.find(
      (g) => g.key === "arbetsformedlingen",
    )!;
    expect(governance.attributionRequired).toBe(true);
    expect(se.attributionCode).toMatch(/^[a-zA-Z]+(\.[a-zA-Z]+)+$/);
    expect(se.displayNameCode).toMatch(/^[a-zA-Z]+(\.[a-zA-Z]+)+$/);
  });

  it("records the PROVIDER's confirmation: CC0 terms, keyless, not a proposal", () => {
    const governance = INTELLIGENCE_SOURCE_PROFILES.find(
      (g) => g.key === "arbetsformedlingen",
    )!;
    expect(governance.legalStatus).toBe("confirmed");
    expect(governance.proposedOnly).toBe(false);
    // Keyless: no endpoint may ask for a secret we were told is not needed.
    for (const e of se.endpoints) {
      expect(e.requiresApiKey, e.channel).toBe(false);
    }
  });

  it("owner-activated 2026-08-09; still never a metric importer", () => {
    const governance = INTELLIGENCE_SOURCE_PROFILES.find(
      (g) => g.key === "arbetsformedlingen",
    )!;
    // docs/human-gates/arbetsformedlingen-activation-gate.md — approved.
    expect(governance.activation).toBe("on");
    // Vacancies are not metric observations: even active, this source may
    // never hold a metric import policy.
    expect(governance.importPolicy).toBeNull();
  });

  it("returns null for an unknown key rather than a default provider", () => {
    expect(getVacancyProvider("nowhere_employment_service")).toBeNull();
    expect(vacancyProvidersForCountry("XX")).toEqual([]);
  });
});

describe("bounds may only ever be TIGHTENED", () => {
  const base = getVacancyProvider("arbetsformedlingen")!;

  it("a descriptor with no overrides inherits the shared bounds", () => {
    expect(resolveProviderBounds(base)).toEqual(VACANCY_IMPORT_BOUNDS);
  });

  it("an override that tries to WIDEN a bound is clamped to the ceiling", () => {
    const greedy: VacancyProviderDescriptorV1 = {
      ...base,
      boundOverrides: {
        maxItemsPerPage: 10_000,
        maxAcceptedPerSession: 1_000_000,
        maxResponseBytes: Number.MAX_SAFE_INTEGER,
        requestTimeoutMs: 600_000,
      },
    };
    const resolved = resolveProviderBounds(greedy);
    expect(resolved.maxItemsPerPage).toBe(VACANCY_IMPORT_BOUNDS.maxItemsPerPage);
    expect(resolved.maxAcceptedPerSession).toBe(
      VACANCY_IMPORT_BOUNDS.maxAcceptedPerSession,
    );
    expect(resolved.maxResponseBytes).toBe(
      VACANCY_IMPORT_BOUNDS.maxResponseBytes,
    );
    expect(resolved.requestTimeoutMs).toBe(
      VACANCY_IMPORT_BOUNDS.requestTimeoutMs,
    );
  });

  it("an override that tightens a bound is honoured", () => {
    const careful: VacancyProviderDescriptorV1 = {
      ...base,
      boundOverrides: { maxItemsPerPage: 25, maxPagesPerSession: 2 },
    };
    const resolved = resolveProviderBounds(careful);
    expect(resolved.maxItemsPerPage).toBe(25);
    expect(resolved.maxPagesPerSession).toBe(2);
  });

  it("a zero, negative, fractional or non-numeric override cannot disable a bound", () => {
    const broken: VacancyProviderDescriptorV1 = {
      ...base,
      boundOverrides: {
        maxItemsPerPage: 0,
        maxPagesPerSession: -5,
        maxAcceptedPerSession: 10.9,
        requestTimeoutMs: Number.NaN,
      },
    };
    const resolved = resolveProviderBounds(broken);
    expect(resolved.maxItemsPerPage).toBe(1);
    expect(resolved.maxPagesPerSession).toBe(1);
    expect(resolved.maxAcceptedPerSession).toBe(10);
    // NaN is not a bound — fall back to the shared ceiling, never to NaN.
    expect(resolved.requestTimeoutMs).toBe(
      VACANCY_IMPORT_BOUNDS.requestTimeoutMs,
    );
  });
});
