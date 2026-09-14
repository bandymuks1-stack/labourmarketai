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

  it("an approved business trip counts as a commitment, with no new authority", () => {
    // The one dated commitment the employer side did not count. It needed no
    // policy change: `business_trips_select` already admits the person, the
    // org's managers and admin — the same shape as every other source here.
    const src = read("lib/planning/employer-committed-work.ts");
    expect(src).toMatch(/\.from\("business_trips"\)/);
    // ONE home for the rule, imported — not a second literal that can drift.
    expect(src).toMatch(/import \{ PLANNED_TRIP_STATUSES \} from "@\/lib\/planning\/planning-model"/);
    expect(src).toMatch(/\.in\("status", \[\.\.\.PLANNED_TRIP_STATUSES\]\)/);
    // Pending intentions are NOT commitments — the same rule the absence read
    // follows for a `requested` absence.
    expect(read("lib/planning/planning-model.ts")).toMatch(
      /export const PLANNED_TRIP_STATUSES = \["approved", "completed"\] as const;/,
    );
    expect(read(MODEL)).toMatch(/"project", "booking", "trip", "absence"/);
  });

  it("a trip's PURPOSE is never read, only its destination", () => {
    // Free text up to 1000 characters, and not needed to answer "is this
    // person committed". The select list is the boundary, as it is for an
    // absence's reason: a column that never enters the process cannot leak.
    const src = read("lib/planning/employer-committed-work.ts");
    const select = src.slice(src.indexOf('.from("business_trips")'), src.indexOf('.from("business_trips")') + 300);
    expect(select).toMatch(/select\("id, profile_id, destination, date_from, date_to"\)/);
    expect(select).not.toMatch(/purpose/);
  });

  it("an unread commitment read makes ALL THREE of its sources unknown", () => {
    // Trips share the one read with projects and bookings. Leaving `trip` out
    // of the unreadable list would let a failed read be reported as an
    // absence of trips (SEP-7).
    for (const rel of [READER, "lib/planning/roster-utilisation.ts"]) {
      expect(code(read(rel)), rel).toMatch(
        /COMMITMENT_SOURCES: readonly ReservationSource\[\] = \["project", "booking", "trip"\]/,
      );
    }
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

describe("the chat and the page state the SAME verdict", () => {
  // The repo's rule, from `lib/projects/assignable-workers.ts`: chat and page
  // reach the same state through the same reads. The first cut of CAL-7 broke
  // it — the chat executors called the same action and DISCARDED the verdict,
  // so a manager assigning by chat was told nothing while the page warned.
  const executors = read("lib/conversation/company-executors.ts");
  const chat = read("components/app/conversation/chat/conversation-chat.tsx");

  it("both assign executors carry the verdict back", () => {
    for (const id of ["company.assign-worker", "company.move-worker"]) {
      const block = executors.slice(
        executors.indexOf(`"${id}": async`),
        executors.indexOf(`"${id}": async`) + 1800,
      );
      expect(block, `${id} must not discard the reservation`).toMatch(/assignPayload\(r\)/);
    }
    // ONE place decides what a successful assignment carries.
    expect(executors).toMatch(/if \(r\.reservation\) data\.reservation = r\.reservation;/);
    // …and it answers `undefined`, not `{}`, when there is nothing to carry:
    // an executor that started returning an empty object where it used to
    // return nothing is a shape change every caller would have to learn.
    expect(executors).toMatch(/Object\.keys\(data\)\.length > 0 \? data : undefined/);
  });

  it("the chat renders it, and renders unknown as its own sentence", () => {
    const c = code(chat);
    expect(c).toMatch(/function reservationNote\(/);
    expect(c).toMatch(/verdict\.state === "unknown"[\s\S]{0,80}assignCommitmentUnknown/);
    expect(c).toMatch(/verdict\.state !== "collides"[\s\S]{0,30}return "";/);
    // `clear` says nothing — there is nothing to say.
    expect(c).toMatch(/if \(!verdict\) return "";/);
  });

  it("the chat note cannot become a refusal", () => {
    // It is appended to the SUCCESS sentence. If it ever moves to the failure
    // branch, a warning has turned into a block (SEP-2).
    const c = code(chat);
    expect(c).toMatch(/res\.ok\s*\?\s*\[labels\.assignDone, reservationNote\(res\.data, labels\)\]/);
  });

  for (const loc of ["en", "lt", "ru", "nl", "de"]) {
    it(`${loc} says it in the chat too, with the count`, () => {
      const chatCopy = JSON.parse(read(`messages/${loc}.json`)).conversation?.chat;
      expect(chatCopy?.assignAlreadyCommitted, `${loc}.assignAlreadyCommitted`).toBeTruthy();
      expect(chatCopy.assignAlreadyCommitted).toContain("{count}");
      expect(chatCopy?.assignCommitmentUnknown, `${loc}.assignCommitmentUnknown`).toBeTruthy();
    });
  }
});

describe("the manager can read the warning in their own language", () => {
  for (const loc of ["en", "lt", "ru", "nl", "de"]) {
    it(`${loc} carries the reservation copy, including all three sources`, () => {
      const r = JSON.parse(read(`messages/${loc}.json`)).projects?.assign?.reservation;
      expect(r, `${loc}.projects.assign.reservation`).toBeTruthy();
      for (const key of ["collidesTitle", "notBlocking", "unknown"]) {
        expect(r[key], `${loc}.${key}`).toBeTruthy();
      }
      for (const source of ["project", "booking", "trip", "absence"]) {
        expect(r.source?.[source], `${loc}.source.${source}`).toBeTruthy();
      }
      // The copy must not promise a block it cannot deliver.
      expect(String(r.notBlocking).length).toBeGreaterThan(0);
    });
  }
});
