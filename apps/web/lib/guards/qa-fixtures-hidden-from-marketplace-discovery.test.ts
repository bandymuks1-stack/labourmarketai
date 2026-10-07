import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isSyntheticViewer, excludeSyntheticFixtures } from "@/lib/qa/synthetic-fixture";

const WEB = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");

describe("QA fixtures never reach real people through marketplace discovery", () => {
  it("only a documented synthetic QA viewer counts as one", () => {
    expect(isSyntheticViewer({ app_metadata: { qa_synthetic: true } })).toBe(true);
    expect(isSyntheticViewer({ email: "qa.owner+multiw@labourmarket.ai" })).toBe(true);
    expect(isSyntheticViewer({ email: "ona@example.com" })).toBe(false);
    expect(isSyntheticViewer({ email: "qa.x@evil.com" })).toBe(false);
    expect(isSyntheticViewer(null)).toBe(false);
  });
  it("labelled rows are dropped for everyone else", () => {
    const rows = [{ t: "[QA-SYNTHETIC] Betono paslauga" }, { t: "Tinkavimas" }];
    expect(excludeSyntheticFixtures(rows, (r) => [r.t])).toEqual([{ t: "Tinkavimas" }]);
  });
  it("service and listing discovery both apply the shared rule", () => {
    const svc = read("lib/marketplace/service-requests.ts");
    expect(svc).toMatch(/hideQaMarked\(rows, ctx\.qaViewer/);
    expect(svc).toMatch(/isQaViewer\(user\)/);
    const lst = read("lib/marketplace/listings.ts");
    expect(lst).toMatch(/isQaViewer\(user\)/);
    expect(lst).toMatch(/hideQaMarked\(rows/);
  });
});
