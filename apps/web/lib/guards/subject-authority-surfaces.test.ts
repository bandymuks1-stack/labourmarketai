import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE TWO SURFACES THE APPLIED AUTHORITY UNLOCKED (RED #4 + #5, production
 * ledger `20260915185038`).
 *
 * Until that migration, `deriveEvidenceStanding` ranked DISPUTED second in its
 * precedence order while no actor in the system could cause it, and
 * `respond_booking_request_v3` refused an overlapping accept with no way for
 * the person to say "I know". The authority now exists; these are the doors.
 *
 * What this guard protects is the HONESTY of both doors, because each one is
 * a step away from a lie that would be easy to ship:
 *
 *   a dispute must not edit or delete the employer's record;
 *   a clash acknowledgement must not resolve, hide or cancel the clash;
 *   neither may happen without an explicit, separate user action;
 *   the receipt and the provenance must stay visible;
 *   an UNKNOWN or UNAUTHORIZED outcome must never render as success.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");

const ACTION = read("lib/organization-evidence/dispute-actions.ts");
const SECTION = read("components/app/organization-evidence-section.tsx");
const BOOKING = read("lib/booking/booking-actions.ts");
const BUTTONS = read("components/app/booking-respond-buttons.tsx");
const CARD = read("components/app/conversation/worker-booking-action.tsx");
const SCHEMA = read("lib/conversation/worker-schemas.ts");
const EXECUTOR = read("lib/conversation/worker-executors.ts");

describe("the subject dispute writes an event and nothing else", () => {
  it("writes ONLY to the events table", () => {
    const writes = [
      ...ACTION.matchAll(/\.from\(\s*["']([a-z_]+)["']\s*\)[\s\S]{0,120}?\.(insert|update|upsert|delete)\(/g),
    ].map((m) => `${m[1]}.${m[2]}`);
    expect(writes).toEqual(["organization_evidence_events.insert"]);
  });

  it("never updates or deletes the employer's record", () => {
    expect(ACTION).not.toMatch(/organization_evidence_records[\s\S]{0,160}?\.(update|delete|upsert)\(/);
  });

  it("writes exactly one event type", () => {
    const types = [...ACTION.matchAll(/event_type:\s*["']([a-z_]+)["']/g)].map((m) => m[1]);
    expect(types).toEqual(["disputed"]);
  });

  it("attributes the dispute to the session user, never to the form", () => {
    expect(ACTION).toMatch(/actor_profile_id:\s*user\.id/);
    // The organisation is read back from the record, so a caller cannot aim a
    // dispute at one organisation while naming another.
    expect(ACTION).toMatch(/organization_id:\s*\(found\.data as/);
    expect(ACTION).not.toMatch(/form\.get\(\s*["']organization_id["']/);
  });

  it("cannot be written as an organisation's statement", () => {
    expect(ACTION).toMatch(/actor_role:\s*null/);
    expect(ACTION).toMatch(/actor_organization_id:\s*null/);
    expect(ACTION).toMatch(/replacement_record_id:\s*null/);
  });

  it("an RLS refusal is reported as a refusal, never as success", () => {
    expect(ACTION).toMatch(/RLS_VIOLATION[\s\S]{0,80}?ok:\s*false/);
    expect(ACTION).toMatch(/code:\s*"not_allowed"/);
  });

  it("a duplicate is reported honestly as already-on-file", () => {
    expect(ACTION).toMatch(/UNIQUE_VIOLATION[\s\S]{0,60}?already:\s*true/);
  });
});

describe("the dispute surface extends the existing section", () => {
  it("lives in the subject's own evidence section, not a new page", () => {
    expect(SECTION).toMatch(/data-testid="organization-evidence-section"/);
    expect(SECTION).toMatch(/disputeEvidenceRecordAction/);
    expect(SECTION).toMatch(/data-testid="evidence-dispute-open"/);
    expect(SECTION).toMatch(/data-testid="evidence-dispute-submit"/);
  });

  it("requires an explicit second action — the button alone writes nothing", () => {
    // The opener only reveals the form; the write is a separate submit.
    expect(SECTION).toMatch(/onClick=\{\(\) => setOpen\(true\)\}/);
    expect(SECTION).toMatch(/<form action=\{submit\}/);
  });

  it("shows the contested standing rather than hiding it", () => {
    expect(SECTION).toMatch(/data-testid="evidence-record-disputed"/);
    expect(SECTION).toMatch(/rec\.state === "DISPUTED"/);
  });

  it("distinguishes YOUR objection from SOMEONE's", () => {
    // `state === 'DISPUTED'` says only that somebody with standing objected —
    // an org manager can dispute too. Claiming authorship the view does not
    // know would put words in the reader's mouth.
    expect(SECTION).toMatch(/rec\.disputedByViewer[\s\S]{0,120}?disputedByYou/);
  });

  it("copy never claims the record was corrected or removed", () => {
    const en = JSON.parse(read("messages/en.json"));
    const r = en.evidenceImport.records;
    for (const key of ["disputed", "disputedByYou", "disputeRecorded", "disputeAlready"]) {
      expect(r[key], `${key} must exist`).toBeTruthy();
      expect(r[key]).not.toMatch(/\b(corrected|removed|deleted|fixed|false|proven)\b/i);
    }
    // And it says the opposite out loud.
    expect(r.disputeRecorded).toMatch(/unchanged/i);
  });

  it("every locale carrying this feature has the keys", () => {
    // `evidenceImport` exists only in the locales that carry this feature's
    // copy; inventing it elsewhere would fake coverage this product does not
    // have. The rule is parity ACROSS THE LOCALES THAT HAVE IT.
    const withFeature = ["en", "lt", "ru", "de", "nl"].filter((l) =>
      Boolean(JSON.parse(read(`messages/${l}.json`)).evidenceImport),
    );
    expect(withFeature.length).toBeGreaterThan(0);
    for (const loc of withFeature) {
      const m = JSON.parse(read(`messages/${loc}.json`)).evidenceImport;
      for (const key of [
        "disputed", "disputedByYou", "disputeOpen", "disputeNotePlaceholder",
        "disputeSubmit", "disputeCancel", "disputeRecorded", "disputeAlready",
        "disputeNotAllowed", "disputeFailed",
      ]) {
        expect(m.records[key], `${loc}.${key}`).toBeTruthy();
      }
      // DISPUTED became reachable, so the state catalogue must name it or the
      // chip would render a raw enum.
      expect(m.evidenceState.DISPUTED, `${loc}.evidenceState.DISPUTED`).toBeTruthy();
    }
  });
});

describe("the clash acknowledgement records, and never resolves", () => {
  it("v4 is called ONLY on the explicit acknowledgement", () => {
    expect(BOOKING).toMatch(/if \(input\.acknowledgeClash === true\)/);
    const v4At = BOOKING.indexOf("respond_booking_request_v4");
    const guardAt = BOOKING.indexOf("input.acknowledgeClash === true");
    expect(v4At).toBeGreaterThan(guardAt);
  });

  it("the default accept path is untouched and still calls v3", () => {
    expect(BOOKING).toMatch(/respond_booking_request_v3/);
    expect(BOOKING).toMatch(/p_acknowledge_clash: true/);
    // There is no call that passes it as false — the flag is opt-in only.
    expect(BOOKING).not.toMatch(/p_acknowledge_clash:\s*false/);
  });

  it("an absent v4 is reported, never silently downgraded to v3", () => {
    // Falling through to v3 would raise on the very overlap the person just
    // acknowledged and report it as a plain conflict, hiding the real reason.
    expect(BOOKING).toMatch(
      /isAbsentFunction\(v4\.error\)\) return \{ kind: "needs-migration" \}/,
    );
  });

  it("nothing cancels, hides or resolves the other booking", () => {
    expect(BOOKING).not.toMatch(/resolve_clash|clear_conflict|cancel_booking|suppress/i);
  });

  it("the acknowledgement is a separate deliberate action in the UI", () => {
    expect(BUTTONS).toMatch(/data-testid="booking-accept-anyway"/);
    expect(BUTTONS).toMatch(/respond\("accepted", true\)/);
    // Default false: the ordinary accept can never acknowledge by accident.
    expect(BUTTONS).toMatch(/acknowledgeClash = false/);
    expect(BUTTONS).toMatch(/onClick=\{\(\) => respond\("accepted"\)\}/);
  });

  it("the consequence is stated BEFORE the action is taken", () => {
    const stands = BUTTONS.indexOf("clash.stillStands");
    const button = BUTTONS.indexOf("booking-accept-anyway");
    expect(stands).toBeGreaterThan(-1);
    expect(stands).toBeLessThan(button);
  });

  it("the outcome says what was overridden", () => {
    expect(BUTTONS).toMatch(/data-testid="booking-clash-acknowledged"/);
    expect(BUTTONS).toMatch(/clash\.acknowledged/);
  });

  it("all 11 locales carry the clash copy, and none of it claims a fix", () => {
    for (const loc of ["en","lt","ru","de","nl","pl","lv","et","da","no","sv"]) {
      const c = JSON.parse(read(`messages/${loc}.json`)).bookings.clash;
      expect(c?.acceptAnyway, `${loc}.acceptAnyway`).toBeTruthy();
      expect(c?.stillStands, `${loc}.stillStands`).toBeTruthy();
      expect(c?.acknowledged, `${loc}.acknowledged`).toBeTruthy();
    }
    const en = JSON.parse(read("messages/en.json")).bookings.clash;
    expect(en.stillStands).toMatch(/not remove/i);
    expect(en.acknowledged).toMatch(/still clash/i);
    // Ban the CLAIM, not the word. An earlier draft of this assertion failed
    // on "nothing was cancelled or hidden" — a negation, and precisely the
    // honesty being tested. What must never appear is the positive form.
    expect(en.acknowledged).not.toMatch(
      /(?<!nothing )(?<!not )\b(?:was|were|has been|have been|is|are)\s+(?:now\s+)?(?:resolved|cleared|cancelled|canceled|fixed|removed)\b/i,
    );
    expect(en.acknowledged).toMatch(/nothing was cancelled or hidden/i);
  });
});

/**
 * THE SAME DECISION, REACHED FROM CHAT.
 *
 * The offer card routes to the SAME `respondBookingAction` through the one
 * dispatcher, so there is no second booking decision path and none may appear.
 * What the dispatcher adds is a confirmation token bound to
 * `canonicalInputHash(parsed.data)` — which is exactly why acknowledging has
 * to be its own confirmation: a token minted for the plain accept cannot
 * execute an acknowledged one, and vice versa. That is a feature, and these
 * assertions keep it.
 */
describe("the chat offer card reaches the acknowledgement honestly", () => {
  it("the schema carries ONE optional boolean and nothing else new", () => {
    const block = SCHEMA.slice(
      SCHEMA.indexOf("export const workerRespondBookingSchema"),
      SCHEMA.indexOf("export const workerExpressInterestSchema"),
    );
    expect(block).toMatch(/acknowledgeClash: z\.boolean\(\)\.optional\(\)/);
    // Optional, so every existing caller and every stored token keeps meaning.
    expect(block).not.toMatch(/acknowledgeClash:\s*z\.boolean\(\)\s*,/);
  });

  it("the executor passes it to the SAME action — no second path", () => {
    expect(EXECUTOR).toMatch(/acknowledgeClash: input\.acknowledgeClash \?\? false/);
    const calls = [...EXECUTOR.matchAll(/respondBookingAction\(/g)];
    expect(calls).toHaveLength(1);
  });

  it("the action id and its confirmation tier are untouched", () => {
    const registry = read("lib/conversation/action-registry.ts");
    expect(registry).toMatch(/id: "worker\.respond-booking"/);
    // No new conversation action was introduced for this.
    expect(registry).not.toMatch(/acknowledge-clash|respond-booking-anyway/);
  });

  it("the state fingerprint still reads only the booking id", () => {
    // If this ever needed the acknowledgement, the token semantics would have
    // changed and the work would have had to stop. It does not.
    const dispatch = read("lib/conversation/dispatch.ts");
    const fp = dispatch.slice(
      dispatch.indexOf("async function stateFingerprint"),
      dispatch.indexOf('if (actionId === "worker.respond-invitation")'),
    );
    expect(fp).toMatch(/String\(input\.bookingId\)/);
    expect(fp).not.toMatch(/acknowledgeClash/);
  });

  it("acknowledging requires its OWN confirmation, minted for that input", () => {
    // Prepare and dispatch must send the identical shape, or the bound
    // input hash makes it a stale-confirmation refusal.
    expect(CARD).toMatch(
      /prepareConfirmationAction\("worker\.respond-booking", \{[\s\S]{0,160}?acknowledgeClash: true/,
    );
    expect(CARD).toMatch(
      /dispatchWorkerAction\([\s\S]{0,400}?acknowledgeClash: true/,
    );
  });

  it("it is never acknowledged automatically", () => {
    expect(CARD).toMatch(/acknowledgeClash = false/);
    expect(CARD).toMatch(/beginConfirm\("accepted", true\)/);
    // The ordinary accept path passes no flag at all.
    expect(CARD).toMatch(/onClick=\{\(\) => beginConfirm\("accepted"\)\}/);
  });

  it("the consequence precedes the control here too", () => {
    const branch = CARD.slice(
      CARD.indexOf('if (phase.kind === "conflict")'),
      CARD.indexOf('if (phase.kind === "done")'),
    );
    expect(branch.length).toBeGreaterThan(0);
    expect(branch.indexOf("stillStands")).toBeLessThan(
      branch.indexOf("conversation-booking-accept-anyway"),
    );
    // The plain accept is not reachable from inside the conflict branch.
    expect(branch).not.toMatch(/beginConfirm\("accepted"\)/);
  });

  it("the overridden count is the REAL one, not a baked guess", () => {
    expect(CARD).toMatch(/count: phase\.acknowledgedClashes/);
    expect(CARD).toMatch(/data-testid="conversation-booking-clash-acknowledged"/);
  });

  it("no migration or schema change rides along", () => {
    // This edge is code only: the authority was applied separately and is
    // already live.
    expect(SCHEMA).not.toMatch(/create policy|alter table|security definer/i);
    expect(EXECUTOR).not.toMatch(/create policy|alter table|security definer/i);
  });
});
