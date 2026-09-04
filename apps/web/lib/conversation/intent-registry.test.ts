import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { INTENT_REGISTRY, type RoutedIntent } from "./intent-registry";

/**
 * G2 (chat-first audit 2026-08-30): the intent→handling table is DATA now,
 * so the invariants that used to be provable only by slicing the component's
 * source are asserted here against the registry itself. TypeScript already
 * enforces exhaustiveness in both directions (every ConversationIntent has a
 * row; every row names an implemented handler) — these tests pin the
 * SEMANTIC classification, which types cannot.
 */

const entries = Object.entries(INTENT_REGISTRY) as [
  RoutedIntent,
  (typeof INTENT_REGISTRY)[RoutedIntent],
][];

const intentsWhere = (pred: (d: (typeof INTENT_REGISTRY)[RoutedIntent]) => boolean) =>
  entries
    .filter(([, d]) => pred(d))
    .map(([intent]) => intent)
    .sort();

describe("the intent registry is the enumerable routing contract", () => {
  it("covers every routed intent and never the `unknown` sentinel", () => {
    // The count is the union's size minus `unknown` — a new intent that
    // updates the union but not this expectation fails HERE, loudly, instead
    // of silently shipping unclassified. 33 → 35 with G8 (`projects` and
    // `candidates` — the chip surfaces, reachable by sentence); 35 → 36 with
    // `timesheets` (the planning #timesheets area, reachable by sentence);
    // 36 → 42 with the §9 chat-first coverage slice, which gives the six
    // domains that shipped reachable ONLY by URL a sentence each
    // (hours-import, work-hours, absences, documents, market-map, activity);
    // 42 → 50 with the real recruiter pilot (2026-09-04): five agency intents
    // (invite-client, invite-candidate, client-demand, propose-candidate,
    // proposal-status) and three student/institution route intents
    // (learning-compass, invite-student, programmes).
    expect(entries.length).toBe(50);
    expect(Object.keys(INTENT_REGISTRY)).not.toContain("unknown");
  });

  it("the blocked set is exactly the honest-degradation set — nothing fake, nothing hidden", () => {
    // reminder/translate have no engine (doctrine §7/§18); write-employer
    // neither acts nor refuses cleanly — the recorded gap G18. Growing this
    // set silently would hide product shrinkage; shrinking it means an
    // engine shipped and the copy must change with it.
    expect(intentsWhere((d) => d.access === "blocked")).toEqual([
      "reminder",
      "translate",
      "write-employer",
    ]);
  });

  it("the write set is exactly the flows that can persist — all behind explicit confirmation", () => {
    expect(intentsWhere((d) => d.access === "write")).toEqual([
      "invite-candidate",
      "invite-client",
      // Owner contract 2026-09-04 §15 — the institution's commands by
      // sentence (learner invitation; programme / cohort / assignment
      // through the `programmes` handler), all important-tier over the ONE
      // dispatcher.
      "invite-student",
      "log-work",
      "need-workers",
      "programmes",
      "propose-candidate",
      "switch-context",
    ]);
  });

  it("the route set is exactly the link-chip answers to canonical surfaces", () => {
    // The §9 additions are ALL route-class, and that is the point: each names
    // a screen the product already renders, so the chat hands over one chip
    // instead of growing a second projection — and a route intent can never
    // become a second write path.
    expect(intentsWhere((d) => d.access === "route")).toEqual([
      "absences",
      "activity",
      "admin-approvals",
      "admin-requests",
      "company-overview",
      "create-organization",
      "documents",
      "hours-import",
      "learning-compass",
      "lmc",
      "market-map",
      "need-service",
      "timesheets",
      "work-hours",
    ]);
  });

  it("§9: every route-class intent chip points at a real dashboard surface", () => {
    // A route intent whose chip goes nowhere is worse than no intent at all:
    // the sentence is understood and the answer is a dead end. Pinned here
    // against the ROUTES the component actually emits.
    const CHAT = readFileSync(
      join(__dirname, "..", "..", "components", "app", "conversation", "chat", "conversation-chat.tsx"),
      "utf8",
    );
    for (const route of [
      "/dashboard/hours?import=1",
      "/dashboard/hours",
      "/dashboard/absences",
      "/dashboard/documents",
      "/dashboard/market-map",
      "/dashboard/activity",
    ]) {
      expect(CHAT, route).toContain(`link:${route}`);
    }
  });

  it("opportunities runs the SAME engine as find-work — one matching pipeline, no second stack", () => {
    expect(INTENT_REGISTRY["opportunities"].handler).toBe(
      INTENT_REGISTRY["find-work"].handler,
    );
  });

  it("synchronous answers (route/blocked) never claim their own async typing cue", () => {
    for (const [intent, d] of entries) {
      if (d.access === "route" || d.access === "blocked") {
        expect(d.ownTyping, intent).toBe(false);
      }
    }
  });
});

describe("the component implements the registry, not a parallel map", () => {
  const CHAT = readFileSync(
    join(
      __dirname,
      "..",
      "..",
      "components",
      "app",
      "conversation",
      "chat",
      "conversation-chat.tsx",
    ),
    "utf8",
  );

  it("dispatch goes through dispatchIntent — the inline switch is gone for good", () => {
    expect(CHAT).toMatch(/dispatchIntent\(intent, handlers, withTyping/);
    // The pre-G2 shapes must not come back: a switch on the classified
    // intent, or a local workflow map keyed by intent, would be a second
    // routing table next to the registry.
    expect(CHAT).not.toMatch(/switch \(intent\)/);
    expect(CHAT).not.toMatch(/const WORKFLOWS/);
  });

  it("every declared handler id is implemented in the component", () => {
    for (const [, d] of entries) {
      expect(CHAT, d.handler).toMatch(new RegExp(`${d.handler}: \\(\\) =>`));
    }
  });

  it("G8: the sentence intents run the SAME functions the chips run", () => {
    // A typed request and a tapped chip are ONE path: `projects` and
    // `candidates` sentences resolve to the exact component functions the
    // chip cases call — never a parallel engine for the same request.
    expect(CHAT).toMatch(/projectsList: \(\) => startProjects\(\)/);
    expect(CHAT).toMatch(/employerCandidates: \(\) => startEmployerCandidates\(\)/);
    expect(CHAT).toMatch(/case "projects":[\s\S]{0,200}?startProjects\(\)/);
    expect(CHAT).toMatch(/case "candidates":[\s\S]{0,200}?startEmployerCandidates\(\)/);
  });
});
