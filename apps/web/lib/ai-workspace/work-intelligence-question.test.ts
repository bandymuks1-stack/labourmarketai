import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deriveWorkIntelligence,
  type WorkIntelligence,
  type WorkIntelligenceEntry,
  type WorkPeriodKey,
} from "@/lib/journal/work-intelligence";

/**
 * "Kiek programavau?" / "kokius įgūdžius naudoju daugiausia?" / "kokia
 * veikla užima daugiausia laiko?" / "kas patvirtinta?" — BEHAVIOUR tests of
 * `runWorkIntelligenceQuestion` (issue #1689, owner chat lines 2–5, 7).
 *
 * The model is the REAL `deriveWorkIntelligence` over constructed rows —
 * the owner's own day ("5 val. programavau, 2 val. testavau, 2 val.
 * ieškojau partnerių") plus an approved tiling day — so what is asserted is
 * what the chat DOES with the same figures the section renders: every
 * answer names its window and its denominator, a share is "of N attributed
 * hours", the unlabelled hours are named, a subject the recognizer knows
 * but the window does not carry is answered honestly, and a subject it
 * cannot read falls back to the plain period answer instead of a guess.
 *
 * i18n is stubbed as `key(values)` so a test sees WHICH key was chosen and
 * WITH WHICH figures.
 */

const wiMock = vi.fn();
const recentMock = vi.fn();

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "lt"),
  getTranslations: vi.fn(async (ns: string) => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${ns}.${key}(${JSON.stringify(values)})` : `${ns}.${key}`;
    (t as unknown as { has: (k: string) => boolean }).has = (k: string) =>
      ns === "skillNames" ? k === "programming" : ns === "professions" ? k === "software_developer" : false;
    return t;
  }),
}));

vi.mock("@/lib/journal/work-intelligence-read", () => ({
  loadOwnWorkIntelligence: (...a: unknown[]) => wiMock(...a),
}));

// The plain period answer the skill door falls back to. Stubbed by spying on
// the module's own export is not possible for an internal call, so the
// fallback is observed through the planning read it makes.
vi.mock("@/lib/planning/planning", () => ({
  getPlanning: (...a: unknown[]) => recentMock(...a),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

const { runWorkIntelligenceQuestion } = await import("./workflows");

const TODAY = "2026-09-11";

type Row = { metric_slug: string; value_text: string | null; value_numeric: number | null; unit_slug: string | null; source?: string };
const time = (index: number, hours: number): Row => ({
  metric_slug: "fragment_time",
  value_text: String(index),
  value_numeric: hours,
  unit_slug: "hours",
  source: "ai_extracted",
});
const activity = (index: number, key: string): Row => ({
  metric_slug: "fragment_activity",
  value_text: `${index}|${key}`,
  value_numeric: null,
  unit_slug: null,
});
const fragmentSkill = (index: number, slug: string): Row => ({
  metric_slug: "fragment_skill",
  value_text: `${index}|${slug}`,
  value_numeric: null,
  unit_slug: null,
});
const workDate = (iso: string): Row => ({ metric_slug: "work_date", value_text: iso, value_numeric: null, unit_slug: null });
const output = (value: number, unit: string): Row => ({
  metric_slug: "quantity",
  value_text: null,
  value_numeric: value,
  unit_slug: unit,
  source: "ai_extracted",
});

function entry(
  id: string,
  day: string,
  metrics: Row[],
  linked: string[],
  reviewResult: WorkIntelligenceEntry["reviewResult"] = "submitted",
): WorkIntelligenceEntry {
  return {
    entryId: id,
    createdAt: `${day}T09:00:00.000Z`,
    metrics: [workDate(day), ...metrics].map((m) => ({ ...m, created_at: `${day}T09:00:00.000Z` })),
    engagementContextId: null,
    reviewResult,
    linkedSkillIds: linked,
  };
}

/** The owner's day + an approved tiling day, through the real model. */
function model(focus: WorkPeriodKey = "all"): WorkIntelligence {
  return deriveWorkIntelligence({
    todayIso: TODAY,
    focus,
    skills: [
      { skillId: "s-prog", slug: "programming", verified: false, source: null },
      { skillId: "s-part", slug: "partnership-development", verified: false, source: null },
      { skillId: "s-tile", slug: "tiling", verified: true, source: null },
    ],
    entries: [
      // "Šiandien 9 valandas dirbau LabourMarket.ai: 5 val. programavau,
      // 2 val. testavau, 2 val. ieškojau partnerių." — two days ago.
      entry(
        "e-owner",
        "2026-09-09",
        [
          time(1, 5),
          time(2, 2),
          time(3, 2),
          activity(1, "software_developer"),
          activity(3, "Partnerių paieška"),
          fragmentSkill(1, "programming"),
          fragmentSkill(3, "partnership-development"),
        ],
        ["s-prog", "s-part"],
      ),
      // An approved tiling day with an output, 40 days ago (outside "month").
      entry("e-tile", "2026-08-02", [time(1, 8), activity(1, "tiler"), output(36, "pallets")], ["s-tile"], "approved"),
    ],
  });
}

beforeEach(() => {
  wiMock.mockReset();
  recentMock.mockReset();
  wiMock.mockImplementation(async (opts?: { focus?: WorkPeriodKey }) => model(opts?.focus ?? "all"));
});

describe("line 2 — 'Kiek programavau?' answers the ONE skill, naming window and denominator", () => {
  it("attributed hours of the recognised skill out of the total recorded, all time when no period is named", async () => {
    const r = await runWorkIntelligenceQuestion("Kiek programavau?", "journal-skill");
    expect(r.kind).toBe("answer");
    const text = r.kind === "answer" ? r.text : "";
    expect(text).toContain("workspace.ai.wiSkillHours(");
    // 5 h of the 17 h recorded (9 + 8), all time, 0 confirmed — the label
    // is the catalogue name because `skillNames.has("programming")`.
    expect(text).toContain('"skill":"skillNames.programming"');
    expect(text).toContain('"hours":"5"');
    expect(text).toContain('"total":"17"');
    expect(text).toContain('"period":"workspace.ai.journalPeriod_all"');
    expect(text).toContain('"confirmed":"0"');
    // Where: 1 entry, 1 day, no named context, last on 09-09.
    expect(text).toContain("workspace.ai.wiSkillWhere(");
    expect(text).toContain('"entries":1');
    expect(text).toContain('"day":"09-09"');
    // The source entries are one chip away through the journal's own drill-down.
    const chips = r.kind === "answer" ? (r.chips ?? []) : [];
    expect(chips.map((c) => c.id)).toContain("journal-entries:programming:all");
    expect(chips.map((c) => c.id)).toContain("journal-numbers");
    expect(wiMock).toHaveBeenCalledWith({ focus: "all" });
  });

  it("the named period scopes the model and the answer says which", async () => {
    const r = await runWorkIntelligenceQuestion("Kiek programavau šį mėnesį?", "journal-skill");
    const text = r.kind === "answer" ? r.text : "";
    expect(wiMock).toHaveBeenCalledWith({ focus: "month" });
    // Within 30 days only the owner's day: 9 h recorded.
    expect(text).toContain('"total":"9"');
    expect(text).toContain('"period":"workspace.ai.journalPeriod_month"');
  });

  it("a kind of work the recognizer reads as an activity answers from the activity list", async () => {
    const r = await runWorkIntelligenceQuestion("Kiek klojau plyteles?", "journal-skill");
    const text = r.kind === "answer" ? r.text : "";
    // "tiling" is a catalogue skill on the person (8 h attributed) — the
    // skill answer wins; the activity path is exercised next.
    expect(text).toContain("workspace.ai.wiSkillHours(");
    expect(text).toContain('"hours":"8"');
    expect(text).toContain('"confirmed":"8"');
  });

  it("without a declared skill for it, the kind of work answers from the activity list", async () => {
    // The same rows, but the person never declared "tiling": the entry's
    // own activity label ("tiler", 8 h) is what the question can be
    // answered from — hours OF the total, never a skill figure invented.
    wiMock.mockImplementation(async (opts?: { focus?: WorkPeriodKey }) => {
      const m = model(opts?.focus ?? "all");
      return { ...m, skills: m.skills.filter((sk) => sk.slug !== "tiling") };
    });
    const r = await runWorkIntelligenceQuestion("Kiek klojau plyteles?", "journal-skill");
    const text = r.kind === "answer" ? r.text : "";
    expect(text).toContain(
      'workspace.ai.wiActivityHours({"activity":"tiler","hours":"8","total":"17","period":"workspace.ai.journalPeriod_all","entries":1,"day":"08-02"})',
    );
  });

  it("a subject the recognizer knows but this window does not carry is answered honestly", async () => {
    // Tiling was 40 days ago: nothing in the last 30 days.
    const r = await runWorkIntelligenceQuestion("Kiek klojau plyteles šį mėnesį?", "journal-skill");
    const text = r.kind === "answer" ? r.text : "";
    expect(text).toContain("workspace.ai.wiSkillHours(");
    expect(text).toContain('"hours":"0"');
    expect(text).toContain("workspace.ai.wiSkillNoEntries(");
    // No source-entries chip for a skill with no entry in the window.
    const chips = r.kind === "answer" ? (r.chips ?? []) : [];
    expect(chips.map((c) => c.id)).not.toContain("journal-entries:tiling:month");
  });

  it("a subject the recognizer cannot read falls back to the plain period answer, never a guess", async () => {
    recentMock.mockResolvedValue({ status: "ok", items: [] });
    const r = await runWorkIntelligenceQuestion("Kiek bandžiau?", "journal-skill");
    // The fallback is `runRecentJournal`, observed through its planning read.
    expect(recentMock).toHaveBeenCalled();
    expect(r.kind).toBe("answer");
    const text = r.kind === "answer" ? r.text : "";
    expect(text).not.toContain("wiSkillHours");
  });
});

describe("line 5 — 'kokius įgūdžius naudoju daugiausia?' names the attributed denominator (F3)", () => {
  it("lists skills with attributed hours as a share OF the attributed hours, and names the rest", async () => {
    const r = await runWorkIntelligenceQuestion("Kokius įgūdžius naudoju daugiausia?", "journal-skills-top");
    const text = r.kind === "answer" ? r.text : "";
    // 15 h attributed (8 tiling + 5 programming + 2 partnerships) of 17 h.
    expect(text).toContain('workspace.ai.wiSkillsIntro({"period":"workspace.ai.journalPeriod_all","attributed":"15","total":"17","entries":2})');
    // Intl formats the percent with a non-breaking space in lt.
    expect(text).toMatch(/"skill":"skillNames\.programming","hours":"5","pct":"33\s%","attributed":"15","confirmed":"0","shared":"2"/);
    // The unlinked 2 h ("testavau", no skill) are named, not hidden.
    expect(text).toContain("workspace.ai.wiSkillsRemainder(");
    expect(text).toContain('"unlinked":"0"');
    expect(text).toContain('"shared":"2"');
  });
});

describe("line 4 — 'kokia veikla užima daugiausia laiko?' names the labelled coverage (F2)", () => {
  it("shares are of ALL recorded time and the unlabelled hours are named", async () => {
    const r = await runWorkIntelligenceQuestion("Kokia veikla užima daugiausia mano laiko?", "journal-activities-top");
    const text = r.kind === "answer" ? r.text : "";
    // 15 h carry a kind of work (8 tiler + 5 software_developer + 2 partnerships) of 17 h.
    expect(text).toContain('workspace.ai.wiActivitiesIntro({"period":"workspace.ai.journalPeriod_all","labelled":"15","total":"17"})');
    // Profession slugs are named through the catalogue; a free label stays as typed.
    expect(text).toMatch(/"activity":"professions\.software_developer","hours":"5","pct":"29\s%","entries":1/);
    expect(text).toMatch(/"activity":"tiler","hours":"8","pct":"47\s%"/);
    expect(text).toContain('"activity":"Partnerių paieška","hours":"2"');
    expect(text).toContain('workspace.ai.wiActivitiesUnlabelled({"hours":"2"})');
  });
});

describe("line 7 — 'kas patvirtinta?' names confirmed hours and entries of the total", () => {
  it("confirmed hours of recorded hours, confirmed entries of entries, by skill", async () => {
    const r = await runWorkIntelligenceQuestion("Kas patvirtinta?", "journal-confirmed");
    const text = r.kind === "answer" ? r.text : "";
    expect(text).toContain(
      'workspace.ai.wiConfirmedHours({"period":"workspace.ai.journalPeriod_all","confirmed":"8","total":"17","confirmedEntries":1,"entries":2})',
    );
    expect(text).toContain("workspace.ai.wiConfirmedSkills(");
    expect(text).toContain('wiConfirmedSkillItem({\\"skill\\":\\"tiling\\",\\"hours\\":\\"8\\"})');
  });

  it("no confirmation in the window is said as such — the person's own record, never a hidden zero", async () => {
    const r = await runWorkIntelligenceQuestion("Kas patvirtinta šį mėnesį?", "journal-confirmed");
    const text = r.kind === "answer" ? r.text : "";
    expect(text).toContain('workspace.ai.wiConfirmedNone({"period":"workspace.ai.journalPeriod_month","total":"9","entries":1})');
  });
});

describe("honesty", () => {
  it("an unreadable model is blocked, not answered with zeros", async () => {
    wiMock.mockResolvedValue(null);
    const r = await runWorkIntelligenceQuestion("Kas patvirtinta?", "journal-confirmed");
    expect(r.kind).toBe("blocked");
    expect(r.kind === "blocked" ? r.text : "").toBe("workspace.ai.wiUnread");
  });

  it("an empty window is the empty-period answer with the log-work door", async () => {
    const r = await runWorkIntelligenceQuestion("Kokius įgūdžius naudoju daugiausia šiandien?", "journal-skills-top");
    expect(r.kind).toBe("answer");
    expect(r.kind === "answer" ? r.text : "").toBe(
      'workspace.ai.journalEmptyPeriod({"period":"workspace.ai.journalPeriod_today"})',
    );
  });
});
