import { describe, expect, it } from "vitest";

import {
  buildCompanyWorkHistory,
  placeKeyOf,
  type PlaceObjectFacts,
} from "./company-work-history";
import type { EvidenceRecordView } from "./import-core";

// SYNTHETIC records only — people "Person A/B", places "Place 1/2".
function rec(over: Partial<EvidenceRecordView> & { id: string }): EvidenceRecordView {
  return {
    personId: "pA",
    personName: "Person A",
    activityKind: "work",
    activityDate: "2025-06-02",
    periodStart: null,
    periodEnd: null,
    hours: 8,
    text: "Work described",
    language: "nl",
    contextLabel: null,
    workObjectId: null,
    supplierRole: "employer",
    sourceKind: "xlsx",
    sourceFilename: null,
    importedAt: "2026-01-01T00:00:00Z",
    importedBy: null,
    factFields: [],
    derived: {},
    state: "ORGANIZATION_REPORTED",
    withdrawn: false,
    attestation: null,
    independentlyVerified: false,
    disputedByViewer: false,
    ...over,
  } as EvidenceRecordView;
}

const objects: PlaceObjectFacts[] = [
  { id: "o1", name: "Place 1", addressLine: null, city: null, projectId: null, archived: false },
  { id: "o2", name: "Place 2", addressLine: "Street 1", city: "Town", projectId: "p1", archived: false },
];

describe("buildCompanyWorkHistory", () => {
  it("places a record by object, else by its own label, else nowhere", () => {
    expect(placeKeyOf({ workObjectId: "o1", contextLabel: "x" })).toBe("o:o1");
    expect(placeKeyOf({ workObjectId: null, contextLabel: " Lbl " })).toBe("l:Lbl");
    expect(placeKeyOf({ workObjectId: null, contextLabel: null })).toBe("none");
  });

  it("folds records by place, conserves every hour and keeps period totals apart", () => {
    const h = buildCompanyWorkHistory(
      [
        rec({ id: "1", workObjectId: "o1", hours: 8 }),
        rec({ id: "2", workObjectId: "o1", hours: 6.5, personId: "pB", personName: "Person B", activityDate: "2025-06-09" }),
        rec({ id: "3", workObjectId: "o2", hours: 4 }),
        rec({ id: "4", contextLabel: "Place 3", hours: 5 }),
        rec({ id: "5", hours: 2 }),
        rec({ id: "6", activityDate: null, periodStart: "2025-06-01", periodEnd: "2025-11-30", hours: 800, contextLabel: "Place 3" }),
      ],
      objects,
    );
    expect(h.totalRecords).toBe(6);
    expect(h.totalHours).toBe(825.5);
    expect(h.periodHours).toBe(800);
    expect(h.peopleCount).toBe(2);
    expect(h.byPlacement).toEqual({ object: 3, label: 2, none: 1 });
    const p1 = h.places.find((p) => p.key === "o:o1")!;
    expect(p1.name).toBe("Place 1");
    expect(p1.dayHours).toBe(14.5);
    expect(p1.people.map((p) => p.name)).toEqual(["Person A", "Person B"]);
    expect(p1.firstDate).toBe("2025-06-02");
    expect(p1.lastDate).toBe("2025-06-09");
    const l3 = h.places.find((p) => p.key === "l:Place 3")!;
    expect(l3.periodHours).toBe(800);
    expect(l3.dayHours).toBe(5);
    // "no place stated" is always last
    expect(h.places[h.places.length - 1]!.kind).toBe("none");
    // sum of place hours === total (nothing lost, nothing double counted)
    expect(h.places.reduce((s, p) => s + p.dayHours + p.periodHours, 0)).toBe(h.totalHours);
  });

  it("reports customer/address/project as absent unless the data carries them", () => {
    const h = buildCompanyWorkHistory(
      [rec({ id: "1", workObjectId: "o1" }), rec({ id: "2", workObjectId: "o2" })],
      objects,
    );
    expect(h.places.find((p) => p.key === "o:o1")!.scope).toEqual({ hasProject: false, hasAddress: false });
    expect(h.places.find((p) => p.key === "o:o2")!.scope).toEqual({ hasProject: true, hasAddress: true });
  });

  it("never counts a withdrawn record", () => {
    const h = buildCompanyWorkHistory(
      [rec({ id: "1", workObjectId: "o1" }), rec({ id: "2", workObjectId: "o1", withdrawn: true, hours: 99 })],
      objects,
    );
    expect(h.totalHours).toBe(8);
  });
});
