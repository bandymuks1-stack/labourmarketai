import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * B1 guard — the brigade primitive must stay a RESOLVER.
 *
 * The risk this pins is not a bug, it is a drift: the moment a team act can
 * write, somebody will make it write once and call the result a brigade
 * assignment. N independent per-member writes are not a transaction, and a
 * caller that lost three of eight members must be able to see which three.
 * Atomic collective commitment is a separate capability with its own
 * transactional RPC and its own authority question, and it is not built.
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const SRC = read("lib/workforce/brigade-assignment.ts");
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*/gm, " ");

describe("1. the primitive is pure — it cannot write", () => {
  it("no Supabase client, no server-only, no RPC, no server action", () => {
    expect(code).not.toMatch(/from "@\/lib\/supabase/);
    expect(code).not.toMatch(/server-only/);
    expect(code).not.toMatch(/\.rpc\(/);
    expect(code).not.toMatch(/"use server"/);
  });

  it("names no write RPC at all — not even to describe one", () => {
    expect(code).not.toMatch(/assign_worker_to_project|submit_agency_candidate_offer_v1/);
  });
});

describe("2. no second workforce model", () => {
  it("defines no brigade entity — members arrive already read", () => {
    // A brigade is an organizations row with organization_type='team'. This
    // module must not grow its own roster store or membership concept.
    expect(code).not.toMatch(/organization_type|engagement_contexts|team_details/);
    expect(code).toMatch(/members: readonly BrigadeMemberInput\[\]/);
  });

  it("reuses the CAL-7 verdict rather than restating an overlap rule", () => {
    expect(SRC).toMatch(/import type \{ ReservationVerdict \}/);
    expect(code).not.toMatch(/rangesOverlap|overlapStart\s*[:=]/);
  });

  it("carries opaque worker ids and no contact field", () => {
    expect(code).not.toMatch(/\bemail\b|\bphone\b|displayName|fullName/i);
  });
});

describe("3. UNKNOWN and UNAUTHORIZED stay themselves", () => {
  it("eligibility has three states, not two", () => {
    expect(code).toMatch(/"eligible" \| "not_eligible" \| "unknown"/);
  });

  it("authority and consent each carry their own unknown", () => {
    expect(code).toMatch(/"permitted" \| "refused" \| "unknown"/);
    expect(code).toMatch(/"recorded" \| "not_recorded" \| "unknown"/);
  });

  it("the three dimensions are separate fields, never one boolean", () => {
    expect(code).toMatch(/readonly authority: MemberAuthority/);
    expect(code).toMatch(/readonly consent: MemberConsent/);
    expect(code).toMatch(/readonly time: ReservationVerdict/);
  });

  it("the whole-brigade answer requires every member to be affirmatively eligible", () => {
    expect(code).toMatch(
      /members\.length > 0 && eligibleWorkerIds\.length === members\.length/,
    );
  });
});
