import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guard (phase B): a CROSS-PARTY reader of `worker_skills.verified` reads a
 * recorded confirmation as confirmed only while it STANDS, through the DB
 * door `worker_skill_confirmations_standing_v1` (readCrossPartyStandingStates)
 * and the cross-party twin of the rule (withCrossPartyStandingConfirmation /
 * confirmedSkillWorkerIds) — never through the raw sticky flag, and never
 * through the OWN journal read, which a viewer who is not the person cannot
 * make (it would read every confirmation as withdrawn for them).
 *
 * WRITE SCOPE stays on the stored flag on purpose: the reviewer's confirm
 * choices (inbox, one-tap queue) are the exact input of
 * `confirm_entry_and_verify_skills`, which flips ONLY rows that are not yet
 * verified, and every skill offered there is linked to the entry being
 * approved — approving it makes a withdrawn confirmation stand again by the
 * rule itself. The self-service replace must keep protecting EVERY row that
 * was ever confirmed.
 *
 * NEGATIVE CONTROL: on the phase-A tree every cross-party `toMatch` below
 * fails (no reader imports the door read), and match-subject still lifts a
 * `manager_confirmed` source to the top tier on its own.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const RULE = /from "@\/lib\/evidence\/skill-confirmation-standing"/;
const READ = /from "@\/lib\/evidence\/skill-confirmation-standing-read"/;

/** Readers whose viewer is (or may be) someone other than the person. */
const CROSS_PARTY_READERS = [
  "lib/company/worker-readiness.ts", // company people table, project operations, stadium
  "app/[locale]/dashboard/people/[workerId]/page.tsx", // the one cross-person page
  "lib/market/match-subject.ts", // scouting, discovery, admin workbench subjects
  "lib/admin/matching-workbench.ts", // admin supply rows + fit C set
  "lib/admin/league.ts", // admin league confirmed-skill workers
  "lib/admin/market-analysis.ts", // admin market confirmed-skill workers
  "lib/journal/work-intelligence-read.ts", // organization view + team roster (and own)
] as const;

describe("cross-party readers route through the standing door", () => {
  for (const rel of CROSS_PARTY_READERS) {
    it(`${rel} reads the door and applies the cross-party rule`, () => {
      const src = code(rel);
      expect(src).toMatch(RULE);
      expect(src).toMatch(READ);
      expect(src).toMatch(/readCrossPartyStandingStates\(/);
      expect(src).toMatch(/withCrossPartyStandingConfirmation\(|confirmedSkillWorkerIds\(/);
    });
  }

  it("only the shared work-intelligence reader may also make the OWN read, and only for the person", () => {
    for (const rel of CROSS_PARTY_READERS) {
      const src = code(rel);
      if (rel === "lib/journal/work-intelligence-read.ts") {
        expect(src).toMatch(/subjectProfileId === caller\.userId/);
        continue;
      }
      expect(src, rel).not.toMatch(/read(Own)?StandingConfirmedSkillIds/);
    }
  });

  it("the person page asks the door beside the skills read (no added stage)", () => {
    const src = code("app/[locale]/dashboard/people/[workerId]/page.tsx");
    expect(src).toMatch(
      /await Promise\.all\(\[\s*supabase\s*\.from\("worker_skills"\)[\s\S]{0,200}readCrossPartyStandingStates\(supabase, \[workerId\]\)/,
    );
    expect(src).toMatch(/standingEvidenceTier\(r\)/);
    expect(src).not.toMatch(/deriveEvidenceTier\(r\)/);
  });

  it("match subjects never lift a manager_confirmed source on its own", () => {
    for (const rel of ["lib/market/match-subject.ts", "lib/opportunities/worker-subject.ts"]) {
      const src = code(rel);
      expect(src, rel).not.toMatch(/s\.verified \? "manager_confirmed" : sourceToEvidence\(s\.source\)/);
      expect(src, rel).toMatch(/standingSourceTier\(s\)/);
    }
    // the door read rides the existing batch, it does not add a stage
    expect(code("lib/market/match-subject.ts")).toMatch(
      /readSignalsForWorkers\(supabase, workerIds\)[\s\S]{0,400}readCrossPartyStandingStates\(supabase, workerIds\),\s*\]\);/,
    );
  });

  it("admin aggregate counts judge the recorded flags, never count them raw", () => {
    for (const rel of ["lib/admin/league.ts", "lib/admin/market-analysis.ts"]) {
      const src = code(rel);
      expect(src, rel).toMatch(/\.select\("worker_id, skill_id, verified"\)\s*\.eq\("verified", true\)/);
      expect(src, rel).toMatch(/confirmedSkillWorkerIds\(/);
      expect(src, rel).not.toMatch(/\.select\("worker_id"\)\s*\.eq\("verified", true\)/);
    }
  });

  it("company readiness: an unknown standing is null, never 0", () => {
    const src = code("lib/company/worker-readiness.ts");
    expect(src).toMatch(/confirmedSkills: number \| null/);
    expect(src).toMatch(/countCrossPartyConfirmed\(/);
    expect(src).not.toMatch(/if \(r\.verified === true\) w\.confirmedSkills \+= 1/);
    for (const rel of [
      "components/app/worker-readiness-summary.tsx",
      "components/app/project-operations-board.tsx",
      "app/[locale]/dashboard/projects/[id]/page.tsx",
    ]) {
      expect(read(rel), rel).toMatch(/confirmedSkills \?\? "—"/);
    }
  });
});

describe("own surfaces routed in phase B use the OWN read", () => {
  it("GET /api/workers/:id/skills (owner-only) answers the standing confirmation", () => {
    const src = code("app/api/workers/[workerId]/skills/route.ts");
    expect(src).toMatch(RULE);
    expect(src).toMatch(/withStandingConfirmation\(/);
    expect(src).toMatch(/readStandingConfirmedSkillIds\(supabase, workerId\)/);
    expect(src).toMatch(/verifiedRecorded: r\.verifiedRecorded/);
    expect(src).not.toMatch(/readCrossPartyStandingStates/);
  });
});

describe("write scope keeps the stored flag", () => {
  it("the self-service replace still protects every row that was EVER confirmed", () => {
    const src = code("app/api/workers/[workerId]/skills/route.ts");
    expect(src).toMatch(/if \(row\.verified === false && row\.source === "self_declared"\) toDelete\.push\(id\)/);
    expect(src).toMatch(/\.eq\("verified", false\)/);
  });

  it("the reviewer's confirm choices stay the stored flag (the confirm RPC's own input)", () => {
    for (const rel of ["app/[locale]/dashboard/inbox/page.tsx", "lib/journal/review-queue.ts"]) {
      const src = code(rel);
      expect(src, rel).toMatch(/r\.verified === true/);
      expect(src, rel).not.toMatch(/readCrossPartyStandingStates|withCrossPartyStandingConfirmation/);
    }
  });
});

describe("the door read itself", () => {
  const src = code("lib/evidence/skill-confirmation-standing-read.ts");

  it("calls the one door by name, chunked at its cap and paged under the row cap", () => {
    expect(src).toMatch(/\.rpc\("worker_skill_confirmations_standing_v1", \{ p_worker_ids:/);
    expect(src).toMatch(/STANDING_DOOR_MAX_WORKER_IDS = 500/);
    expect(src).toMatch(/\.range\(from, from \+ PAGE_SIZE - 1\)/);
  });

  it("a missing function is 'not installed'; anything else is UNKNOWN", () => {
    expect(src).toMatch(/new Set\(\["42883", "PGRST202"\]\)/);
    expect(src).toMatch(/return STANDING_DOOR_NOT_INSTALLED/);
    expect(src).not.toMatch(/service_role|createServiceClient|SUPABASE_SERVICE/);
  });

  it("the stored flag is read as today ONLY while the door is not installed", () => {
    const rule = code("lib/evidence/skill-confirmation-standing.ts");
    expect(rule).toMatch(/if \(read === STANDING_DOOR_NOT_INSTALLED\) return "recorded_unjudged";/);
    expect(rule).toMatch(/if \(read === null\) return "unknown";/);
    expect(rule).toMatch(/return state === "standing" \|\| state === "recorded_unjudged";/);
  });
});
