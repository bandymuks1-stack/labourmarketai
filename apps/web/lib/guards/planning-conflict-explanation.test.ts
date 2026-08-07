import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  detectConflicts,
  hiddenConflictSources,
  planningMeta,
  visibleConflictPartners,
  type PlanningItem,
} from "@/lib/planning/planning-model";

/**
 * Guard for W12 item C — a conflict explains itself.
 *
 * THE DEFECT. A conflicted row rendered a bare red badge ("Dates overlap")
 * with no counterpart named. The page already held the answer — `detectConflicts`
 * returns the PAIR and the first shared day — and it already named the
 * counterpart when a filter had HIDDEN it. So the reader learned strictly LESS
 * when the partner was on screen than when it was filtered away, and had to
 * open every row on the day to find the collision themselves.
 *
 * THE RULE. If the page flags a conflict, it says what the conflict is with.
 *
 * NO NEW DISCLOSURE. Two independent reasons, either sufficient: every partner
 * is the caller's OWN dated commitment (`isConflictEligible`), and a partner
 * named here is by definition in `visibleItems` — a row the same page is
 * already rendering with that same label and those same dates.
 */

const APP = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(APP, rel), "utf8");

function bookingAccepted(over: Partial<PlanningItem> = {}): PlanningItem {
  return {
    id: "booking:b1",
    sourceType: "booking",
    sourceId: "b1",
    label: "Acme site",
    detail: null,
    startDate: "2026-08-03",
    endDate: "2026-08-07",
    status: "accepted",
    statusKey: "bookings.status.accepted",
    href: "/dashboard/bookings",
    roleContext: "incoming",
    ...planningMeta(),
    ...over,
  };
}

function approvedAbsence(over: Partial<PlanningItem> = {}): PlanningItem {
  return {
    id: "absence:a1",
    sourceType: "absence",
    sourceId: "a1",
    label: "Vacation",
    detail: null,
    startDate: "2026-08-05",
    endDate: "2026-08-09",
    status: "approved",
    statusKey: "leave.status.approved",
    href: "/dashboard/leave",
    // What the real mapper assigns to an absence (planning-model.ts).
    roleContext: "mine",
    ...planningMeta(),
    ...over,
  };
}

describe("a visible conflict names its counterpart", () => {
  const a = bookingAccepted();
  const b = approvedAbsence();
  const all = [a, b];
  const conflicts = detectConflicts(all);

  it("the fixture really does conflict (otherwise everything below is vacuous)", () => {
    expect(conflicts).toHaveLength(1);
  });

  it("each side names the other, with the first shared day", () => {
    const m = visibleConflictPartners(conflicts, all, all);
    expect(m.get("booking:b1")).toEqual([
      { id: "absence:a1", sourceType: "absence", label: "Vacation", overlapStart: "2026-08-05" },
    ]);
    expect(m.get("absence:a1")).toEqual([
      { id: "booking:b1", sourceType: "booking", label: "Acme site", overlapStart: "2026-08-05" },
    ]);
  });

  it("a null label is carried through as null — the page renders its own fallback noun, never invented copy", () => {
    const unnamed = approvedAbsence({ label: null });
    const items = [a, unnamed];
    const m = visibleConflictPartners(detectConflicts(items), items, items);
    expect(m.get("booking:b1")?.[0].label).toBeNull();
  });

  it("an item with no conflict gets no note", () => {
    const far = approvedAbsence({ id: "absence:a2", startDate: "2026-09-01", endDate: "2026-09-02" });
    const items = [a, far];
    const m = visibleConflictPartners(detectConflicts(items), items, items);
    expect(m.size).toBe(0);
  });
});

describe("the visible and hidden notes are complementary, never duplicated", () => {
  const a = bookingAccepted();
  const b = approvedAbsence();
  const all = [a, b];
  const conflicts = detectConflicts(all);

  it("when the partner is FILTERED OUT, only the hidden note fires", () => {
    const visible = [a];
    expect(visibleConflictPartners(conflicts, all, visible).size).toBe(0);
    expect(hiddenConflictSources(conflicts, all, visible).get("booking:b1")).toEqual(["absence"]);
  });

  it("when the partner is VISIBLE, only the visible note fires", () => {
    expect(hiddenConflictSources(conflicts, all, all).size).toBe(0);
    expect(visibleConflictPartners(conflicts, all, all).size).toBe(2);
  });

  it("an item filtered out itself gets no note of either kind", () => {
    const visible = [b];
    expect(visibleConflictPartners(conflicts, all, visible).has("booking:b1")).toBe(false);
    expect(hiddenConflictSources(conflicts, all, visible).has("booking:b1")).toBe(false);
  });
});

describe("the rendered order is deterministic", () => {
  it("partners sort by earliest overlap, then a stable tiebreak", () => {
    const own = bookingAccepted({ startDate: "2026-08-01", endDate: "2026-08-30" });
    const later = approvedAbsence({ id: "absence:z", startDate: "2026-08-20", endDate: "2026-08-22" });
    const earlier = approvedAbsence({ id: "absence:a", startDate: "2026-08-02", endDate: "2026-08-04" });
    // Input order deliberately opposite to the expected output order.
    const items = [own, later, earlier];
    const partners = visibleConflictPartners(detectConflicts(items), items, items).get("booking:b1")!;
    expect(partners.map((p) => p.id)).toEqual(["absence:a", "absence:z"]);
    expect(partners[0].overlapStart).toBe("2026-08-02");
  });
});

describe("the planning page wires the explanation", () => {
  const page = read("app/[locale]/dashboard/planning/page.tsx");

  it("derives partners from the FULL model, not the filtered rows", () => {
    // Same rule the filter-truth guard pins: a filter changes what is SHOWN,
    // never what is TRUE. `result.items` is the unfiltered set.
    expect(page).toMatch(/visibleConflictPartners\(\s*conflicts,\s*result\.items,\s*visibleItems,?\s*\)/);
  });

  it("renders the counterpart note with a testid", () => {
    expect(page).toMatch(/data-testid=\{`planning-conflict-with-\$\{item\.id\}`\}/);
    expect(page).toMatch(/t\("conflict\.withVisible"/);
  });

  it("uses the source label and the shared day, and falls back rather than inventing a name", () => {
    expect(page).toMatch(/p\.label \?\? t\(`fallback\.\$\{p\.sourceType\}`\)/);
    expect(page).toMatch(/date: fmtShort\(shownPartners\[0\]\.overlapStart\)/);
  });

  it("the day is rendered through the canonical UTC formatter, like every other date on this page", () => {
    // `fmtShort` is built by `createUtcFormatter` (W12 timezone slice), so the
    // explanation cannot name a different calendar day than the row it explains.
    expect(page).toMatch(/const shortFmt = createUtcFormatter\(/);
    expect(page).toMatch(/from "@\/lib\/time\/display"/);
  });

  it("keeps the hidden-partner note — the two cases are complementary", () => {
    expect(page).toMatch(/t\("conflict\.hiddenByFilter"/);
  });
});

describe("copy exists in every ACTIVE locale", () => {
  // `planning` is an active-locale namespace: the 6 inactive catalogues do not
  // carry it at all, so parity is asserted against the active set only.
  for (const loc of ["en", "lt", "ru", "nl", "de"] as const) {
    it(`${loc}: planning.conflict.withVisible is present and interpolates both slots`, () => {
      const m = JSON.parse(read(`messages/${loc}.json`)) as {
        planning: { conflict: Record<string, string> };
      };
      const s = m.planning.conflict.withVisible;
      expect(typeof s, `${loc} missing`).toBe("string");
      expect(s.trim().length).toBeGreaterThan(0);
      expect(s, `${loc} must interpolate {partners}`).toContain("{partners}");
      expect(s, `${loc} must interpolate {date}`).toContain("{date}");
    });
  }
});
