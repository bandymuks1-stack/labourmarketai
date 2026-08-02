import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  conflictItemIds,
  detectConflicts,
  hiddenConflictSources,
  planningMeta,
  projectAbsenceItem,
  type PlanningItem,
} from "@/lib/planning/planning-model";

/**
 * Guard for W12 slice 3 — filter-independent conflict truth.
 *
 * THE DEFECT. The planning page derived conflicts from the FILTERED list:
 *
 *   const conflictIds = conflictItemIds(detectConflicts(visibleItems));
 *
 * so `?source=booking` removed the absence rows from the INPUT and the overlap
 * stopped being computed at all. A worker who filtered to bookings saw a clean
 * plan while approved leave sat on exactly the same days — the calendar
 * presenting a physically impossible plan as fine, which is the precise failure
 * the Time Engine W2 conflict rules exist to prevent.
 *
 * THE RULE. A filter is a question about what to SHOW. It must never change
 * what is TRUE. Conflicts come from the full model; only rendering is filtered.
 *
 * Because the rows are still filtered, a flagged item can end up with no
 * VISIBLE partner — a red badge beside a row that looks fine. So the page also
 * names the hidden source. That disclosure is safe by construction: every
 * conflict partner is the caller's OWN commitment (see `isConflictEligible` —
 * incoming accepted bookings, personally assigned projects, own approved
 * absences), and only the source TYPE is exposed, never a label, date or id.
 */

const APP = resolve(__dirname, "..", "..");

function bookingAccepted(over: Partial<PlanningItem> = {}): PlanningItem {
  return {
    id: "booking:b1",
    sourceType: "booking",
    sourceId: "b1",
    label: null,
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

function assignedProject(over: Partial<PlanningItem> = {}): PlanningItem {
  return {
    id: "project:p9",
    sourceType: "project",
    sourceId: "p9",
    label: null,
    detail: null,
    startDate: "2026-08-06",
    endDate: "2026-08-08",
    status: "active",
    statusKey: "projects.status.active",
    href: "/dashboard/projects",
    roleContext: "assigned",
    ...planningMeta(),
    ...over,
  };
}

const approvedLeave = (): PlanningItem =>
  projectAbsenceItem({
    id: "a1",
    startDate: "2026-08-05",
    endDate: "2026-08-09",
    status: "approved",
  })!;

/** What the page does: filter for RENDER, derive conflicts from the FULL set. */
function filtered(
  all: readonly PlanningItem[],
  source: PlanningItem["sourceType"] | null,
): readonly PlanningItem[] {
  return source ? all.filter((i) => i.sourceType === source) : all;
}

describe("W12 slice 3 — a source filter cannot hide a real conflict", () => {
  it("the booking filter does not hide an absence conflict", () => {
    const all = [bookingAccepted(), approvedLeave()];
    const visible = filtered(all, "booking");

    // The old behaviour, kept here as the explicit regression witness: derived
    // from the filtered list, the conflict simply disappears.
    expect(detectConflicts(visible)).toHaveLength(0);

    // The fixed behaviour: derived from the full model, it survives the filter.
    const ids = conflictItemIds(detectConflicts(all));
    expect(ids.has("booking:b1")).toBe(true);
  });

  it("the project filter does not hide a booking conflict", () => {
    const all = [bookingAccepted(), assignedProject()];
    const visible = filtered(all, "project");
    expect(detectConflicts(visible)).toHaveLength(0);

    const ids = conflictItemIds(detectConflicts(all));
    expect(ids.has("project:p9")).toBe(true);
  });

  it("the conflict COUNT is identical with the filter on and off", () => {
    const all = [bookingAccepted(), approvedLeave(), assignedProject()];
    const off = detectConflicts(all).length;
    for (const source of ["booking", "project", "absence"] as const) {
      // Same input, whatever is being rendered.
      expect(detectConflicts(all).length).toBe(off);
      expect(filtered(all, source).length).toBeLessThan(all.length);
    }
  });

  it("the RENDER list still changes — only the truth is filter-independent", () => {
    const all = [bookingAccepted(), approvedLeave()];
    expect(filtered(all, "booking").map((i) => i.id)).toEqual(["booking:b1"]);
    expect(filtered(all, "absence").map((i) => i.id)).toEqual(["absence:a1"]);
    expect(filtered(all, null)).toHaveLength(2);
  });
});

describe("W12 slice 3 — the hidden partner is explained, not left mute", () => {
  it("names the hidden source type for a visible flagged item", () => {
    const all = [bookingAccepted(), approvedLeave()];
    const visible = filtered(all, "booking");
    const hidden = hiddenConflictSources(detectConflicts(all), all, visible);
    expect(hidden.get("booking:b1")).toEqual(["absence"]);
  });

  it("says nothing when the partner is visible", () => {
    const all = [bookingAccepted(), approvedLeave()];
    const hidden = hiddenConflictSources(detectConflicts(all), all, all);
    expect(hidden.size).toBe(0);
  });

  it("says nothing about an item the filter itself hid", () => {
    const all = [bookingAccepted(), approvedLeave()];
    const visible = filtered(all, "booking");
    const hidden = hiddenConflictSources(detectConflicts(all), all, visible);
    // The absence is not rendered, so there is no row to annotate.
    expect(hidden.has("absence:a1")).toBe(false);
  });

  it("de-duplicates and orders the hidden sources deterministically", () => {
    const all = [
      bookingAccepted(),
      approvedLeave(),
      projectAbsenceItem({
        id: "a2",
        startDate: "2026-08-04",
        endDate: "2026-08-06",
        status: "approved",
      })!,
      assignedProject(),
    ];
    const visible = filtered(all, "booking");
    const hidden = hiddenConflictSources(detectConflicts(all), all, visible);
    // Two absences + one project all overlap the booking → two TYPES, sorted.
    expect(hidden.get("booking:b1")).toEqual(["absence", "project"]);
  });

  it("exposes only the source TYPE — never a label, date or id", () => {
    const all = [
      bookingAccepted(),
      { ...approvedLeave(), label: "Surgery, private" },
    ];
    const visible = filtered(all, "booking");
    const hidden = hiddenConflictSources(detectConflicts(all), all, visible);
    const blob = JSON.stringify([...hidden.entries()]);
    expect(blob).not.toContain("Surgery");
    expect(blob).not.toContain("2026-08-05");
    expect(blob).not.toContain("absence:a1");
  });

  it("is empty when there are no conflicts at all", () => {
    const all = [
      bookingAccepted(),
      projectAbsenceItem({
        id: "a3",
        startDate: "2026-09-01",
        endDate: "2026-09-02",
        status: "approved",
      })!,
    ];
    const hidden = hiddenConflictSources(
      detectConflicts(all),
      all,
      filtered(all, "booking"),
    );
    expect(hidden.size).toBe(0);
  });
});

describe("W12 slice 3 — the page is wired to the full model", () => {
  const page = readFileSync(
    resolve(APP, "app", "[locale]", "dashboard", "planning", "page.tsx"),
    "utf8",
  );

  it("derives conflicts from result.items, never from visibleItems", () => {
    expect(page).toContain("detectConflicts(result.items)");
    // The exact defect this slice closes.
    expect(page).not.toContain("detectConflicts(visibleItems)");
  });

  it("still renders the FILTERED list (the filter keeps working)", () => {
    expect(page).toMatch(
      /const visibleItems = sourceFilter[\s\S]{0,120}i\.sourceType === sourceFilter/,
    );
  });

  it("renders the hidden-source explanation", () => {
    expect(page).toContain("hiddenConflictSources");
    expect(page).toContain("conflict.hiddenByFilter");
    expect(page).toContain("planning-conflict-hidden-");
  });

  it("does not introduce a second conflict engine", () => {
    // One derivation, from the shared pure model.
    expect(page.match(/detectConflicts\(/g) ?? []).toHaveLength(1);
  });
});

describe("W12 slice 3 — the explanation is translated", () => {
  it("every locale that has planning.conflict also has hiddenByFilter", () => {
    const dir = resolve(APP, "messages");
    const locales = ["en", "lt", "de", "nl", "ru"];
    for (const locale of locales) {
      const data = JSON.parse(
        readFileSync(resolve(dir, `${locale}.json`), "utf8"),
      );
      const conflict = data?.planning?.conflict;
      expect(conflict, `${locale}: planning.conflict missing`).toBeTruthy();
      expect(
        typeof conflict.hiddenByFilter,
        `${locale}: hiddenByFilter missing`,
      ).toBe("string");
      // The interpolation the page passes must be present, or the sentence
      // would render without naming the source.
      expect(conflict.hiddenByFilter).toContain("{sources}");
    }
  });
});
