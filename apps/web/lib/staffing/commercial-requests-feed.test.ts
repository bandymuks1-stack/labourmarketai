import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { commercialRequestType, toFeedItem } from "./commercial-requests-feed";

/** Synthetic rows only. */
const row = (contact_email: string | null) =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    created_at: "2026-11-09T10:00:00+00:00",
    status: "new",
    source_path: "/en/company-need",
    company_name: "Synthetic Co",
    contact_name: null,
    contact_email,
    description: "Two tilers.",
  }) as Parameters<typeof toFeedItem>[0];

describe("a walk's contact is labelled synthetic in the commercial feed", () => {
  it.each([
    ["run-1@e2e-proof.local", true],
    ["RUN@E2E-PROOF.LOCAL", true],
    ["walk@example.invalid", true],
    ["buyer@firma.lt", false],
    ["someone@e2e-proof.local.example.com", false],
    [null, false],
  ])("%s → synthetic %s", (email, synthetic) => {
    expect(toFeedItem(row(email)).synthetic).toBe(synthetic);
  });
});

describe("a send marked for review is still a company-need request", () => {
  it.each([
    ["/en/company-need", "company-need"],
    ["/lt/company-need?review=no-js", "company-need"],
    ["/lt/company-need?other=1", "other"],
    ["/de/company-need?from=companies_market_lu", "company-need"],
    ["/de/company-need?review=no-js&from=companies_hero", "company-need"],
    ["/de/company-need?from=Bad-Id", "other"],
  ])("%s → %s", (path, type) => {
    expect(commercialRequestType(path)).toBe(type);
  });
});
