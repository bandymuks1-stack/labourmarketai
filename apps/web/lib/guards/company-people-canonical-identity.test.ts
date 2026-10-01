import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The company People door wears the ONE person-identity card (owner order
 * 2026-10-01) and speaks as a team, not as an admin screen: state from the one
 * capacity read, one contextual primary action, destructive control quietest,
 * no internal copy on the card, no new card variant, no game vocabulary.
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const SECTION = read("components/app/company-workers-section.tsx");
const PAGE = read("app/[locale]/dashboard/company/people/page.tsx");
const CARD = read("components/app/identity/person-identity-card.tsx");

describe("company people — one canonical identity", () => {
  it("reuses PersonIdentityCard and adds no card variant or parallel card", () => {
    expect(SECTION).toContain("<PersonIdentityCard");
    expect(SECTION).toContain('variant="team-member"');
    expect(CARD.match(/"candidate-review" \| "team-member" \| "assignment" \| "roster-person"/)).not.toBeNull();
    expect(SECTION).not.toMatch(/PlayerCard|IdentityStage|player-card/);
  });

  it("team state comes from the one capacity read, not a second calculation", () => {
    expect(PAGE).toContain("whoIsAvailableCore");
    expect(PAGE).toContain("derivePeopleTeamState");
  });

  it("states ONE primary action per person, by state", () => {
    expect(SECTION).toMatch(/ts\?\.state === "free" \? "assign"/);
    expect(SECTION).toMatch(/ts\?\.state === "working" \? "calendar"/);
    expect((SECTION.match(/className=\{PRIMARY_ACTION\}/g) ?? []).length).toBe(2);
  });

  it("removal stays available to the owner but is the quietest control", () => {
    expect(SECTION).toContain('side="owner"');
    const end = read("components/app/roster-link-end.tsx");
    expect(end).toMatch(/side === "owner"\s*\?\s*"min-h-11 w-fit rounded-control px-2\.5 text-meta/);
  });

  it("the card no longer prints internal role/review words or a bare status badge", () => {
    expect(SECTION).not.toMatch(/REVIEW_RAIL|border-l-state-success/);
    expect(SECTION).not.toMatch(/uppercase tracking-label text-text-secondary">\s*\{statusWord/);
    // the disclosure no longer carries a "review not enabled" summary
    expect(SECTION).not.toMatch(/summary=\{[^}]*reviewNotEnabled/);
  });

  it("no game vocabulary in the new copy (lt/en)", () => {
    for (const loc of ["lt", "en"]) {
      const m = JSON.parse(read(`messages/${loc}.json`)) as {
        roleDashboards: { company: { workers: { team: Record<string, string> } } };
      };
      const text = Object.values(m.roleDashboards.company.workers.team).join(" ");
      expect(text).not.toMatch(/score|stars?\b|rating|league|player|taš|žvaigžd|reitingas|lyga/i);
    }
  });
});

describe("company people - the card names the trade, from the one canonical store", () => {
  const WORKERS = read("lib/company/company-workers.ts");

  it("reads professions from worker_professions under RLS: no new table, no service role", () => {
    expect(WORKERS).toMatch(/\.from\("worker_professions"\)/);
    expect(WORKERS).toMatch(/professions\(slug\)/);
    expect(WORKERS).not.toMatch(/createAdminClient|SERVICE_ROLE_KEY/);
    // an unanswered read is "none declared", never a guessed trade
    expect(WORKERS).toMatch(/if \(res\.error \|\| !Array\.isArray\(res\.data\)\) return out;/);
  });

  it("names go through the one display rule (catalogue slug or the person's own words)", () => {
    expect(PAGE).toContain("professionDisplayName");
    expect(SECTION).toContain("professionsByWorker");
  });

  it("the trade leads and the role is its own fact, not a stand-in", () => {
    expect(SECTION).toMatch(/professions=\{tradeNames\.length > 0 \? \[\.\.\.tradeNames\] : roleText/);
    expect(SECTION).toMatch(/key: "role", kind: "role"/);
  });
});
