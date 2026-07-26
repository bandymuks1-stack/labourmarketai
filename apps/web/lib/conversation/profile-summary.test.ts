import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Conversation profile summary — BEHAVIOUR tests.
 *
 * These run the REAL `loadProfileSummaryForChat()` with the canonical worker
 * read model stubbed, so what is asserted is what the conversation DOES with a
 * canonical result:
 *   • identity is server-derived; no session ⇒ honest blocked message;
 *   • an account without a worker profile is told so, not reported as "0 done";
 *   • done/missing are the read model's five checkpoints, NAMED not counted;
 *   • the same real state answers "profile" / "next" / "resume" — only the
 *     opening line differs, which is what makes the answer survive a reload;
 *   • a complete profile gets a different opening, never a "what's missing"
 *     line with nothing after it;
 *   • last activity is the real stored event, and null when there is none.
 *
 * i18n is stubbed as `key(values)` so a test can see WHICH key was chosen.
 */

const getUserMock = vi.fn();
const activityMock = vi.fn();

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "lt"),
  getTranslations: vi.fn(async (ns: string) => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${ns}.${key}(${JSON.stringify(values)})` : `${ns}.${key}`;
    (t as unknown as { has: (k: string) => boolean }).has = () => true;
    return t;
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: getUserMock } }),
}));

vi.mock("@/lib/conversation/worker-activity", async () => {
  const actual = await vi.importActual<typeof import("./worker-activity")>(
    "./worker-activity",
  );
  return { ...actual, getWorkerActivity: (...a: unknown[]) => activityMock(...a) };
});

const { loadProfileSummaryForChat } = await import("./profile-summary");

const USER = { id: "00000000-0000-4000-8000-000000000001" };

function activity(over: Record<string, unknown> = {}) {
  return {
    hasWorkerProfile: true,
    completenessPct: 60,
    stepsDone: 3,
    stepsTotal: 5,
    steps: {
      about: true,
      skills: true,
      languages: true,
      availability: false,
      workHistory: false,
    },
    events: [],
    ...over,
  };
}

beforeEach(() => {
  getUserMock.mockReset();
  activityMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: USER } });
});

describe("identity is server-derived", () => {
  it("passes the SESSION user id to the read model — never a caller-supplied one", async () => {
    activityMock.mockResolvedValue(activity());
    await loadProfileSummaryForChat("profile");
    expect(activityMock).toHaveBeenCalledWith(USER.id);
  });

  it("no session ⇒ an honest blocked message, not an empty summary", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await loadProfileSummaryForChat("profile");
    expect(res).toEqual({
      kind: "blocked",
      message: "conversation.summary.blockedNotSignedIn",
    });
    expect(activityMock).not.toHaveBeenCalled();
  });
});

describe("honest degradation", () => {
  it("an account with no worker profile is told so, not reported as 0 of 5", async () => {
    activityMock.mockResolvedValue(activity({ hasWorkerProfile: false }));
    const res = await loadProfileSummaryForChat("profile");
    expect(res).toEqual({
      kind: "blocked",
      message: "conversation.summary.blockedNoWorker",
    });
  });
});

describe("the facts are the read model's, named not counted", () => {
  it("splits the canonical checkpoints into done and missing", async () => {
    activityMock.mockResolvedValue(activity());
    const res = await loadProfileSummaryForChat("profile");
    if (res.kind !== "summary") throw new Error("expected summary");
    expect(res.done).toEqual([
      "conversation.journal.steps.about",
      "conversation.journal.steps.skills",
      "conversation.journal.steps.languages",
    ]);
    expect(res.missing).toEqual([
      "conversation.journal.steps.availability",
      "conversation.journal.steps.workHistory",
    ]);
  });

  it("what is missing is NAMED — the payload is never just a percentage", async () => {
    activityMock.mockResolvedValue(activity());
    const res = await loadProfileSummaryForChat("profile");
    if (res.kind !== "summary") throw new Error("expected summary");
    const blob = JSON.stringify(res);
    expect(blob).not.toMatch(/completenessPct|"pct"|60%/);
    expect(res.missing.length).toBeGreaterThan(0);
  });

  it("a fabricated 'done' is impossible — false checkpoints land in missing", async () => {
    activityMock.mockResolvedValue(
      activity({
        stepsDone: 0,
        steps: {
          about: false,
          skills: false,
          languages: false,
          availability: false,
          workHistory: false,
        },
      }),
    );
    const res = await loadProfileSummaryForChat("profile");
    if (res.kind !== "summary") throw new Error("expected summary");
    expect(res.done).toEqual([]);
    expect(res.missing).toHaveLength(5);
  });
});

describe("one real state, three openings", () => {
  it("the FACTS are identical across variants — only the intro differs", async () => {
    activityMock.mockResolvedValue(activity());
    const [profile, next, resume] = await Promise.all([
      loadProfileSummaryForChat("profile"),
      loadProfileSummaryForChat("next"),
      loadProfileSummaryForChat("resume"),
    ]);
    if (profile.kind !== "summary" || next.kind !== "summary" || resume.kind !== "summary") {
      throw new Error("expected summaries");
    }
    expect(next.done).toEqual(profile.done);
    expect(resume.done).toEqual(profile.done);
    expect(next.missing).toEqual(profile.missing);
    expect(resume.missing).toEqual(profile.missing);
    expect(profile.intro).toBe(
      'conversation.summary.introProfile({"done":3,"total":5})',
    );
    expect(next.intro).toBe('conversation.summary.introNext({"done":3,"total":5})');
    expect(resume.intro).toBe(
      'conversation.summary.introResume({"done":3,"total":5})',
    );
  });

  it("re-reading the same state yields the same answer — continuity is the DB, not a script", async () => {
    activityMock.mockResolvedValue(activity());
    const first = await loadProfileSummaryForChat("resume");
    const second = await loadProfileSummaryForChat("resume");
    expect(second).toEqual(first);
    // Two independent turns, two independent reads: nothing is cached in the
    // client thread, which is exactly why a reload or a fresh login is fine.
    expect(activityMock).toHaveBeenCalledTimes(2);
  });

  it("a complete profile never gets a 'what is missing' opening", async () => {
    activityMock.mockResolvedValue(
      activity({
        stepsDone: 5,
        completenessPct: 100,
        steps: {
          about: true,
          skills: true,
          languages: true,
          availability: true,
          workHistory: true,
        },
      }),
    );
    const profile = await loadProfileSummaryForChat("profile");
    const next = await loadProfileSummaryForChat("next");
    if (profile.kind !== "summary" || next.kind !== "summary") {
      throw new Error("expected summaries");
    }
    expect(profile.missing).toEqual([]);
    expect(profile.intro).toBe("conversation.summary.introComplete");
    expect(next.intro).toBe("conversation.summary.introCompleteNext");
  });
});

describe("last activity is real or absent", () => {
  it("reports the stored event and its date", async () => {
    activityMock.mockResolvedValue(
      activity({ events: [{ key: "languageAdded", at: "2026-07-20T09:30:00.000Z" }] }),
    );
    const res = await loadProfileSummaryForChat("resume");
    if (res.kind !== "summary") throw new Error("expected summary");
    expect(res.lastActivity).toContain("conversation.summary.lastActivity");
    expect(res.lastActivity).toContain("conversation.journal.events.languageAdded");
  });

  it("no activity ⇒ null, never an invented 'recently active' line", async () => {
    activityMock.mockResolvedValue(activity({ events: [] }));
    const res = await loadProfileSummaryForChat("resume");
    if (res.kind !== "summary") throw new Error("expected summary");
    expect(res.lastActivity).toBeNull();
  });

  it("an unparseable stored timestamp degrades to null, never to a bogus date", async () => {
    activityMock.mockResolvedValue(
      activity({ events: [{ key: "skillsConfirmed", at: "not-a-date" }] }),
    );
    const res = await loadProfileSummaryForChat("resume");
    if (res.kind !== "summary") throw new Error("expected summary");
    expect(res.lastActivity).toBeNull();
  });
});
