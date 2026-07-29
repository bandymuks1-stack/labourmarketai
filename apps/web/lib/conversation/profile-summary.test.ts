import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Conversation profile summary — BEHAVIOUR tests.
 *
 * These run the REAL `loadProfileSummaryForChat()` with the canonical reads
 * stubbed, so what is asserted is what the conversation DOES with canonical
 * results:
 *   • identity is server-derived; no session ⇒ honest blocked message;
 *   • an account without a worker profile is told so, not reported as "0 done";
 *   • done/missing are the Player Card's SIX readiness pillars (W5: ONE
 *     completeness source), NAMED not counted, labelled with the SAME
 *     `playerCard.readinessSteps.pillar.*` keys the card renders;
 *   • the same real state answers "profile" / "next" / "resume" — only the
 *     opening line differs, which is what makes the answer survive a reload;
 *   • a complete profile gets a different opening, never a "what's missing"
 *     line with nothing after it;
 *   • last activity is the real stored event, and null when there is none.
 *
 * i18n is stubbed as `key(values)` so a test can see WHICH key was chosen.
 * `deriveWorkerReadiness` is REAL — the summary must agree with the card by
 * construction, not by a parallel stub.
 */

const getUserMock = vi.fn();
const activityMock = vi.fn();
const cardMock = vi.fn();

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

vi.mock("@/lib/player-card/player-card", () => ({
  getWorkerPlayerCard: (...a: unknown[]) => cardMock(...a),
}));

const { loadProfileSummaryForChat } = await import("./profile-summary");

const USER = { id: "00000000-0000-4000-8000-000000000001" };

/** The canonical pillar order (lib/player-card/readiness.ts). */
const PILLARS = [
  "profession",
  "availability",
  "skills",
  "journal",
  "evidence",
  "workCard",
] as const;

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

/** A card whose REAL readiness derivation meets the first `n` pillars in
 *  canonical order (so tests exercise the same module the card renders). */
function cardWithMet(n: number) {
  const met = (i: number) => i < n;
  return {
    displayName: "Dev Worker",
    skillsDeclared: met(2) ? 3 : 0,
    journalSupportedSkills: met(4) ? 2 : 0,
    candidateSkills: 0,
    evidenceEntries: met(3) ? 5 : 0,
    attentionInstructions: 0,
    workCardConfirmed: met(5),
    verifiedSkills: [],
    managerConfirmations: 0,
    availabilityStatus: met(1) ? "available" : null,
    availableFrom: null,
    professionSlug: met(0) ? "bricklayer" : null,
    latestEvidenceAt: null,
    workHistory: [],
  };
}

beforeEach(() => {
  getUserMock.mockReset();
  activityMock.mockReset();
  cardMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: USER } });
  cardMock.mockResolvedValue(cardWithMet(3));
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
    expect(cardMock).not.toHaveBeenCalled();
  });
});

describe("honest degradation", () => {
  it("an account with no worker profile is told so, not reported as 0 of N", async () => {
    activityMock.mockResolvedValue(activity({ hasWorkerProfile: false }));
    const res = await loadProfileSummaryForChat("profile");
    expect(res).toEqual({
      kind: "blocked",
      message: "conversation.summary.blockedNoWorker",
    });
  });

  it("a null card (no session-level card) blocks honestly too", async () => {
    activityMock.mockResolvedValue(activity());
    cardMock.mockResolvedValue(null);
    const res = await loadProfileSummaryForChat("profile");
    expect(res).toEqual({
      kind: "blocked",
      message: "conversation.summary.blockedNoWorker",
    });
  });
});

describe("the facts are the readiness model's, named not counted (W5 one source)", () => {
  it("splits the canonical pillars into done and missing with the card's labels", async () => {
    activityMock.mockResolvedValue(activity());
    cardMock.mockResolvedValue(cardWithMet(3));
    const res = await loadProfileSummaryForChat("profile");
    if (res.kind !== "summary") throw new Error("expected summary");
    expect(res.done).toEqual([
      "playerCard.readinessSteps.pillar.profession",
      "playerCard.readinessSteps.pillar.availability",
      "playerCard.readinessSteps.pillar.skills",
    ]);
    expect(res.missing).toEqual([
      "playerCard.readinessSteps.pillar.journal",
      "playerCard.readinessSteps.pillar.evidence",
      "playerCard.readinessSteps.pillar.workCard",
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

  it("a fabricated 'done' is impossible — unmet pillars land in missing", async () => {
    activityMock.mockResolvedValue(activity());
    cardMock.mockResolvedValue(cardWithMet(0));
    const res = await loadProfileSummaryForChat("profile");
    if (res.kind !== "summary") throw new Error("expected summary");
    expect(res.done).toEqual([]);
    expect(res.missing).toHaveLength(6);
  });
});

describe("one real state, three openings", () => {
  it("the FACTS are identical across variants — only the intro differs", async () => {
    activityMock.mockResolvedValue(activity());
    cardMock.mockResolvedValue(cardWithMet(3));
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
      'conversation.summary.introProfile({"done":3,"total":6})',
    );
    expect(next.intro).toBe('conversation.summary.introNext({"done":3,"total":6})');
    expect(resume.intro).toBe(
      'conversation.summary.introResume({"done":3,"total":6})',
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
    activityMock.mockResolvedValue(activity());
    cardMock.mockResolvedValue(cardWithMet(6));
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

describe("the 0/6 - 6/6 matrix stays consistent with the card", () => {
  for (const n of [0, 1, 2, 3, 4, 5, 6]) {
    it(`${n}/6 — counts, names and keys all agree with the derived readiness`, async () => {
      activityMock.mockResolvedValue(activity());
      cardMock.mockResolvedValue(cardWithMet(n));
      const res = await loadProfileSummaryForChat("profile");
      if (res.kind !== "summary") throw new Error("expected summary");

      // The counts the UI renders are the READINESS model's, not re-derived.
      expect(res.stepsDone).toBe(n);
      expect(res.stepsTotal).toBe(6);
      // …and they agree with the named lists, so the bar cannot contradict them.
      expect(res.done).toHaveLength(n);
      expect(res.missing).toHaveLength(6 - n);
      expect(res.missingKeys).toHaveLength(6 - n);
      // A met pillar never appears as missing.
      for (const key of res.missingKeys) {
        expect(PILLARS.indexOf(key)).toBeGreaterThanOrEqual(n);
      }
    });
  }

  it("the completion sentence only appears at 6/6", async () => {
    activityMock.mockResolvedValue(activity());
    cardMock.mockResolvedValue(cardWithMet(6));
    const full = await loadProfileSummaryForChat("profile");
    cardMock.mockResolvedValue(cardWithMet(5));
    const nearly = await loadProfileSummaryForChat("profile");
    if (full.kind !== "summary" || nearly.kind !== "summary") throw new Error("expected");
    expect(full.intro).toBe("conversation.summary.introComplete");
    expect(nearly.intro).toContain("introProfile");
    expect(full.missing).toEqual([]);
    expect(nearly.missing).toHaveLength(1);
  });
});
