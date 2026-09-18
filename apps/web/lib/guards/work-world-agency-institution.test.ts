import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: agency and institution wear the same work-world grammar as the
 * rest of the product, without any new authority — a linked worker is a
 * presence (never an e-mail standing in for a person), a learner invitation
 * is a presence built only from what the institution typed, a cohort span is
 * a mono stamp. Consent and least-privilege rulings are untouched.
 */
const root = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("Guard: AGENCY wears the work-world grammar (AGENCY_REACHABLE)", () => {
  const src = read("components/app/agency-workers-section.tsx");
  it("a linked worker is a PersonPresence — display name first, e-mail beneath, never a face", () => {
    expect(src).toContain('from "@/components/app/work-world/primitives"');
    expect(src).toMatch(/<PersonPresence\s+name=\{w\.displayName\?\.trim\(\) \|\| w\.email \|\| "—"\}/);
    expect(src).not.toMatch(/<PersonPresence[^>]*photoUrl/);
    // the invited-at line is a mono stamp
    expect(src).toMatch(/<PlaceTimeStamp>\s*\{labels\.columnInvitedAt\}/);
  });
  it("no collective / brigade authority entered with the grammar — the consent-bearing actions are unchanged", () => {
    expect(src).toMatch(/inviteAgencyWorkerAction/);
    expect(src).not.toMatch(/brigade|bulkAssign|assignAll/i);
  });
});

describe("Guard: INSTITUTION wears the work-world grammar (INSTITUTION_REACHABLE)", () => {
  const learners = read("components/app/institution-learners-section.tsx");
  const programs = read("components/app/institution-programs-section.tsx");
  it("a learner invitation is a PersonPresence built ONLY from what the institution typed", () => {
    expect(learners).toMatch(/<PersonPresence\s+name=\{row\.invitedName \?\? row\.invitedEmail\}/);
    expect(learners).not.toMatch(/<PersonPresence[^>]*photoUrl/);
    // still never the learner's journal / skills / profile
    expect(learners).not.toMatch(/journal_entries|worker_skills|profiles\(/);
  });
  it("a cohort's recorded span is a PlaceTimeStamp — nothing derived", () => {
    expect(programs).toMatch(/<PlaceTimeStamp>\s*\{c\.startsOn\}/);
  });
  it("no formal recognition authority entered with the grammar", () => {
    for (const s of [learners, programs]) expect(s).not.toMatch(/INDEPENDENTLY_VERIFIED|rpl_decision|recognit/i);
  });
});
