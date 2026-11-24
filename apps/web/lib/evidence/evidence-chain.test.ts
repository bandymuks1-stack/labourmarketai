import { describe, expect, it } from "vitest";

import { WORK_VERIFICATION_STATES } from "@/lib/journal/work-verification-state";
import { deriveEvidenceChain } from "./evidence-chain";

const status = (v: (typeof WORK_VERIFICATION_STATES)[number], photos: number | null) =>
  Object.fromEntries(deriveEvidenceChain({ verification: v, photoCount: photos }).nodes.map((n) => [n.key, n.status]));

describe("evidence chain — a projection of existing states", () => {
  it("a bare self-reported record: recorded, nothing else — and nothing is called a failure", () => {
    expect(status("self_reported", 0)).toEqual({ recorded: "done", photo: "absent", manager: "absent", history: "absent" });
  });

  it("a photo is evidence but not a manager's record", () => {
    expect(status("self_reported", 2)).toMatchObject({ photo: "done", manager: "absent", history: "absent" });
  });

  it("waiting is waiting, not absent", () => {
    expect(status("verification_pending", 1)).toMatchObject({ manager: "waiting", history: "absent" });
  });

  it("only a decision by somebody else is a manager's record, and it reaches history", () => {
    const c = deriveEvidenceChain({ verification: "verified", photoCount: 1 });
    expect(c.nodes.find((n) => n.key === "manager")).toEqual({ key: "manager", status: "done" });
    expect(c.nodes.find((n) => n.key === "history")).toEqual({ key: "history", status: "done", own: false });
  });

  it("self-confirmed is the person's OWN — done but flagged own, never a manager's record", () => {
    const c = deriveEvidenceChain({ verification: "self_confirmed", photoCount: 0 });
    expect(c.nodes.find((n) => n.key === "manager")).toMatchObject({ status: "done", own: true });
    expect(c.nodes.find((n) => n.key === "history")).toMatchObject({ status: "done", own: true });
  });

  it("returned / disputed need the person's answer; the record is not withdrawn", () => {
    for (const v of ["returned", "disputed"] as const) {
      expect(status(v, 0)).toMatchObject({ recorded: "done", manager: "attention", history: "waiting" });
    }
  });

  it("UNKNOWN is not zero: an unreadable photo count is unknown, never absent", () => {
    expect(status("self_reported", null).photo).toBe("unknown");
    expect(status("self_reported", 0).photo).toBe("absent");
  });

  it("every verification state yields exactly the four nodes in order", () => {
    for (const v of WORK_VERIFICATION_STATES) {
      expect(deriveEvidenceChain({ verification: v, photoCount: 0 }).nodes.map((n) => n.key)).toEqual([
        "recorded",
        "photo",
        "manager",
        "history",
      ]);
    }
  });

  it("no state maps to 'done' for the manager node except a real decision", () => {
    const done = WORK_VERIFICATION_STATES.filter((v) => status(v, 0).manager === "done");
    expect(done.sort()).toEqual(["self_confirmed", "verified"]);
  });
});
