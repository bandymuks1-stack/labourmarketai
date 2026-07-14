import { describe, it, expect } from "vitest";

import {
  validateExternalImport,
  type ExternalObservationImportV1,
} from "./import-boundary";
import { INTELLIGENCE_SOURCE_PROFILES } from "./source-governance";

function importFor(sourceKey: string): ExternalObservationImportV1 {
  return {
    sourceKey,
    snapshotRef: "agentai-crawl-snapshot-0001",
    sourceUrl: "https://example.org/captured-page",
    capturedAt: "2026-07-01T00:00:00.000Z",
    payload: { rows: [] },
  };
}

describe("external observation import boundary", () => {
  it("refuses EVERY registered source today (no external source is active)", () => {
    for (const p of INTELLIGENCE_SOURCE_PROFILES) {
      const result = validateExternalImport(importFor(p.key));
      expect(result.ok, p.key).toBe(false);
    }
  });

  it("refuses every non-internal source with an honest governance reason", () => {
    const external = INTELLIGENCE_SOURCE_PROFILES.filter(
      (p) => p.sourceKind !== "internal_aggregated",
    );
    expect(external.length).toBeGreaterThan(0);
    for (const p of external) {
      const result = validateExternalImport(importFor(p.key));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(
          ["legal_status_unconfirmed", "activation_off"],
          p.key,
        ).toContain(result.reasonCode);
      }
    }
  });

  it("refuses an unknown source", () => {
    const result = validateExternalImport(importFor("random_job_board"));
    expect(result).toEqual({ ok: false, reasonCode: "unknown_source" });
  });

  it("refuses internal sources — internal aggregates never arrive via import", () => {
    const result = validateExternalImport(
      importFor("internal_platform_aggregates"),
    );
    expect(result).toEqual({ ok: false, reasonCode: "source_not_activated" });
  });
});
