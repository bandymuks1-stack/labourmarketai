import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  appendAiClaims,
  confirmedClaimLabels,
  hasAnyCvImportProposal,
  markSavedClaims,
  persistedClaimLabels,
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

  it("a save response does not acknowledge another claim selected while it was pending", () => {
    const claims = proposeFromCvText(CV_TEXT, new Set()).claims.map(c => ({ ...c, status: "confirmed" as const }));
    expect(claims.length).toBeGreaterThan(1);
    const saved = markSavedClaims(claims, [claims[0]!.label]);
    expect(saved[0]!.status).toBe("saved");
    expect(saved.slice(1).every(c => c.status === "confirmed")).toBe(true);
    expect(claims.every(c => c.status === "confirmed")).toBe(true);
  });

  it("pending and discarded claims stay unconfirmed even when labels repeat", () => {
    const claims = proposeFromCvText(CV_TEXT, new Set()).claims;
    const discarded = claims.map(c => ({ ...c, status: "discarded" as const }));
    expect(markSavedClaims(claims, claims.map(c => c.label))).toEqual(claims);
    expect(markSavedClaims(discarded, claims.map(c => c.label))).toEqual(discarded);
  });

  it("a bounded save acknowledges only the persisted subset of this submission", () => {
    const labels = Array.from({ length: 14 }, (_, i) => `Įgūdis ${i}`);
    const rows = labels.slice(0, 12).map(label => ({ normalized_label: label.toLowerCase() }));
    rows.push({ normalized_label: "another pre-existing claim" });
    expect(persistedClaimLabels(labels, rows)).toEqual(labels.slice(0, 12));
    expect(persistedClaimLabels(["  Namų   statyba "], [{ normalized_label: "namų statyba" }])).toEqual(["  Namų   statyba "]);
    expect(persistedClaimLabels(["a".repeat(81)], [{ normalized_label: "a".repeat(80) }])).toEqual([]);
  });

  it("AI proposals fit the canonical store before the person confirms them", () => {
    expect(appendAiClaims([], ["a".repeat(81)], new Set())).toEqual([]);
    const out = appendAiClaims([], ["  Namų   statyba ", "Namų statyba"], new Set());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ label: "Namų statyba", value: "namų statyba" });
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

  it("document imports do not cross the composed-profile AI boundary", () => {
    const hook = codeOnly(read("components/app/use-cv-import-proposals.ts"));
    expect(hook).toMatch(/source: "profile_text" \| "cv_document" = "cv_document"/);
    expect(hook).toMatch(/if \(p.status === "ok" && source === "profile_text"\) \{\s*void aiCvStructuringSuggestions/);
    expect(profile).toContain('analyse(v, "cv_document")');
    expect(profile).toContain('cvProposals.propose(raw, source)');
    expect(profile).toContain('source: "profile_text" | "cv_document" = textSource.current');
    expect(profile).toContain("textSource.current = source");
    expect(profile).toMatch(/const saved = await cvProposals\.saveConfirmed\(confirmedClaims\);\s*if \(id !== importRun.current\) return/);
  });

  it("the chat proposes claims on extraction and saves only on the person's own click", () => {
    const onExtracted = chat.slice(chat.indexOf("function onExtracted"), chat.indexOf("async function saveClaims"));
    expect(onExtracted).toMatch(/proposals\.propose\(text\)/);
    expect(onExtracted).not.toMatch(/saveConfirmed|promote\(/);
    expect(chat).toMatch(/<DetectedSuggestionCard[\s\S]{0,400}onConfirm=\{\(\) => proposals\.toggle\(it\.key, "confirmed"\)\}/);
    expect(chat).toMatch(/onClick=\{saveClaims\}/);
    expect(chat).toMatch(/const saved = await proposals\.saveConfirmed\(labels\)[\s\S]{0,300}await proposals\.promote\(saved\)/);
    // The section review remains the canonical component.
    expect(chat).toMatch(/<CvImportSectionReview proposals=\{sections\} aiProposals=\{proposals\.aiSections\} \/>/);
  });
});
