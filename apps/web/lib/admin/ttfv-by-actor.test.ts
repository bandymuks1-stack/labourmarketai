import { describe, expect, it } from "vitest";

import { actorFromMetadata, summariseTtfv, type TtfvRow } from "./ttfv-by-actor";

const t = (min: number) => new Date(Date.UTC(2026, 8, 3, 8, min)).toISOString();
const row = (event_name: string, profile_id: string | null, min: number, metadata: Record<string, unknown> | null = null): TtfvRow => ({
  event_name,
  profile_id,
  created_at: t(min),
  metadata,
});

describe("time to first real value, per actor (pure)", () => {
  it("resolves the actor from the first-run intent, most specific first, then from role_context", () => {
    expect(actorFromMetadata({ intent: "work" })).toBe("worker");
    expect(actorFromMetadata({ intent: "work,student" })).toBe("student");
    expect(actorFromMetadata({ intent: "hire,agency" })).toBe("agency");
    expect(actorFromMetadata({ intent: "hire,education" })).toBe("education");
    expect(actorFromMetadata({ intent: "hire" })).toBe("employer");
    expect(actorFromMetadata({ role_context: "worker" })).toBe("worker");
    expect(actorFromMetadata({ role_context: "company" })).toBe("employer");
    expect(actorFromMetadata({ role_context: "agency" })).toBe("agency");
    expect(actorFromMetadata({})).toBeNull();
    expect(actorFromMetadata(null)).toBeNull();
  });

  it("keys by profile, measures start → first action → first result, and buckets by actor", () => {
    const rows: TtfvRow[] = [
      // worker: signup at 0, journal at 10, match preview at 25
      row("signup_completed", "w1", 0),
      row("role_selected", "w1", 1, { role_context: "worker", intent: "work" }),
      row("journal_entry_saved", "w1", 10),
      row("match_preview_generated", "w1", 25),
      // employer: onboarding at 5, demand at 35, nothing else
      row("onboarding_completed", "e1", 5, { role_context: "company" }),
      row("demand_saved", "e1", 35),
      // student: signup, no action yet
      row("signup_completed", "s1", 0),
      row("role_selected", "s1", 0, { intent: "student" }),
      // an action BEFORE the start is not counted (returning user's old event)
      row("journal_entry_saved", "w2", 0),
      row("signup_completed", "w2", 3),
      row("role_selected", "w2", 3, { intent: "work" }),
      // preview host rows and anonymous rows are excluded
      row("signup_completed", "p1", 0, { preview_host: true }),
      row("signup_completed", null, 0),
    ];
    const s = summariseTtfv(rows);
    expect(s.available).toBe(true);
    expect(s.excludedPreview).toBe(2);
    expect(s.usersWithStart).toBe(4);
    const by = Object.fromEntries(s.byActor.map((b) => [b.actor, b]));
    expect(by.worker).toEqual({
      actor: "worker", users: 2, reachedAction: 1, reachedSystemResult: 1, reachedHumanResult: 0,
      medianToActionMs: 10 * 60_000, medianToSystemResultMs: 25 * 60_000, medianToHumanResultMs: null,
    });
    expect(by.employer).toEqual({
      actor: "employer", users: 1, reachedAction: 1, reachedSystemResult: 0, reachedHumanResult: 0,
      medianToActionMs: 30 * 60_000, medianToSystemResultMs: null, medianToHumanResultMs: null,
    });
    expect(by.student).toEqual({
      actor: "student", users: 1, reachedAction: 0, reachedSystemResult: 0, reachedHumanResult: 0,
      medianToActionMs: null, medianToSystemResultMs: null, medianToHumanResultMs: null,
    });
    expect(s.byActor.map((b) => b.actor)).toEqual(["worker", "employer", "student"]);
  });

  it("system and human results are measured separately — the fast system preview never hides the slow human reply", () => {
    const rows: TtfvRow[] = [
      row("signup_completed", "e1", 0),
      row("role_selected", "e1", 0, { intent: "hire" }),
      row("demand_saved", "e1", 5),
      row("match_preview_generated", "e1", 6, { candidate_count: 3 }), // system, minutes
      row("contact_disclosed", "e1", 300), // human, hours
      // worker: an EMPTY board view is not value; a board with fits is
      row("signup_completed", "w1", 0),
      row("role_selected", "w1", 0, { intent: "work" }),
      row("marketplace_or_opportunities_viewed", "w1", 2, { candidate_count: 0 }),
      row("marketplace_or_opportunities_viewed", "w1", 4, { candidate_count: 2 }),
      row("booking_accepted", "w1", 600),
      // the dedicated event carries its kind on `step`
      row("signup_completed", "a1", 0),
      row("role_selected", "a1", 0, { intent: "agency" }),
      row("first_real_result", "a1", 7, { step: "system" }),
      row("first_real_result", "a1", 90, { step: "human" }),
    ];
    const by = Object.fromEntries(summariseTtfv(rows).byActor.map((b) => [b.actor, b]));
    expect(by.employer.medianToSystemResultMs).toBe(6 * 60_000);
    expect(by.employer.medianToHumanResultMs).toBe(300 * 60_000);
    expect(by.worker.medianToSystemResultMs).toBe(4 * 60_000);
    expect(by.worker.medianToHumanResultMs).toBe(600 * 60_000);
    expect(by.agency.reachedSystemResult).toBe(1);
    expect(by.agency.medianToSystemResultMs).toBe(7 * 60_000);
    expect(by.agency.medianToHumanResultMs).toBe(90 * 60_000);
  });

  it("an intent-bearing row wins the bucket even when a newer coarse row is read first (production order is newest-first)", () => {
    const rows: TtfvRow[] = [
      // newest first, as the query returns them
      row("onboarding_completed", "s1", 3, { role_context: "worker" }),
      row("role_selected", "s1", 1, { role_context: "worker", intent: "student" }),
      row("signup_completed", "s1", 0),
      row("onboarding_completed", "i1", 3, { role_context: "company" }),
      row("role_selected", "i1", 1, { role_context: "company", intent: "education" }),
      row("signup_completed", "i1", 0),
    ];
    expect(summariseTtfv(rows).byActor.map((b) => b.actor)).toEqual(["student", "education"]);
  });

  it("a user with no actor signal lands in `unknown`, never in a guessed bucket", () => {
    const s = summariseTtfv([row("signup_completed", "u1", 0), row("journal_entry_saved", "u1", 2)]);
    expect(s.byActor).toEqual([
      {
        actor: "unknown", users: 1, reachedAction: 1, reachedSystemResult: 0, reachedHumanResult: 0,
        medianToActionMs: 2 * 60_000, medianToSystemResultMs: null, medianToHumanResultMs: null,
      },
    ]);
  });
});
