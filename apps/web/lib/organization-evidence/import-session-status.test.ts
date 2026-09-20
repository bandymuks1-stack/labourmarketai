import { describe, expect, it } from "vitest";

import { deriveImportSessionStatus } from "./import-session-status";

describe("deriveImportSessionStatus — the newest decisive event, or staged", () => {
  it("no decisive event is staged, whatever else happened", () => {
    expect(deriveImportSessionStatus([])).toBe("staged");
    expect(
      deriveImportSessionStatus([
        { eventType: "created", createdAt: "2026-09-01T10:00:00Z" },
        { eventType: "rows_submitted", createdAt: "2026-09-01T10:01:00Z" },
        { eventType: "previewed", createdAt: "2026-09-01T10:02:00Z" },
      ]),
    ).toBe("staged");
  });

  it("commit → withdraw → reinstate reads by time, not by array order", () => {
    const events = [
      { eventType: "reinstated", createdAt: "2026-09-03T00:00:00Z" },
      { eventType: "committed", createdAt: "2026-09-01T00:00:00Z" },
      { eventType: "rolled_back", createdAt: "2026-09-02T00:00:00Z" },
    ];
    expect(deriveImportSessionStatus(events)).toBe("committed");
    expect(deriveImportSessionStatus(events.slice(1))).toBe("withdrawn");
    expect(deriveImportSessionStatus([events[1]])).toBe("committed");
  });

  it("a failed commit is said as failed; an undated event decides nothing", () => {
    expect(
      deriveImportSessionStatus([
        { eventType: "committed", createdAt: "2026-09-01T00:00:00Z" },
        { eventType: "failed", createdAt: "2026-09-01T00:00:01Z" },
      ]),
    ).toBe("failed");
    expect(deriveImportSessionStatus([{ eventType: "committed", createdAt: null }])).toBe("staged");
  });
});
