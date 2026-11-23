import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  appendAiClaims,
  confirmedClaimLabels,
  hasAnyCvImportProposal,
  proposeFromCvText,
} from "@/lib/cv/cv-import-proposals";
import { extractProfileSkillClaims } from "@/lib/profile/skill-claim-extractor";

/**
 * CV-18 / G-10 — a CV imported in the CHAT proposes the same skill claims as
 * the profile's text-first flow, through the same confirm step (decision
 * 0023: inference kept, nothing auto-saved).
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*\n/g, "");

const CV_TEXT = [
  "Jonas Jonaitis",
  "Darbo patirtis",
  "2019 – 2023 UAB Statyba, statybininkas",
  "Moku programuoti ir statyti namus, kloju plyteles, dažau sienas.",
  "Išsilavinimas",
  "2015 – 2018 Vilniaus statybininkų rengimo centras",
].join("\n");

describe("one proposal rule for every CV door", () => {
  it("a CV text yields skill claims — the profile extractor's own claims, all pending", () => {
    const p = proposeFromCvText(CV_TEXT, new Set());
    expect(p.status).toBe("ok");
    const expected = extractProfileSkillClaims(CV_TEXT).map((c) => c.normalizedLabel);
    expect(expected.length).toBeGreaterThan(0);
    expect(p.claims.map((c) => c.value)).toEqual(expected);
    // Nothing is confirmed, let alone saved, by proposing.
    expect(p.claims.every((c) => c.status === "pending")).toBe(true);
    expect(confirmedClaimLabels(p.claims)).toEqual([]);
    expect(hasAnyCvImportProposal(p)).toBe(true);
  });

  it("a claim already saved is shown as saved, never offered twice", () => {
    const first = proposeFromCvText(CV_TEXT, new Set()).claims[0]!;
    const p = proposeFromCvText(CV_TEXT, new Set([first.value]));
    expect(p.claims.find((c) => c.value === first.value)?.status).toBe("already_saved");
  });

  it("only the person's confirmed claims are handed to the save", () => {
    const p = proposeFromCvText(CV_TEXT, new Set());
    const claims = p.claims.map((c, i) => (i === 0 ? { ...c, status: "confirmed" as const } : c));
    expect(confirmedClaimLabels(claims)).toEqual([p.claims[0]!.label]);
  });

  it("AI labels append as labelled pending claims, deduplicated", () => {
    const p = proposeFromCvText(CV_TEXT, new Set());
    const existing = p.claims[0]!.label;
    const out = appendAiClaims(p.claims, [existing, "Kranų valdymas", "  "], new Set());
    expect(out).toHaveLength(p.claims.length + 1);
    expect(out.at(-1)).toMatchObject({ label: "Kranų valdymas", status: "pending", aiOrigin: true });
  });

  it("an empty text proposes nothing", () => {
    expect(hasAnyCvImportProposal(proposeFromCvText("", new Set()))).toBe(false);
  });
});

describe("the chat CV flow uses the same proposals and the same confirm step", () => {
  const chat = codeOnly(read("components/app/conversation/worker-cv-flow.tsx"));
  const profile = codeOnly(read("components/app/profile-text-first-flow.tsx"));

  it("both flows take their proposals from the ONE hook", () => {
    for (const src of [chat, profile]) {
      expect(src).toMatch(/from "@\/components\/app\/use-cv-import-proposals"/);
      expect(src).toMatch(/useCvImportProposals\(/);
    }
    // No second extractor or parser call in the chat flow.
    expect(chat).not.toMatch(/extractProfileSkillClaims\(|parseCvSections\(/);
  });

  it("the chat proposes claims on extraction and saves only on the person's own click", () => {
    const onExtracted = chat.slice(chat.indexOf("function onExtracted"), chat.indexOf("async function saveClaims"));
    expect(onExtracted).toMatch(/proposals\.propose\(text\)/);
    expect(onExtracted).not.toMatch(/saveConfirmed|promote\(/);
    expect(chat).toMatch(/<DetectedSuggestionCard[\s\S]{0,400}onConfirm=\{\(\) => proposals\.toggle\(it\.key, "confirmed"\)\}/);
    expect(chat).toMatch(/onClick=\{saveClaims\}/);
    expect(chat).toMatch(/await proposals\.saveConfirmed\(labels\)[\s\S]{0,120}await proposals\.promote\(labels\)/);
    // The optional AI sections reach the chat's section review too.
    expect(chat).toMatch(/<CvImportSectionReview proposals=\{sections\} aiProposals=\{proposals\.aiSections\} \/>/);
  });
});
