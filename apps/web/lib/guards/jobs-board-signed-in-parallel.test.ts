import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A signed-in person does not wait for their bookmarks before the board's read
 * starts. The board's read needs nothing from the session; the saved view reads no
 * board unless its bookmarks turn out to be unavailable.
 */
const page = readFileSync(join(__dirname, "..", "..", "app", "[locale]", "(marketing)", "jobs", "page.tsx"), "utf8");

describe("signed-in job board reads", () => {
  it("starts the board's read beside the session's reads, not after them", () => {
    const all = page.slice(page.indexOf("await Promise.all(["), page.indexOf("const { user, mySaved } = member;"));
    expect(all).toMatch(/resolveOwnWorkerId\(supabase, u\.id\)/);
    expect(all).toMatch(/listSavedPublicVacancyIds\(supabase, id\)/);
    expect(all).toMatch(/wantsSaved \? null : runBoardSearch\(\)/);
  });

  it("the saved view falls back to the board only when its bookmarks are unavailable", () => {
    expect(page).toMatch(/const showSaved = wantsSaved && mySaved\.available;/);
    expect(page).toMatch(/earlyBoardSearch \?\? \(await runBoardSearch\(\)\)/);
  });

  it("an anonymous visitor still never reaches the auth server", () => {
    expect(page).toMatch(/const supabase = signedIn \? await createClient\(\) : null;/);
    expect(page).toMatch(/const u = supabase \? \(await supabase\.auth\.getUser\(\)\)\.data\.user : null;/);
  });

  it("member facts stay read for the rows the page shows, after the board's read", () => {
    expect(page.indexOf("listMemberVacancyFactsByIds(supabase, shownIds)")).toBeGreaterThan(page.indexOf("earlyBoardSearch ??"));
  });
});
