import { describe, expect, it } from "vitest";

import { mapRecognitionRpcError, parseRecognitionForm } from "./recognition-model";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";

function form(over: Record<string, string> = {}) {
  const base: Record<string, string> = {
    subjectProfileId: U1,
    assessorOrganizationId: U2,
    requirementKind: "document_type",
    requirementKey: "welding-certificate",
    requirementCountry: "lt",
    evidenceEntryIds: U3,
    decision: "recognised",
    ...over,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  return fd;
}

describe("recognition form parsing", () => {
  it("accepts a complete form and upper-cases the country", () => {
    const r = parseRecognitionForm(form());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.requirementCountry).toBe("LT");
  });
  it("rejects bad uuids, empty evidence, unknown decision and inverted dates", () => {
    expect(parseRecognitionForm(form({ subjectProfileId: "x" })).ok).toBe(false);
    expect(parseRecognitionForm(form({ evidenceEntryIds: "" })).ok).toBe(false);
    expect(parseRecognitionForm(form({ evidenceEntryIds: "nope" })).ok).toBe(false);
    expect(parseRecognitionForm(form({ decision: "verified" })).ok).toBe(false);
    expect(parseRecognitionForm(form({ validFrom: "2026-05-01", validUntil: "2026-01-01" })).ok).toBe(false);
  });
});

describe("recognition RPC error mapping", () => {
  it.each(["42883", "42P01", "PGRST202", "PGRST205"])("%s degrades to needs_migration", (code) => {
    expect(mapRecognitionRpcError(code, "anything")).toEqual({ status: "needs_migration" });
  });
  it("maps authority refusals to forbidden and others to error", () => {
    expect(mapRecognitionRpcError("42501", "not_manager")).toEqual({ status: "forbidden" });
    expect(mapRecognitionRpcError("XX000", "boom")).toEqual({ status: "error", reason: "XX000" });
  });
});
