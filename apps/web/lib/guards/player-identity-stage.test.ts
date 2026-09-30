import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildIdentityFacts } from "@/lib/player-card/identity-facts";
import type { WorkPeriodTotals } from "@/lib/journal/work-intelligence";

/**
 * THE PROFESSIONAL PLAYER CARD IDENTITY STAGE (owner command 2026-09-29 §6–§9).
 *
 * Pins the new floor: the person is shown at portrait scale on BOTH identity
 * surfaces (the card and the profile hub) through ONE stage; EVERY profession
 * is named (0/1/N — never narrowed to one); the fact strip carries only the
 * journal's own all-time figures in their own units — never a score.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
/** Code only — the doc comments legitimately NAME what is banned. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const STAGE = read("components/app/player-card/identity-stage.tsx");
const CARD = read("components/app/worker-player-card.tsx");
const HUB = read("components/app/profile-hub-overview.tsx");
const LABELS = read("lib/player-card/labels.ts");
const READER = read("lib/player-card/player-card.ts");

const totals = (p: Partial<WorkPeriodTotals>): WorkPeriodTotals =>
  ({
    key: "all",
    startIso: null,
    endIso: "2026-09-29",
    hours: 0,
    dayUnits: 0,
    confirmedHours: 0,
    confirmedDayUnits: 0,
    entries: 0,
    entriesWithoutDuration: 0,
    entriesDayInferred: 0,
    daysWorked: 0,
    ...p,
  }) as WorkPeriodTotals;
const t = (key: string, v?: { count: number }) => (v ? `${key}:${v.count}` : key);

describe("the fact strip", () => {
  it("states the journal's recorded / confirmed hours and days, each in its own unit", () => {
    const f = buildIdentityFacts({
      allTime: totals({ hours: 1284, confirmedHours: 936, daysWorked: 160 }),
      truncated: false,
      locale: "en",
      t,
    });
    expect(f.map((x) => [x.value, x.label])).toEqual([
      ["1,284", "recorded"],
      ["936", "confirmed"],
      ["160", "days:160"],
    ]);
  });

  it("a truncated read says 'at least', never a total it did not count", () => {
    const f = buildIdentityFacts({ allTime: totals({ hours: 10, daysWorked: 2 }), truncated: true, locale: "en", t });
    expect(f[0].value).toBe("≥ 10");
  });

  it("nothing recorded / not read → no strip, never three zeros", () => {
    expect(buildIdentityFacts({ allTime: totals({}), truncated: false, locale: "en", t })).toEqual([]);
    expect(buildIdentityFacts({ allTime: null, truncated: false, locale: "en", t })).toEqual([]);
  });
});

describe("the stage", () => {
  it("is used by both identity surfaces — one person, one stage", () => {
    expect(CARD).toMatch(/<IdentityStage/);
    expect(HUB).toMatch(/<IdentityStage/);
    expect(HUB).not.toMatch(/<AvatarDisplay/);
  });

  it("renders every profession it is given, and the reader gives all of them", () => {
    expect(STAGE).toMatch(/professions\.map\(/);
    expect(READER).toMatch(/professions: professionEntries,/);
    expect(LABELS).toMatch(/card\.professions/);
    expect(LABELS).toMatch(/professionDisplayName\(/);
  });

  it("carries no score, no rating, no percentage", () => {
    for (const src of [code(STAGE), code(read("lib/player-card/identity-facts.ts"))]) {
      expect(src).not.toMatch(/\/100|stars?\b.*rating|%\s*\}|score/i);
    }
  });

  it("the portrait is a real photo or the shared monogram — never a synthesised face", () => {
    expect(STAGE).toMatch(/avatarUrl \?/);
    expect(STAGE).toMatch(/PLAYER_IDENTITY_FALLBACK_SURFACE/);
    expect(code(STAGE)).not.toMatch(/placeholder|unsplash|pravatar|randomuser/i);
  });

  it("working-now is current engagements only — an ended organization stays in history", () => {
    expect(LABELS).toMatch(/\.filter\(\(h\) => h\.current\)/);
    expect(HUB).toMatch(/\.filter\(\(h\) => h\.current\)/);
  });

  it("the card transforms through its modes under ONE identity stage — IDENTITY is the card CLOSED", () => {
    const MODES = read("components/app/player-card/player-card-modes.tsx");
    expect(read("lib/player-card/card-modes.ts")).toContain('["identity", "work", "skills", "evidence", "history", "next"]');
    expect(CARD).toMatch(/<PlayerCardModes/);
    // Owner direction 2026-09-30 ("one central object, information opening
    // on demand — not everything at once"): closed, the person IS the card.
    // (Until then IDENTITY rendered every section at once — a 2 000 px wall.)
    const flat = CARD.replace(/\s+/g, "");
    expect(flat).toContain("identity:null,");
    // Nothing is lost: every section is still one lens away.
    for (const sec of ["secA", "secB", "secC", "secE", "secF", "secG", "secH", "secI", "secJ", "secEvidenceChart", "secSkillChart", "secMobility"]) {
      const lensBody = flat.slice(flat.indexOf("identity:null,"), flat.indexOf("}}/>"));
      expect(lensBody, `${sec} reachable through a lens`).toContain(`{${sec}}`);
    }
    // Each lens opens in the owner's order.
    expect(flat).toContain("work:(<>{secJ}{secG}{secEvidenceChart}{secF}{secWorkDoor}</>)");
    expect(flat).toContain("next:(<>{secB}{secMobility}{secA}{secI}{secNextDoor}</>)");
    // A closed card shows no empty panel.
    expect(MODES.replace(/\s+/g, "")).toContain("{sections[mode]?(");
    // The identity stage sits OUTSIDE the switching body — the person is the constant.
    expect(CARD.indexOf("<IdentityStage")).toBeLessThan(CARD.indexOf("<PlayerCardModes"));
    // The switcher reads nothing; the public sample never writes the URL.
    expect(MODES).not.toMatch(/supabase|fetch\(|\.from\(/);
    expect(CARD).toContain("syncUrl={!sample}");
  });
});

describe("the company-side person page speaks the same identity language", () => {
  const PERSON = read("app/[locale]/dashboard/people/[workerId]/page.tsx");
  it("uses the ONE identity stage — no private avatar tile", () => {
    expect(PERSON).toMatch(/<IdentityStage/);
    expect(PERSON).not.toMatch(/flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-ink-500 bg-ink-700/);
  });
  it("shows no hours strip: the viewer reads only their own organization's entries", () => {
    const stage = PERSON.slice(PERSON.indexOf("<IdentityStage"), PERSON.indexOf("</IdentityStage>"));
    expect(stage).not.toMatch(/facts=/);
    expect(stage).toMatch(/\.filter\(\(e\) => e\.current\)/);
  });
});
