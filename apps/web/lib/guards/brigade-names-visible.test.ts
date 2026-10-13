import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Production walk 2026-10-12: the brigade invite picker and the member list
 * showed "—" for every person, because `profiles` is own-row under RLS and the
 * embedded full_name is null for anyone else. The owner could not tell whom
 * they were inviting. The worker card's display_name (readable through
 * can_view_worker, the predicate that lets the manager see the person at all)
 * now names them. Nothing is widened: no service role, no new grant.
 */
const src = readFileSync(join(__dirname, "..", "company", "team-brigades.ts"), "utf8");

describe("brigade members and invitable people are named", () => {
  it("falls back to workers.display_name for anyone profiles RLS hides", () => {
    expect(src).toMatch(/\.from\("workers"\)\s*\.select\("profile_id, display_name"\)\s*\.in\("profile_id", \[\.\.\.unnamed\]\)/);
    expect(src).toMatch(/m\.name === "—" && byProfile\.has\(m\.profileId\)/);
    expect(src).toMatch(/p\.worker\.name === "—" && byProfile\.has\(p\.worker\.profileId\)/);
  });

  it("reads as the caller — no service role in the brigade read", () => {
    expect(src).not.toMatch(/createAdminClient|service_role/);
  });
});
