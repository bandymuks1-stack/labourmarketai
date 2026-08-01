import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Privacy/input-hygiene guards (findings F-S2, F-S4, F-S6 of the
 * full-project audit 2026-07-02).
 *
 * Contract:
 *   - The waitlist route never logs the raw request body or a plain email.
 *   - Manager reject reason and review note are length-capped app-side
 *     (their columns/jsonb have no DB-side cap).
 *   - Customer-request free-text fields are length-capped app-side.
 *   - createConversation caps the participant fan-out.
 */

const APP = join(process.cwd());
const read = (rel: string) => readFileSync(join(APP, rel), "utf-8");

describe("waitlist route logs no PII", () => {
  const route = read("app/api/waitlist/route.ts");

  it("never logs the raw request body", () => {
    expect(route).not.toMatch(/console\.\w+\([^)]*\braw\b/);
  });

  it("never logs a parsed email value", () => {
    expect(route).not.toMatch(/console\.\w+\([^)]*parsed\.data\.email/);
  });
});

describe("free-text inputs are length-capped", () => {
  // The ungated confirmEntry/rejectEntry actions (and their reason cap) were
  // deleted in W5 slice 1 — rejection free text now travels ONLY as the gated
  // review chain's note, capped below.
  it("journal review note is capped", () => {
    const src = read("lib/journal/review-actions.ts");
    expect(src).toMatch(/note\.length > 2000/);
  });

  it("customer-request free-text fields are capped", () => {
    const src = read("lib/buyer/customer-requests.ts");
    for (const field of ["need_summary", "location", "notes", "duration"]) {
      expect(src, `cap for ${field}`).toContain(`"${field}"`);
    }
    expect(src).toMatch(/FIELD_CAPS/);
  });
});

describe("conversation participant fan-out is capped", () => {
  it("createConversation rejects oversized participant lists before insert", () => {
    const src = read("lib/communication/actions.ts");
    expect(src).toMatch(/MAX_PARTICIPANTS = 20/);
    expect(src).toMatch(/requestedParticipants\.length > MAX_PARTICIPANTS/);
    // The cap must run BEFORE the conversation insert (no orphan rows).
    const capIdx = src.indexOf("requestedParticipants.length > MAX_PARTICIPANTS");
    const insertIdx = src.indexOf('.from("conversations")');
    expect(capIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(capIdx).toBeLessThan(insertIdx);
  });
});
