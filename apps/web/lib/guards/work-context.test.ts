import { describe, expect, it } from "vitest";

import { buildSampleWorkerPlayerCard } from "@/lib/player-card/sample-card";
import { WORK_CONTEXT_KEYS, buildWorkContext } from "@/lib/player-card/work-context";

const NOW = new Date("2026-10-02T00:00:00Z");
const card = (state: "confirmed" | "recorded" | "empty") =>
  buildSampleWorkerPlayerCard({ sampleName: "Sample", sampleOrganization: "Sample kitchen", now: NOW, state });
const by = (c: ReturnType<typeof card>) => Object.fromEntries(buildWorkContext(c).map((n) => [n.key, n]));

describe("Level 2 work context — a projection of the one player card", () => {
  it("always yields the six nodes in lifecycle order", () => {
    expect(buildWorkContext(card("confirmed")).map((n) => n.key)).toEqual([...WORK_CONTEXT_KEYS]);
  });

  it("confirmed: every fact node has data and states the card's own numbers", () => {
    const c = card("confirmed");
    const n = by(c);
    expect(n.current.status).toBe("done");
    expect(n.current.names).toEqual(["Sample kitchen"]);
    expect(n.records.count).toBe(c.evidenceEntries);
    expect(n.manager.count).toBe(c.managerConfirmations);
    expect(n.history.count).toBe(c.workHistory.length);
  });

  it("recorded: records exist, nobody's record yet — manager node is absent, not failed", () => {
    const n = by(card("recorded"));
    expect(n.records.status).toBe("done");
    expect(n.manager.status).toBe("absent");
    expect(n.manager.count).toBe(0);
  });

  it("empty: nothing recorded — every fact node is absent (a state, never a score)", () => {
    const n = by(card("empty"));
    expect(["current", "records", "manager", "history"].map((k) => n[k].status)).toEqual(["absent", "absent", "absent", "absent"]);
  });

  it("UNKNOWN is not zero: an unreadable work history / skills read is `unknown`, with no count", () => {
    const base = card("confirmed");
    const n = by({ ...base, unavailable: ["workHistory", "skillsDeclared"] });
    expect(n.current.status).toBe("unknown");
    expect(n.history.status).toBe("unknown");
    expect(n.history.count).toBeNull();
    expect(n.skills.status).toBe("unknown");
    expect(n.skills.count).toBeNull();
  });

  it("every node opens a real route that owns its fact", () => {
    for (const node of buildWorkContext(card("confirmed"))) {
      expect(node.href).toMatch(/^\/(dashboard|cv)/);
    }
  });
});
