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
    expect(by.worker).toEqual({ actor: "worker", users: 2, reachedAction: 1, reachedResult: 1, medianToActionMs: 10 * 60_000, medianToResultMs: 25 * 60_000 });
    expect(by.employer).toEqual({ actor: "employer", users: 1, reachedAction: 1, reachedResult: 0, medianToActionMs: 30 * 60_000, medianToResultMs: null });
    expect(by.student).toEqual({ actor: "student", users: 1, reachedAction: 0, reachedResult: 0, medianToActionMs: null, medianToResultMs: null });
    expect(s.byActor.map((b) => b.actor)).toEqual(["worker", "employer", "student"]);
  });

  it("a user with no actor signal lands in `unknown`, never in a guessed bucket", () => {
    const s = summariseTtfv([row("signup_completed", "u1", 0), row("journal_entry_saved", "u1", 2)]);
    expect(s.byActor).toEqual([
      { actor: "unknown", users: 1, reachedAction: 1, reachedResult: 0, medianToActionMs: 2 * 60_000, medianToResultMs: null },
    ]);
  });
});
