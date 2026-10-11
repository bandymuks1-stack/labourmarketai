import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/telemetry/server-locale", () => ({ serverEventLocale: async () => "nl" }));

import { acceptedDemandLanguage, demandWrittenLanguage } from "./demand-written-language";

describe("a need records the language it was written in", () => {
  it("keeps every locale the column accepts", () => {
    for (const l of ["en", "lt", "ru", "nl", "de", "pl", "uk"]) expect(acceptedDemandLanguage(l)).toBe(l);
  });

  it("falls back to the column default only when the locale is unknown", () => {
    expect(acceptedDemandLanguage("unknown")).toBe("lt");
    expect(acceptedDemandLanguage(null)).toBe("lt");
  });

  it("reads the request locale (the walked Dutch need was stored as 'lt')", async () => {
    expect(await demandWrittenLanguage()).toBe("nl");
  });
});
