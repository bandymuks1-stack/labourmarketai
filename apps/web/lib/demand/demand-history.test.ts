import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildDemandHistory, type DemandHistoryBookingEvent } from "./demand-history";

/** Function register 4.30: candidate → decision → need closed, with its history. */

const ME = "owner-profile";
const WORKER_PROFILE = "worker-profile";
const need = (status: string, closedOutcome: string | null = null) => ({
  createdAt: "2026-11-01T08:00:00Z",
  status,
  closedOutcome,
});
const ev = (workerId: string, type: DemandHistoryBookingEvent["type"], actorId: string, at: string) => ({
  workerId,
  type,
  actorId,
  at,
});

describe("the need's history", () => {
  it("starts with the need, then every booking event in time order, each with its actor", () => {
    const h = buildDemandHistory({
      readerId: ME,
      need: need("submitted"),
      events: [
        ev("w1", "accepted", WORKER_PROFILE, "2026-11-03T09:00:00Z"),
        ev("w1", "proposed", ME, "2026-11-02T09:00:00Z"),
        ev("w2", "expired", "system", "2026-11-04T09:00:00Z"),
      ],
    });
    expect(h.entries.map((e) => (e.kind === "booking" ? `${e.type}:${e.actor}` : e.kind))).toEqual([
      "created",
      "proposed:you",
      "accepted:candidate",
      "expired:automatic",
    ]);
    expect(h.hired).toEqual(["w1"]);
    expect(h.decided, "an open need is not decided").toBe(false);
  });

  it("a need closed as filled with an accepted candidate is the hire decision", () => {
    const h = buildDemandHistory({
      readerId: ME,
      need: need("closed", "completed"),
      events: [ev("w1", "proposed", ME, "2026-11-02T09:00:00Z"), ev("w1", "accepted", WORKER_PROFILE, "2026-11-03T09:00:00Z")],
    });
    expect(h.decided).toBe(true);
    expect(h.entries.at(-1)).toEqual({ kind: "closed", outcome: "completed" });
  });

  it("closed as withdrawn, or with nobody accepted, is not a hire", () => {
    const accepted = [ev("w1", "accepted", WORKER_PROFILE, "2026-11-03T09:00:00Z")];
    expect(buildDemandHistory({ readerId: ME, need: need("closed", "withdrawn"), events: accepted }).decided).toBe(false);
    expect(buildDemandHistory({ readerId: ME, need: need("closed", "completed"), events: [] }).decided).toBe(false);
  });

  it("a later answer replaces an earlier one: accepted then withdrawn is not hired", () => {
    const h = buildDemandHistory({
      readerId: ME,
      need: need("closed", "completed"),
      events: [ev("w1", "accepted", WORKER_PROFILE, "2026-11-03T09:00:00Z"), ev("w1", "withdrawn", ME, "2026-11-05T09:00:00Z")],
    });
    expect(h.hired).toEqual([]);
    expect(h.decided).toBe(false);
  });

  it("the close carries no invented time or actor; an unknown outcome stays unknown", () => {
    const h = buildDemandHistory({ readerId: ME, need: need("closed", null), events: [] });
    const closed = h.entries.at(-1);
    expect(closed).toEqual({ kind: "closed", outcome: null });
    expect(closed && "at" in closed).toBe(false);
  });
});

describe("the history reads only what the owner can already read", () => {
  const facts = readFileSync(resolve(__dirname, "demand-history-facts.ts"), "utf8");
  it("no admin client, no audit log, no new RPC; proposals are the caller's own", () => {
    expect(facts).not.toMatch(/createAdminClient|audit_logs|\.rpc\(/);
    expect(facts).toMatch(/\.from\("booking_requests"\)[\s\S]{0,120}\.eq\("owner_id", user\.id\)/);
    expect(facts).toMatch(/\.from\("booking_request_events"\)/);
  });
  it("the scouting page shows it to the need's owner only, never to an agency acting for a client", () => {
    const page = readFileSync(resolve(__dirname, "..", "..", "app/[locale]/dashboard/company/scouting/page.tsx"), "utf8");
    expect(page).toMatch(/result\?\.kind === "ok" && !actsForClient \? loadDemandHistory\(result\.demand\.id\) : null/);
    expect(page).toMatch(/<DemandHistoryList/);
  });
});
