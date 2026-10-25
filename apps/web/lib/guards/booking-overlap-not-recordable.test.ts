import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE "ACCEPT ANYWAY" BUTTON MAY NOT LOOP (production 2026-10-25, walk
 * orders-bookings O-5).
 *
 * RED #5 let v4 skip its own clash check when the person acknowledged the
 * overlap, but never relaxed the table constraint
 * `booking_requests_no_overlapping_accepted`. The acknowledged UPDATE failed
 * with 23P01, the action mapped it back to the plain `conflict`, and the UI
 * re-showed the same question with the same button — which then visibly did
 * nothing, forever.
 *
 * Until the constraint is completed (a RED migration, owner-gated), the
 * refusal must be its OWN answer, said in one calm sentence, with the
 * acknowledgement control gone. These assertions keep that true.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");

const BOOKING = read("lib/booking/booking-actions.ts");
const STATE = read("lib/booking/booking-state.ts");
const CONTRACT = read("lib/conversation/executor-contract.ts");
const BUTTONS = read("components/app/booking-respond-buttons.tsx");
const CARD = read("components/app/conversation/worker-booking-action.tsx");

/** The source of one `if (<kind> === "<value>") { … }` early-return branch. */
function branch(src: string, head: string, nextHead: string): string {
  const at = src.indexOf(head);
  const end = src.indexOf(nextHead, at + head.length);
  expect(at, `missing ${head}`).toBeGreaterThan(-1);
  expect(end, `missing ${nextHead}`).toBeGreaterThan(at);
  return src.slice(at, end);
}

describe("the action names the refused acknowledgement distinctly", () => {
  it("the result union carries its own kind", () => {
    expect(BOOKING).toMatch(/\| \{ kind: "overlap-not-recordable" \}/);
  });

  it("only the ACKNOWLEDGED v4 path can produce it, before the generic classifier", () => {
    const v4 = BOOKING.slice(
      BOOKING.indexOf("if (input.acknowledgeClash === true)"),
      BOOKING.indexOf('rpc("respond_booking_request_v3"'),
    );
    const own = v4.indexOf('return { kind: "overlap-not-recordable" }');
    const generic = v4.indexOf("return classify(v4.error)");
    expect(own).toBeGreaterThan(-1);
    expect(generic).toBeGreaterThan(own);
    // And nowhere else: the default v3 path keeps its plain conflict.
    expect(BOOKING.match(/kind: "overlap-not-recordable" \}/g)).toHaveLength(2); // type + return
  });

  it("the classifier itself is unchanged — 23P01 is still the plain conflict", () => {
    const cls = BOOKING.slice(BOOKING.indexOf("function classify("), BOOKING.indexOf("function classify(") + 400);
    expect(cls).toMatch(/return \{ kind: "conflict" \}/);
    expect(cls).not.toMatch(/overlap-not-recordable/);
  });

  it("the detector tells the table constraint from the RPC's own check", () => {
    expect(STATE).toMatch(/export function isOverlapExclusionViolation/);
    expect(STATE).toMatch(/booking_requests_no_overlapping_accepted\|exclusion constraint/);
    expect(STATE).toMatch(/!\/conflicting accepted booking\/i/);
  });

  it("the chat dispatcher maps it to its own code", () => {
    expect(CONTRACT).toMatch(/case "overlap-not-recordable":\s*return "overlap_not_recordable"/);
  });
});

describe("neither surface can loop the acknowledgement", () => {
  it("bookings list: its own branch, before the conflict branch, with no accept control", () => {
    expect(BUTTONS).toMatch(/res\.kind === "overlap-not-recordable"/);
    const b = branch(BUTTONS, 'if (state.kind === "overlap-not-recordable")', 'if (state.kind === "conflict")');
    expect(b).toMatch(/data-testid="booking-overlap-not-recordable"/);
    expect(b).toMatch(/t\("clash\.notRecordable"\)/);
    expect(b).toMatch(/role="status"/);
    // The loop was this button. It — and the plain accept — are gone here.
    expect(b).not.toMatch(/booking-accept-anyway/);
    expect(b).not.toMatch(/respond\("accepted"/);
    // What is left: decline, through the ONE shared decline step.
    expect(b).toMatch(/declineForm\(\)/);
    expect(b).toMatch(/labels\.decline/);
  });

  it("bookings list: the decline step is one shared form, not a second copy", () => {
    expect(BUTTONS.match(/data-testid="booking-decline-form"/g)).toHaveLength(1);
    expect(BUTTONS.match(/data-testid="booking-decline-confirm"/g)).toHaveLength(1);
  });

  it("chat card: its own phase, before the conflict phase, with no accept control", () => {
    expect(CARD).toMatch(/res\.code === "overlap_not_recordable"/);
    const b = branch(CARD, 'if (phase.kind === "overlap-not-recordable")', 'if (phase.kind === "conflict")');
    expect(b).toMatch(/data-testid="conversation-booking-overlap-not-recordable"/);
    expect(b).toMatch(/tClash\("notRecordable"\)/);
    expect(b).not.toMatch(/accept-anyway/);
    expect(b).not.toMatch(/beginConfirm\("accepted"/);
    expect(b).toMatch(/beginConfirm\("declined"\)/);
  });

  it("chat card: cancelling the decline returns to the overlap answer, not the plain offer", () => {
    expect(CARD).toMatch(/overlapRefused \? \{ kind: "overlap-not-recordable" \} : \{ kind: "idle" \}/);
  });
});

describe("the sentence, in every locale that carries the clash copy", () => {
  const LOCALES = ["en", "lt", "ru", "nl", "de", "pl", "da", "et", "lv", "no", "sv"];

  it("exists everywhere the clash copy exists", () => {
    for (const loc of LOCALES) {
      const c = JSON.parse(read(`messages/${loc}.json`)).bookings.clash;
      expect(c?.notRecordable, `${loc}.bookings.clash.notRecordable`).toBeTruthy();
      expect(c.notRecordable).not.toMatch(/\{/); // nothing to interpolate, nothing to leak
    }
  });

  it("says what happened and what is left — and claims no acceptance", () => {
    const en = JSON.parse(read("messages/en.json")).bookings.clash.notRecordable as string;
    expect(en).toMatch(/overlap/i);
    expect(en).toMatch(/can't be recorded yet/i);
    expect(en).toMatch(/decline/i);
    expect(en).toMatch(/change the dates/i);
    expect(en).not.toMatch(/\b(accepted anyway|was accepted|is accepted)\b/i);
    // One calm sentence.
    expect(en.match(/[.!?](\s|$)/g)).toHaveLength(1);
  });

  it("Lithuanian speaks to the person as \"tu\"", () => {
    const lt = JSON.parse(read("messages/lt.json")).bookings.clash.notRecordable as string;
    expect(lt).toMatch(/\bpriėmei\b/);
    expect(lt).toMatch(/\bgali\b/);
    expect(lt).not.toMatch(/\b(jūs|galite|priėmėte)\b/i);
  });
});
