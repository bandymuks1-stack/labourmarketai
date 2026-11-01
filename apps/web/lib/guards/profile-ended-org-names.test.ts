import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A FORMER EMPLOYER KEEPS ITS NAME ON THE PROFILE (system audit 2026-10-20).
 *
 * The profile's engagement cards embedded `organizations(...)`; that embed is
 * governed by the organizations RLS, which admits ACTIVE relationships only —
 * so every ENDED job showed "—" (or the bare type label), and because the card
 * then believed the row had no organization, it offered "Remove" on real
 * organization work, which the RPC refused. The Living CV already fills names
 * through the shared historical-name reader; the profile now does the same,
 * and "self-declared" follows the RPC's own precondition (organization_id null).
 */
const page = readFileSync(join(__dirname, "..", "..", "app", "[locale]", "dashboard", "profile", "page.tsx"), "utf8");

describe("profile engagement cards", () => {
  it("read organization_id and fill ended organizations' names via withHistoricalOrgNames", () => {
    expect(page).toMatch(/"id, organization_id, relationship_slug, title, is_primary, started_at, ended_at, organizations\(/);
    // Inside the same parallel stage (the profile waterfall guard counts stages).
    expect(page).toMatch(/withHistoricalOrgNames\(supabase, res\.data\)\.then\(\(data\) => \(\{ \.\.\.res, data \}\) as typeof res\)/);
  });
  it("self-declared follows organization_id, never the RLS-hidden embed", () => {
    expect(page).toMatch(/selfDeclared: e\.organization_id === null && e\.is_primary !== true/);
    expect(page).not.toMatch(/selfDeclared: org === null/);
  });
});
