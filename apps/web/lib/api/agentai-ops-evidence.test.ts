import { describe, expect, it } from "vitest";

import {
  AGENTAI_OPS_EVIDENCE_MAX_BYTES,
  AGENTAI_OPS_EVIDENCE_MAX_JOBS,
  COMMERCIAL_METRIC_KEYS,
  parseAgentaiOpsEvidence,
} from "./agentai-ops-evidence";

const period = (v: number | null) => Object.fromEntries(COMMERCIAL_METRIC_KEYS.map((k) => [k, v]));
const valid = () => ({
  schema: "agentai-ops-evidence/v1",
  builtAtIso: "2026-10-23T18:00:00.000Z",
  deployedSha: "84db8d8a9ebba3f650e5ec3c2e84b83798196de9",
  jobs: { "standing-send-drain": ["OK", "2026-10-23T17:59Z", 0], "contact-research": [null, null, null] },
  commercial: { today: period(3), week: period(null), total: period(120) },
  listener: { imapLastSeenIso: "2026-10-23T17:58:12Z" },
});

/** A realistic full snapshot: 30 jobs with typical ids/outcomes and every metric at its maximum. */
function fullBody() {
  const jobs: Record<string, unknown> = {};
  for (let i = 0; i < 30; i += 1) {
    jobs[`standing-drain-${String(i).padStart(2, "0")}`] = ["SKIPPED_LANE_STATE", "2026-10-23T17:59Z", 999];
  }
  return { ...valid(), jobs, commercial: { today: period(1000000), week: period(1000000), total: period(1000000) } };
}

describe("agentai ops evidence contract", () => {
  it("accepts the documented shape, nulls meaning unmeasured", () => {
    expect(parseAgentaiOpsEvidence(valid()).ok).toBe(true);
  });

  it.each([
    ["an extra top-level key", { ...valid(), note: "x" }],
    ["a mailbox anywhere", { ...valid(), jobs: { "a": ["OK", null, 0] }, listener: { imapLastSeenIso: null }, deployedSha: null, builtAtIso: "2026-10-23T18:00:00Z", schema: "agentai-ops-evidence/v1", commercial: { today: period(1), week: period(1), total: { ...period(1), found: 1 } }, extra: "a@b.c" }],
    ["a name in a job outcome", { ...valid(), jobs: { "x": ["Jonas Jonaitis", null, 0] } }],
    ["a lowercase outcome", { ...valid(), jobs: { "x": ["ok", null, 0] } }],
    ["a job id with spaces", { ...valid(), jobs: { "my job": ["OK", null, 0] } }],
    ["seconds in lastFinish", { ...valid(), jobs: { "x": ["OK", "2026-10-23T17:59:01Z", 0] } }],
    ["a fractional count", { ...valid(), commercial: { ...valid().commercial, today: { ...period(1), found: 1.5 } } }],
    ["a negative count", { ...valid(), commercial: { ...valid().commercial, today: { ...period(1), offers: -1 } } }],
    ["a missing metric", { ...valid(), commercial: { ...valid().commercial, today: { found: 1 } } }],
    ["a short sha", { ...valid(), deployedSha: "84db8d8" }],
    ["a wrong schema", { ...valid(), schema: "v2" }],
    ["a string count", { ...valid(), commercial: { ...valid().commercial, total: { ...period(1), orders: "3" } } }],
  ])("refuses %s", (_label, body) => {
    expect(parseAgentaiOpsEvidence(body).ok).toBe(false);
  });

  it("refuses more than the job cap", () => {
    const jobs: Record<string, unknown> = {};
    for (let i = 0; i <= AGENTAI_OPS_EVIDENCE_MAX_JOBS; i += 1) jobs[`j${i}`] = ["OK", null, 0];
    expect(parseAgentaiOpsEvidence({ ...valid(), jobs }).ok).toBe(false);
  });

  it("a realistic full snapshot fits the byte cap", () => {
    const body = fullBody();
    expect(parseAgentaiOpsEvidence(body).ok).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(body), "utf8")).toBeLessThanOrEqual(AGENTAI_OPS_EVIDENCE_MAX_BYTES);
  });
});
