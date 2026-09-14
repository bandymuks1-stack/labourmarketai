import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CAL-7 — a person cannot really be in two places at once, and the product
 * now says so at the moment somebody commits them.
 *
 * WHAT WAS ACTUALLY MISSING, AND WHAT WAS NOT. The product could already
 * answer "who is free this week?" — `lib/conversation/capacity-core.ts`
 * composes approved absences and committed work into that answer, and the
 * worker's own calendar flags overlapping commitments. Nothing asked the
 * question where the commitment is MADE. So CAL-7 needed no new table, no new
 * authority and no migration: both reads already existed, both were already
 * authorized by RLS, and the overlap rule already had a home. It needed the
 * question asked, once, in the one place it was never asked.
 *
 * This guard pins the three properties that make that true and keep it true:
 * ONE overlap rule, NO new data path, and a verdict that cannot refuse.
 */

const webRoot = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

const MODEL = "lib/workforce/commitment-reservation.ts";
const READER = "lib/planning/worker-reservation.ts";
const ACTION = "lib/projects/actions.ts";
const PANEL = "components/app/project-assignment-manager.tsx";

/** Executable code only — prose about a rule is not the rule. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, " ");
}

describe("there is ONE overlap rule, and the reservation view does not fork it", () => {
  it("the model imports the calendar's overlap helpers instead of restating them", () => {
    const src = read(MODEL);
    expect(src).toMatch(
      /import \{[\s\S]*effectiveEndDay[\s\S]*rangesOverlapInclusive[\s\S]*\} from "@\/lib\/planning\/planning-model"/,
    );
  });

  it("the model defines no overlap or end-day arithmetic of its own", () => {
    // A second copy of "inclusive ranges, touching edges count" is how the
    // calendar and the reservation view would come to disagree about the same
    // two rows — the class of defect that gave three different answers for
    // one journal entry's hours.
    const c = code(read(MODEL));
    expect(c).not.toMatch(/function\s+(rangesOverlap|overlaps|effectiveEnd)/i);
    // The only comparisons left are the min/max helpers that name the shared
    // days; the overlap TEST itself must come from the import.
    const overlapCalls = c.match(/rangesOverlapInclusive\(/g) ?? [];
    expect(overlapCalls.length).toBe(1);
  });
});

describe("no new data path, no new authority — the reuse proof", () => {
  it("the reader composes the two EXISTING employer reads and nothing else", () => {
    const c = code(read(READER));
    expect(c).toMatch(/getEmployerWorkerCommitments/);
    expect(c).toMatch(/getEmployerWorkerAvailability/);
    // No query of its own: a new read here would be a new authority surface
    // that RLS has not been reasoned about for.
    expect(c).not.toMatch(/\.from\(/);
    expect(c).not.toMatch(/\.rpc\(/);
  });

  it("no service-role client anywhere in the reservation path", () => {
    for (const rel of [MODEL, READER]) {
      const c = code(read(rel));
      expect(c, rel).not.toMatch(/service_role|SERVICE_ROLE|createServiceClient|serviceClient/);
    }
  });

  it("the pure model is pure — no IO, no clock, no server-only", () => {
    const c = code(read(MODEL));
    expect(c).not.toMatch(/server-only/);
    expect(c).not.toMatch(/createClient|fetch\(|Date\.now|new Date\(/);
  });

  it("the absence label is null at every step, so WHY never leaks", () => {
    // `employer-availability.ts` deliberately never reads `note` or
    // `absence_type`: an employer may learn THAT someone is unavailable,
    // never why. The reservation path must not add a reason back.
    const c = code(read(READER));
    const absenceBlock = c.slice(c.indexOf('source: "absence"'), c.indexOf('source: "absence"') + 400);
    expect(absenceBlock).toMatch(/label:\s*null/);
    expect(c).not.toMatch(/absence_type|\bnote\b/);
  });
});

describe("a reservation warns and can never prohibit — SEP-2", () => {
  it("the verdict has exactly three states, none of them a refusal", () => {
    const src = read(MODEL);
    expect(src).toMatch(/export type ReservationState = "clear" \| "collides" \| "unknown";/);
    expect(code(src)).not.toMatch(/"blocked"|"refused"|"forbidden"|"denied"/);
  });

  it("the check runs AFTER the write and cannot fail it", () => {
    const c = code(read(ACTION));
    const rpc = c.indexOf('rpc("assign_worker_to_project"');
    const check = c.indexOf("reservationAfterAssign(");
    expect(rpc).toBeGreaterThan(0);
    expect(check, "the reservation check must come after the assign RPC").toBeGreaterThan(rpc);
    // Wrapped, so a slow or failing capacity read can never turn a successful
    // assignment into an error the manager has to interpret.
    const helper = c.slice(c.indexOf("async function reservationAfterAssign"));
    expect(helper).toMatch(/try \{/);
    expect(helper).toMatch(/catch \(error\)/);
    expect(helper).toMatch(/return null;/);
  });

  it("the assignment result carries the verdict as an addition, never a failure code", () => {
    const src = read(ACTION);
    // `reservation` hangs off the OK branch. If it ever became a failure
    // code, the warning would have turned into a gate.
    expect(src).toMatch(/ok: true;[\s\S]*reservation\?: ReservationVerdict;/);
    expect(src).not.toMatch(/code: "[a-z_]*(conflict|collide|reserved)[a-z_]*"/i);
  });
});

describe("unknown is never rendered as free — SEP-7", () => {
  it("clear requires an empty gap list, in the code and not just the comment", () => {
    const c = code(read(MODEL));
    expect(c).toMatch(/gaps\.length > 0\s*\?\s*\{ state: "unknown"/);
  });

  it("the reader derives the unreadable list from the read RESULTS", () => {
    // Not from a flag a caller can forget: every non-ok branch must push a
    // source onto the list.
    const c = code(read(READER));
    expect(c).toMatch(/\} else \{\s*unreadableSources\.push\(\.\.\.COMMITMENT_SOURCES\);/);
    expect(c).toMatch(/\} else \{\s*unreadableSources\.push\("absence"\);/);
  });

  it("an undated project assignment is reported, not dropped", () => {
    // The capacity reader will not invent a band for an undated project, and
    // must not: but silently dropping it would let the reservation verdict
    // say "clear" about a person who is committed somewhere.
    const c = code(read("lib/planning/employer-committed-work.ts"));
    expect(c).toMatch(/undatedProjects\.push\(/);
    expect(c).toMatch(/readonly undatedProjects: readonly UndatedProjectCommitment\[\]/);
    expect(code(read(READER))).toMatch(/committed\.undatedProjects/);
  });

  it("the panel renders the unknown state distinctly from clear", () => {
    const c = code(read(PANEL));
    expect(c).toMatch(/verdict\.state === "clear"[\s\S]{0,60}return null/);
    expect(c).toMatch(/assign-reservation-unknown/);
    expect(c).toMatch(/assign-reservation-collides/);
  });
});

describe("the manager can read the warning in their own language", () => {
  for (const loc of ["en", "lt", "ru", "nl", "de"]) {
    it(`${loc} carries the reservation copy, including all three sources`, () => {
      const r = JSON.parse(read(`messages/${loc}.json`)).projects?.assign?.reservation;
      expect(r, `${loc}.projects.assign.reservation`).toBeTruthy();
      for (const key of ["collidesTitle", "notBlocking", "unknown"]) {
        expect(r[key], `${loc}.${key}`).toBeTruthy();
      }
      for (const source of ["project", "booking", "absence"]) {
        expect(r.source?.[source], `${loc}.source.${source}`).toBeTruthy();
      }
      // The copy must not promise a block it cannot deliver.
      expect(String(r.notBlocking).length).toBeGreaterThan(0);
    });
  }
});
