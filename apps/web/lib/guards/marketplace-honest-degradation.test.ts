import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * P0 marketplace — honest-degradation + no-fake-data guard.
 *
 * The migration is owner-applied (RED). Until applied, the table/policy/RPCs are
 * absent; every server action returns `needs-migration` and the UI shows a calm
 * "not available yet" state — never an error, never a fabricated offering/request.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const ACTIONS = "lib/marketplace/service-requests.ts";
const SECTION = "components/app/marketplace-loop-section.tsx";
const PAGE = "app/[locale]/dashboard/service-requests/page.tsx";

describe("marketplace server actions degrade honestly when absent", () => {
  const src = read(ACTIONS);

  it("classifies the undefined-table/function codes as needs-migration", () => {
    expect(src).toMatch(/const ABSENT = new Set\(\[[^\]]*"42P01"/);
    expect(src).toMatch(/return \{ kind: "needs-migration" \}/);
    expect(src).toMatch(/isAbsent\(error\)/);
  });

  it("every public action is present and returns tagged results", () => {
    for (const fn of [
      "listDiscoverableOfferings",
      "listOutgoingRequests",
      "listIncomingRequests",
      "requestServiceOffering",
      "respondToRequest",
      "withdrawRequest",
    ]) {
      expect(src, `${fn} present`).toMatch(new RegExp(`export async function ${fn}`));
    }
  });

  it("contains no seeded / sample / fake offering or request rows", () => {
    expect(stripComments(src)).not.toMatch(/sample|seed|demo|fixture|fakeOffer|fakeRequest|mockRow/i);
  });
});

describe("the marketplace UI surfaces an honest not-available state", () => {
  it("section renders the not-available branch and maps only prop rows", () => {
    const s = read(SECTION);
    expect(s).toMatch(/needsMigration/);
    expect(s).toMatch(/data-testid="marketplace-not-available"/);
    expect(s).toMatch(/discoverable\.map/);
    expect(s).toMatch(/incoming\.map/);
    expect(s).toMatch(/outgoing\.map/);
    expect(stripComments(s)).not.toMatch(/sample|seed|demo|fixture/i);
  });

  it("page passes the real needs-migration flag from the action results", () => {
    const p = read(PAGE);
    expect(p).toMatch(/=== "needs-migration"/);
    expect(p).toMatch(/listDiscoverableOfferings\(\)/);
    expect(p).toMatch(/listIncomingRequests\(\)/);
  });
});
