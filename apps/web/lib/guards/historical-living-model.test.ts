import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PLAYER_IDENTITY_VARIANTS } from "@/lib/identity/player-identity";

/**
 * HISTORICAL REALITY → LIVING PERSON / TEAM / COMPANY — the post-#1748
 * owner command (2026-09-16 §3–§9, §14–§18) pinned structurally. The
 * premium player card is ONE identity across the product; the historical
 * field board is a projection, not a team; nothing here is a second
 * model of anything.
 */

const dir = path.resolve(__dirname, "../..");
/** Line endings normalised: a Windows checkout is CRLF, CI is LF, the anchors are one. */
const read = (p: string) => readFileSync(path.join(dir, p), "utf8").replace(/\r\n/g, "\n");
/** The code without its comments — the comments NAME what is forbidden. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const card = read("components/app/historical-player-card.tsx");
const board = read("components/app/historical-field-board.tsx");
const reconstruction = read("components/app/evidence-import-reconstruction.tsx");
const projections = read("lib/organization-evidence/import-projections.ts");
const semantics = read("lib/organization-evidence/time-semantics.ts");
const lt = JSON.parse(read("messages/lt.json")) as { evidenceImport: { reconstruction: Record<string, unknown> } };

describe("the premium player card is the ONE person identity, in its history-card variant", () => {
  it("is a registered variant of the canonical identity, not a bespoke card", () => {
    expect(PLAYER_IDENTITY_VARIANTS).toContain("history-card");
    expect(card).toMatch(/data-identity-variant="history-card"/);
    expect(card).toMatch(/playerInitials\(name\)/);
    expect(card).toMatch(/PLAYER_IDENTITY_AVATAR_BORDER/);
    expect(card).toMatch(/PLAYER_IDENTITY_FALLBACK_SURFACE/);
    // never a synthesised face, never an <img> from nowhere
    expect(card).not.toMatch(/<img|avatar\.(png|jpg|svg)|dicebear|robohash|gravatar/i);
  });
  it("carries the ONE provenance derivation — organization-reported evidence, never gold", () => {
    expect(card).toMatch(/<ProvenanceEdge provenanceClass="EVIDENCE_SUPPORTED" \/>/);
    expect(card).toMatch(/<ProvenanceLine provenanceClass="EVIDENCE_SUPPORTED"/);
    expect(code(card)).not.toMatch(/EMPLOYER_CONFIRMED|trust-accent|gold/);
  });
  it("shows evidence-backed facts only: hours, days, places, weeks, words, interpretations, unknowns — and no score", () => {
    for (const id of ["historical-player-figures", "historical-player-weeks", "historical-player-places", "historical-player-evidence", "historical-player-interpretations", "historical-player-unknowns"]) {
      expect(card, id).toContain(`data-testid="${id}"`);
    }
    expect(code(card)).not.toMatch(/\b(score|rating|rank|stars?|tier|percentile)\b/i);
    expect(card).not.toMatch(/ReadinessRing|CountUp|SkillEvidenceChart/);
  });
  it("says the person's CURRENT state is not inferred, and marks the card HISTORICAL", () => {
    expect(card).toMatch(/data-testid="historical-player-current"/);
    expect(card).toMatch(/labels\.historical/);
    expect(String(lt.evidenceImport.reconstruction.card && (lt.evidenceImport.reconstruction.card as Record<string, string>).currentNotInferred)).toMatch(/nenustatoma/);
    // No availability, employment, wage or location FIELD exists on the person projection.
    const personInterface = projections.slice(projections.indexOf("export interface PersonProjection"), projections.indexOf("export type PlaceProjectionState"));
    expect(code(personInterface)).not.toMatch(/availability|availableFrom|employed|wage|salary|locationCountry|current/i);
  });
  it("hours never become competency: no skill is written or shown from the import", () => {
    expect(code(card)).not.toMatch(/worker_skills|skills\b.*verified|competenc/i);
    expect(code(projections)).not.toMatch(/worker_skills|competency/);
  });
  it("aggregates are shown apart on the card and the period stays UNKNOWN unless stated", () => {
    expect(card).toMatch(/data-testid="historical-player-aggregate"/);
    expect(card).toMatch(/aggregatePeriodUnknown/);
    expect(semantics).toMatch(/periodStart: null,\s*periodEnd: null,/);
  });
});

describe("the historical field board is a read-only projection of the same evidence", () => {
  it("is client-side state over server-computed data: no fetch, no action, no write", () => {
    expect(board.startsWith('"use client";')).toBe(true);
    expect(board).not.toMatch(/fetch\(|useActionState|createClient|\.rpc\(|from\(|<form/);
  });
  it("selects by TIME, PERSON and PLACE", () => {
    expect(board).toMatch(/data-testid="field-week"/);
    expect(board).toMatch(/testId="field-person"/);
    expect(board).toMatch(/data-testid="field-place-toggle"/);
  });
  it("uses the same identity tile as the card", () => {
    expect(board).toMatch(/playerInitials\(label\)/);
    expect(board).toMatch(/PLAYER_IDENTITY_FALLBACK_SURFACE/);
  });
  it("never calls co-occurrence a team, and the projection carries no membership", () => {
    expect(board).toMatch(/data-testid="field-not-a-team"/);
    expect(String((lt.evidenceImport.reconstruction.field as Record<string, string>).notATeam)).toMatch(/ne komanda/);
    expect(code(projections)).not.toMatch(/membership|team_id|brigade_id/);
    expect(projections).toMatch(/never a[\s*]+team membership \(ARCH-4\)/);
  });
  it("shows an unknown split as unknown, never divided", () => {
    expect(board).toMatch(/labels\.hoursUnknown/);
    expect(board).not.toMatch(/\/\s*p\.people\.length|\/\s*places\.length/);
  });
});

describe("the reconstruction keeps the hierarchy and the disclosure", () => {
  it("time spine, aggregates apart, impact preview present; raw rows still behind disclosure", () => {
    expect(reconstruction).toMatch(/data-testid="evidence-time-spine"/);
    expect(reconstruction).toMatch(/data-testid="evidence-calendar-aggregates"/);
    expect(reconstruction).toMatch(/data-testid="evidence-impact"/);
    expect(read("components/app/evidence-import-section.tsx")).toMatch(/<details data-testid="evidence-preview-rows-disclosure">/);
  });
  it("is not a statistic wall: no grid of KPI tiles", () => {
    expect(reconstruction).not.toMatch(/data-testid="evidence-preview-counts"/);
    expect(reconstruction).not.toMatch(/function Figure/);
  });
});

describe("no second model of anything", () => {
  it("no new table, migration, calendar store, player-card store or team store", () => {
    const migrations = readdirSync(path.join(dir, "../../supabase/migrations"));
    expect(migrations.some((m) => m > "20260916" && /player|team|calendar|history|evidence/.test(m))).toBe(false);
    for (const f of ["lib/player-card/historical-player-card.ts", "lib/organization-evidence/team-board.ts", "lib/organization-evidence/calendar-store.ts"]) {
      expect(existsSync(path.join(dir, f)), f).toBe(false);
    }
    for (const src of [card, board, reconstruction, projections]) {
      expect(src).not.toMatch(/localStorage|indexedDB|\.insert\(|\.upsert\(/);
    }
  });
  it("the identity comes from the existing foundation; the timeline from the existing player-card band", () => {
    expect(card).toMatch(/from "@\/lib\/identity\/player-identity"/);
    expect(card).toMatch(/from "@\/components\/app\/player-card\/work-history-timeline"/);
    expect(card).toMatch(/from "@\/components\/app\/provenance\/provenance-edge"/);
  });
});
