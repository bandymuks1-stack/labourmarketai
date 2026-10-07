import { describe, expect, it } from "vitest";

import { splitAddress } from "./address-split";
import { applyDecisions, labelKey, proposeMapping } from "./object-mapping";
import { PERFORMER_NOT_ESTABLISHED, buildCommitRows } from "./import-core";

// SYNTHETIC labels only — street words are invented.

describe("splitAddress — one certain shape, nothing guessed", () => {
  it("reads <street> <number> and <street> <number>, <city>", () => {
    expect(splitAddress("Kastanjelaan 12")).toEqual({ addressLine: "Kastanjelaan 12", city: null });
    expect(splitAddress("Kastanjelaan 12, Utrecht")).toEqual({ addressLine: "Kastanjelaan 12", city: "Utrecht" });
    expect(splitAddress("  Jan  van Eyckstraat   7B ")).toEqual({ addressLine: "Jan van Eyckstraat 7B", city: null });
  });
  it("returns null for anything that is not unmistakably an address", () => {
    for (const label of ["Kantoor", "Kantoor 2", "Office 3", "12", "Kastanjelaan", "Kastanjelaan 12; Kantoor", "", "A 1", "extra 2u"]) {
      expect(splitAddress(label), label).toBeNull();
    }
    expect(splitAddress(null)).toBeNull();
    expect(splitAddress(undefined)).toBeNull();
  });
});

describe("proposeMapping — exact / street-only / unmatched, never auto-linking street-only", () => {
  const targets = ["Kastanjelaan 12", "Kastanjelaan 14", "Molenpad 3", "Berkenweg 8 Hilversum"];
  const place = ["Hilversum"];

  it("exact needs the same street AND number and needs no confirmation", () => {
    const [p] = proposeMapping({ timesheetLabels: ["kastanjelaan 12"], targetLabels: targets, placeWords: place });
    expect(p).toMatchObject({ tier: "exact", candidates: ["Kastanjelaan 12"], requiresConfirmation: false });
  });
  it("a missing or different number is street-only and needs a person", () => {
    const [a, b] = proposeMapping({ timesheetLabels: ["Kastanjelaan", "Kastanjelaan 99"], targetLabels: targets, placeWords: place });
    expect(a).toMatchObject({ tier: "street_only", requiresConfirmation: true });
    expect(a!.candidates).toEqual(["Kastanjelaan 12", "Kastanjelaan 14"]);
    expect(b).toMatchObject({ tier: "street_only", requiresConfirmation: true });
  });
  it("another street is unmatched; the town name is not taken for the street", () => {
    const out = proposeMapping({ timesheetLabels: ["Zonnelaan 1", "Berkenweg 8"], targetLabels: targets, placeWords: place });
    expect(out[0]).toMatchObject({ tier: "unmatched", candidates: [], requiresConfirmation: true });
    expect(out[1]).toMatchObject({ tier: "exact" });
    expect(labelKey("Berkenweg 8 Hilversum", new Set(["hilversum"]))).toEqual({ street: "berkenweg", number: "8" });
  });
  it("applyDecisions links street-only ONLY on a confirmed candidate, never otherwise", () => {
    const proposals = proposeMapping({ timesheetLabels: ["Kastanjelaan", "Molenpad 3", "Zonnelaan 1"], targetLabels: targets, placeWords: place });
    const none = applyDecisions(proposals, []);
    expect(none.get("Kastanjelaan")).toBeNull();
    expect(none.get("Molenpad 3")).toBe("Molenpad 3");
    expect(none.get("Zonnelaan 1")).toBeNull();
    const confirmed = applyDecisions(proposals, [
      { label: "Kastanjelaan", target: "Kastanjelaan 14" },
      { label: "Zonnelaan 1", target: "Molenpad 3" }, // not a candidate → refused
    ]);
    expect(confirmed.get("Kastanjelaan")).toBe("Kastanjelaan 14");
    expect(confirmed.get("Zonnelaan 1")).toBeNull();
    // "none of these" is an answer too
    expect(applyDecisions(proposals, [{ label: "Kastanjelaan", target: null }]).get("Kastanjelaan")).toBeNull();
  });
});

describe("performer not established — a stated absence on the record, no pseudo-organization", () => {
  const session = {
    organizationId: "org-1",
    suppliedByOrganizationId: null,
    sourceKind: "xlsx",
    sourceLanguage: "nl",
    sourceFilename: "f.xlsx",
    sourceReference: null,
    supplierRole: "other",
  };
  const ready = [
    {
      id: "r1",
      organization_person_id: "p1",
      record_fingerprint: "fp-aaaaaaaaaaaaaaaa",
      activity_date: "2025-03-03",
      hours: 8,
      activity_text: "work",
      derived: { keep: true },
      source_fact: {},
    },
  ];
  const base = { sessionId: "s1", session, ready, importedAt: "2026-10-01T00:00:00.000Z", userId: "u1", evidenceState: "UNVERIFIED" as const };

  it("writes derived.performingCompany on the record AND the staging final state when declared", () => {
    const out = buildCommitRows({ ...base, performerNotEstablished: true });
    expect((out.records[0]!.derived as Record<string, unknown>).performingCompany).toEqual(PERFORMER_NOT_ESTABLISHED);
    expect((out.records[0]!.derived as Record<string, unknown>).keep).toBe(true);
    expect((out.finalState[0]!.state.derived as Record<string, unknown>).performingCompany).toEqual(PERFORMER_NOT_ESTABLISHED);
    // the supplier role and the evidence state are exactly what the session / caller said
    expect(out.records[0]!.supplier_role).toBe("other");
    expect(out.records[0]!.evidence_state).toBe("UNVERIFIED");
    expect(out.records[0]!.organization_id).toBe("org-1");
  });
  it("adds nothing when not declared (existing behaviour unchanged)", () => {
    const out = buildCommitRows(base);
    expect((out.records[0]!.derived as Record<string, unknown>).performingCompany).toBeUndefined();
    expect(out.finalState[0]!.state.derived).toEqual({ keep: true });
  });
  it("does not change the record fingerprint or hash chain", () => {
    const a = buildCommitRows(base).records[0]!;
    const b = buildCommitRows({ ...base, performerNotEstablished: true }).records[0]!;
    expect(b.record_fingerprint).toBe(a.record_fingerprint);
    expect(b.hash_self).toBe(a.hash_self);
  });
});
