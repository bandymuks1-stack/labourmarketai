import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W8 service_offerings — honest-degradation + no-fake-data guard.
 *
 * The migration is owner-applied (RED). Until it is applied the table is absent;
 * every server action must degrade to `needs-migration` and the UI must show a
 * calm "not available yet" state — never an error, never a fabricated offering.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** Strip comments so honest "no seed/demo rows" notes don't trip the no-fake
 *  scan — what we forbid is fabricated data in CODE, not documentation of its
 *  absence. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const ACTIONS = "lib/services/service-offerings.ts";
const SECTION = "components/app/service-offerings-section.tsx";
const PAGE = "app/[locale]/dashboard/services/page.tsx";

describe("server actions degrade honestly when the table is absent", () => {
  const src = read(ACTIONS);

  it("classifies the undefined-table codes as needs-migration", () => {
    expect(src).toMatch(/const ABSENT = new Set\(\[[^\]]*"42P01"/);
    expect(src).toMatch(/return \{ kind: "needs-migration" \}/);
  });

  it("every mutating action returns needs-migration on an absent table", () => {
    for (const fn of [
      "listOwnServiceOfferings",
      "createServiceOffering",
      "updateServiceOffering",
      "setServiceOfferingStatus",
      "deleteServiceOffering",
    ]) {
      expect(src, `${fn} present`).toMatch(new RegExp(`export async function ${fn}`));
    }
    // The guard helper is used to branch to needs-migration.
    expect(src).toMatch(/isAbsent\(error\)/);
  });

  it("pins provider_id to the caller on insert (no cross-owner write)", () => {
    expect(src).toMatch(/provider_id: user\.id/);
  });

  it("contains no seeded / sample / fake offering rows", () => {
    expect(stripComments(src)).not.toMatch(/sample|seed|demo|fixture|fakeOffering|mockRow/i);
  });
});

describe("the UI surfaces an honest not-available state, never a fake offering", () => {
  it("section renders the not-available branch off the needsMigration flag", () => {
    const s = read(SECTION);
    expect(s).toMatch(/needsMigration \?/);
    expect(s).toMatch(/data-testid="service-offerings-not-available"/);
    // Rows come only from props (real RLS-scoped data), never hardcoded.
    expect(s).toMatch(/initialRows\.map/);
    expect(stripComments(s)).not.toMatch(/sample|seed|demo|fixture/i);
  });

  it("page passes the real needs-migration flag from the action result", () => {
    const p = read(PAGE);
    expect(p).toMatch(/result\.kind === "needs-migration"/);
    expect(p).toMatch(/listOwnServiceOfferings\(\)/);
  });
});
