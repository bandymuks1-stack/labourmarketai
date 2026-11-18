import { describe, expect, it } from "vitest";

import type { RecognitionRow } from "@/lib/skills/recognition-model";

import { deriveRecognitionsView } from "./recognitions-view";

const row = (over: Partial<RecognitionRow> = {}): RecognitionRow => ({
  id: "r1",
  decision: "recognised",
  validFrom: null,
  validUntil: null,
  assessorOrganizationId: "o1",
  requirementKind: "document_type",
  requirementKey: "welding-certificate",
  revokedAt: null,
  ...over,
});

describe("recognitions view", () => {
  it("unknown (read failed) is not empty", () => {
    expect(deriveRecognitionsView(null, "2026-10-07")).toEqual({ kind: "unavailable" });
  });
  it("no rows is empty", () => {
    expect(deriveRecognitionsView([], "2026-10-07")).toEqual({ kind: "empty" });
  });
  it("derives current, lapsed, revoked, not-recognised and not-yet-valid", () => {
    const v = deriveRecognitionsView(
      [
        row({ id: "a" }),
        row({ id: "b", validUntil: "2026-01-01" }),
        row({ id: "c", revokedAt: "2026-02-01T00:00:00Z" }),
        row({ id: "d", decision: "not_recognised" }),
        row({ id: "e", validFrom: "2027-01-01" }),
      ],
      "2026-10-07",
    );
    expect(v.kind).toBe("rows");
    if (v.kind === "rows") expect(v.items.map((i) => i.state)).toEqual(["current", "lapsed", "revoked", "not_recognised", "not_yet_valid"]);
  });
});
