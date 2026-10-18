import { describe, expect, it } from "vitest";

import { mapViewerRecognitionRows } from "@/lib/qualification/viewer-recognitions";

/**
 * Exact output of worker_recognitions_for_viewer_v1 for the confirming
 * employer in a rolled-back production block (2026-10-07, synthetic data, the
 * draft function created inside the block): the skill row only. The
 * document_type row and the assessor note were not returned; an outsider got
 * 0 rows and anon was refused.
 */
const EMPLOYER_ROWS = [
  {
    id: "9225d46c-9c47-4bbe-b6b3-eb1010c9b4b6",
    valid_until: null,
    assessor_name: "zz-proof institution",
    requirement_key: "zz-proof-drywall",
    requirement_kind: "skill",
    requirement_country: null,
    assessor_organization_id: "78652097-ea1e-4139-9d9d-d9572e3e83b1",
  },
];

describe("viewer recognitions mapping", () => {
  it("maps the real row to a labelled assessor_recognition item", () => {
    expect(mapViewerRecognitionRows(EMPLOYER_ROWS)).toEqual([
      {
        id: "9225d46c-9c47-4bbe-b6b3-eb1010c9b4b6",
        kind: "skill",
        key: "zz-proof-drywall",
        institutionName: "zz-proof institution",
        validUntil: null,
        evidenceClass: "assessor_recognition",
      },
    ]);
  });

  it("drops any document_type row defensively", () => {
    expect(mapViewerRecognitionRows([{ ...EMPLOYER_ROWS[0], requirement_kind: "document_type" }])).toEqual([]);
  });
});
