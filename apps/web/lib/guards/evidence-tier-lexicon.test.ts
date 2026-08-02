import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  deriveEvidenceTier,
  sourceToEvidence,
  EVIDENCE_TIER_RANK,
} from "@/lib/evidence/evidence-tier";

/**
 * W6 slice 1 guard — ONE evidence-tier vocabulary, ONE derivation.
 *
 * 1. Every locale carries the canonical `evidenceTier` namespace (complete).
 * 2. The skill-tier FACT keys across surfaces equal the canonical values —
 *    the same fact may never wear different words on different surfaces.
 * 3. The banned wordings ("Linked skills" for a manager-verified count,
 *    "Marked accurate by others", any star/score/reputation language) never
 *    return to tier labels.
 * 4. All public mappers derive from the ONE canonical module.
 * 5. `confidence_score` is never rendered; tier words never become a person
 *    reputation / trust score.
 */

const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

const MONOLITH_LOCALES = readdirSync(join(WEB, "messages")).filter((f) =>
  f.endsWith(".json"),
);
const LAUNCH = ["lt.json", "en.json", "ru.json", "nl.json", "de.json"];

type Messages = Record<string, unknown>;
const load = (f: string): Messages =>
  JSON.parse(read(join("messages", f))) as Messages;
const at = (d: Messages, path: string): unknown =>
  path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], d);

const TIER_KEYS = [
  "managerConfirmed",
  "workJournal",
  "selfDeclared",
  "autoConfirmQualifier",
  "binLegendTitle",
  "binLegendRed",
  "binLegendGreen",
  "binLegendYellow",
] as const;

describe("canonical evidenceTier namespace", () => {
  it("exists and is complete in EVERY locale", () => {
    for (const f of MONOLITH_LOCALES) {
      const d = load(f);
      for (const k of TIER_KEYS) {
        const v = at(d, `evidenceTier.${k}`);
        expect(typeof v, `${f} evidenceTier.${k}`).toBe("string");
        expect((v as string).trim().length, `${f} evidenceTier.${k}`).toBeGreaterThan(0);
      }
    }
  });

  it("skill-tier FACT keys equal the canonical values (one vocabulary)", () => {
    // Keys asserting the manager_confirmed fact / work_journal fact /
    // self_declared fact on user surfaces.
    const MC = [
      "people.skillVerified",
      "cvExport.tiers.confirmed",
      "playerCard.visuals.skillsTierVerified",
      "workerEvidence.confirmed",
      "marketMap.capabilities.status.confirmed",
    ];
    const WJ = [
      "cvExport.tiers.evidence",
      "playerCard.journalSupportedLabel",
      "people.skillWorkBacked",
    ];
    const SD = ["cvExport.tiers.declared", "people.skillDeclared"];
    for (const f of LAUNCH) {
      const d = load(f);
      const mc = at(d, "evidenceTier.managerConfirmed") as string;
      const wj = at(d, "evidenceTier.workJournal") as string;
      const sd = at(d, "evidenceTier.selfDeclared") as string;
      for (const p of MC) {
        const v = at(d, p);
        if (typeof v === "string") expect(v, `${f} ${p}`).toBe(mc);
      }
      for (const p of WJ) {
        const v = at(d, p);
        if (typeof v === "string") expect(v, `${f} ${p}`).toBe(wj);
      }
      for (const p of SD) {
        const v = at(d, p);
        if (typeof v === "string") expect(v, `${f} ${p}`).toBe(sd);
      }
    }
  });

  it("the misleading wordings never return", () => {
    const banned = [/linked skills/i, /marked accurate by others/i, /susieti įgūdžiai/i];
    const paths = [
      "trust.verifiedSkills",
      "workerReadiness.confirmedSkills",
      "cvExport.summary.verifiedSkills",
      "playerCard.visuals.skillsTierVerified",
    ];
    for (const f of LAUNCH) {
      const d = load(f);
      for (const p of paths) {
        const v = at(d, p);
        if (typeof v !== "string") continue;
        for (const b of banned) expect(v, `${f} ${p}`).not.toMatch(b);
      }
    }
  });

  it("tier words never claim a person reputation / trust score", () => {
    const banned =
      /reputation|trust score|reitingas|reputacij|žvaigžd|patikimumo balas|star rating/i;
    for (const f of LAUNCH) {
      const d = load(f);
      const ns = at(d, "evidenceTier") as Record<string, string>;
      for (const [k, v] of Object.entries(ns)) {
        expect(v, `${f} evidenceTier.${k}`).not.toMatch(banned);
      }
    }
  });
});

describe("one canonical derivation module", () => {
  it("derives the ladder from row truth only", () => {
    expect(deriveEvidenceTier({ verified: true, source: "self_declared" })).toBe(
      "manager_confirmed",
    );
    expect(deriveEvidenceTier({ verified: false, source: "work_journal" })).toBe("work_journal");
    // The inconsistent row: manager_confirmed source WITHOUT the flag never
    // reaches the top rung through the canonical derivation.
    expect(deriveEvidenceTier({ verified: false, source: "manager_confirmed" })).toBe(
      "self_declared",
    );
    expect(sourceToEvidence("manager_confirmed")).toBe("manager_confirmed");
    expect(EVIDENCE_TIER_RANK.manager_confirmed).toBeGreaterThan(EVIDENCE_TIER_RANK.work_journal);
  });

  it("every public mapper derives from the ONE module (no parallel interpretation)", () => {
    // The four former parallel sites now import the canonical module.
    for (const p of [
      "lib/market/match-v1.ts",
      "lib/player-card/evidence-visuals.ts",
      "lib/cv-export/skill-tiers.ts",
      "app/[locale]/dashboard/people/[workerId]/page.tsx",
    ]) {
      expect(read(p), p).toMatch(/@\/lib\/evidence\/evidence-tier/);
    }
    // And no file re-grows the inline row interpretation.
    for (const p of [
      "lib/player-card/evidence-visuals.ts",
      "app/[locale]/dashboard/people/[workerId]/page.tsx",
    ]) {
      expect(read(p), p).not.toMatch(/verified\s*\?\s*"verified"/);
    }
  });

  it("confidence_score is never rendered (regression pin)", () => {
    // The score is a write-only internal; only the bin's dots + legend render.
    const globs = ["components/app", "app"];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(WEB, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.(tsx|ts)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          const src = read(rel);
          if (/confidence_score|confidenceScore/.test(src)) offenders.push(rel);
        }
      }
    };
    for (const g of globs) walk(g);
    expect(offenders).toEqual([]);
  });
});
