import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  commercialRequestType,
  decodeFeedCursor,
  feedPage,
  isSyntheticCommercialRequest,
  toFeedItem,
} from "./commercial-requests-feed";

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

/**
 * Owner decision 2026-11-14 (PR #3303 need-intake walk): our test requests never leave
 * the feed. These run in the `unit` project (lib/**), so CI executes them; the route's
 * own test file under app/ is outside the vitest include and does not run in CI.
 */
type Row = Parameters<typeof feedPage>[0][number];
const at = (i: number) => `2026-11-14T10:00:0${i}.000000+00:00`;
const mk = (i: number, over: Partial<Row> = {}): Row =>
  ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    created_at: at(i),
    status: "new",
    source_path: "/en/company-need",
    company_name: `Real Builder ${i} UAB`,
    contact_name: "Jonas",
    contact_email: `jonas${i}@statyba.lt`,
    description: "Need two tilers in Kaunas.",
    ...over,
  }) as Row;
const walkRow = (i: number) =>
  mk(i, {
    company_name: `QA-SYNTHETIC need walk ${i}.1 (not a real company)`,
    contact_email: `qa.synthetic.need.${i}.1@example.invalid`,
    description: "QA-SYNTHETIC need-intake walk",
  });

describe("our test requests never leave the commercial feed (owner 2026-11-14)", () => {
  it("drops the walk-shaped row, also once it is rejected", () => {
    expect(feedPage([walkRow(1)], 10).items).toEqual([]);
    expect(feedPage([{ ...walkRow(1), status: "rejected" }], 10).items).toEqual([]);
  });

  it("drops a row with only the marker, and a row with only a test mailbox", () => {
    expect(isSyntheticCommercialRequest(mk(1, { description: "[QA-SYNTHETIC] probe" }))).toBe(true);
    expect(isSyntheticCommercialRequest(mk(2, { contact_email: "x@example.invalid" }))).toBe(true);
    expect(isSyntheticCommercialRequest(mk(3, { contact_email: "x@e2e-proof.local" }))).toBe(true);
    expect(feedPage([mk(1, { description: "[QA-SYNTHETIC] probe" }), mk(2, { contact_email: "x@example.invalid" })], 10).items).toEqual([]);
  });

  it("passes real employer requests unchanged, including names that merely contain 'test'", () => {
    const real = [mk(1), mk(2, { company_name: "Test Building Ltd", contact_email: "jonas@testas.lt" })];
    const page = feedPage(real, 10);
    expect(page.items).toEqual(real.map(toFeedItem));
    expect(page.items.every((i) => i.synthetic === false)).toBe(true);
    expect(page.nextCursor).toBeNull();
  });

  it("the cursor moves past a dropped row: the real row after it is neither skipped nor repeated", () => {
    // limit 2, rows read = limit + 1: [real1, walk2, real3] -> page [real1, walk2], cursor at walk2.
    const first = feedPage([mk(1), walkRow(2), mk(3)], 2);
    expect(first.items.map((i) => i.id)).toEqual([mk(1).id]);
    expect(decodeFeedCursor(first.nextCursor!)).toEqual({ createdAt: at(2), id: walkRow(2).id });
    // The next read starts strictly after walk2 and returns real3.
    const second = feedPage([mk(3)], 2);
    expect(second.items.map((i) => i.id)).toEqual([mk(3).id]);
  });

  it("a page holding only test rows still returns the next cursor", () => {
    const page = feedPage([walkRow(1), walkRow(2), mk(3)], 2);
    expect(page.items).toEqual([]);
    expect(decodeFeedCursor(page.nextCursor!)).toEqual({ createdAt: at(2), id: walkRow(2).id });
  });
});
