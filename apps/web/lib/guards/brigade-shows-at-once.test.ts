import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A NEW BRIGADE IS SHOWN AT ONCE (owner order 2026-10-20: "nauja brigada turi
 * atsirasti be puslapio perkrovimo").
 *
 * The brigade was created, but the owner saw it only after the whole people
 * page re-rendered — under load past the walk's wait (walk 2026-10-20, run
 * 39416703137: the row existed, the card did not). The create action now
 * answers with the same brigade list the page reads, and the panel shows that
 * answer until the next server render replaces its props.
 */
const APP = resolve(__dirname, "..", "..");
const action = readFileSync(resolve(APP, "lib/company/team-brigade-actions.ts"), "utf8");
const panel = readFileSync(resolve(APP, "components/app/team-brigades-panel.tsx"), "utf8");

describe("a created brigade appears without a reload", () => {
  it("the create action answers with the fresh list, read the way the page reads it", () => {
    const fn = action.slice(action.indexOf("export async function createTeamAction"), action.indexOf("export type TeamInviteOutcome"));
    expect(fn).toMatch(/Promise<\{ outcome: CreateTeamOutcome; teams\?: readonly TeamBrigade\[\] \}>/);
    expect(fn).toMatch(/const fresh = await getTeamBrigadesData\(\);/);
    // only a complete read replaces the list; a failed one leaves the refresh to it
    expect(fn).toMatch(/if \(fresh\.applied && fresh\.error === null\) return \{ outcome, teams: fresh\.teams \};/);
  });

  it("the panel renders the answered list, and the next server render takes over", () => {
    expect(panel).toMatch(/const shownTeams = answered && answered\.replaces === teams \? answered\.teams : teams;/);
    expect(panel).toMatch(/if \(res\.teams\) setAnswered\(\{ replaces: teams, teams: res\.teams \}\);/);
    expect(panel).toMatch(/\{shownTeams\.map\(\(team\) =>/);
    expect(panel).not.toMatch(/\{teams\.map\(\(team\) =>/);
    // the refresh still follows, so disband/invite state and counts stay server truth
    expect(panel.slice(panel.indexOf("function create()"), panel.indexOf("function disband("))).toMatch(/router\.refresh\(\);/);
  });
});
