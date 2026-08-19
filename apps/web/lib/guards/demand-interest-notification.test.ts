import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE MARKETPLACE'S DEFINING EVENT MUST REACH SOMEONE.
 *
 * Production held four real `demand_interest_signals` rows (2026-07-05) while
 * `notification_events` had zero inserts in its entire lifetime. Every other
 * domain — bookings, engagements, absences, workflows, documents, tasks — had
 * an emitter; the one event the platform exists for did not, so a company
 * learned a worker had raised their hand only by opening the scouting page
 * unprompted.
 *
 * These pins keep that closed. The failure mode is silent in both directions:
 * an admitted type with no emitter is a store that never hears its event, and
 * an emitter that resolves the recipient from caller input (rather than from
 * the signal's own rows) would tell the wrong person who applied where.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");
const CATALOGUE = [
  "en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru",
] as const;

describe("expressing interest emits a durable event", () => {
  it("the success path emits, and only after the domain write succeeded", () => {
    const src = read("lib", "opportunities", "interest.ts");
    const fn = src.slice(
      src.indexOf("export async function expressInterest"),
      src.indexOf("export async function withdrawInterest"),
    );
    expect(fn).toContain("emitDemandInterestNotification(signalId)");
    // The emit must sit BELOW the error branch — emitting before the upsert
    // was checked would announce an interest that was never stored.
    expect(fn.indexOf("return { kind: \"needs-migration\" }")).toBeLessThan(
      fn.indexOf("emitDemandInterestNotification(signalId)"),
    );
    // AWAITED on purpose: a detached promise can be killed when the serverless
    // invocation freezes at return, dropping the very notification this exists
    // to send. Safety is preserved by the emitter never throwing, not by
    // detaching it — so a `void` here is a regression, not a style choice.
    expect(fn).toMatch(/await emitDemandInterestNotification\(signalId\)/);
    expect(fn).not.toMatch(/void emitDemandInterestNotification/);
  });

  it("the signal id is read back, because the event is keyed on the ROW", () => {
    // Keying on request_id would notify the owner about the first worker only;
    // keying on nothing would re-notify on every idempotent re-express.
    const src = read("lib", "opportunities", "interest.ts");
    const fn = src.slice(
      src.indexOf("export async function expressInterest"),
      src.indexOf("export async function withdrawInterest"),
    );
    expect(fn).toContain('.select("id")');
    expect(fn).toContain("const signalId =");
  });
});

describe("the recipient is the demand owner, resolved from the rows", () => {
  it("reads customer_requests.profile_id, never a caller-supplied id", () => {
    const src = read("lib", "notifications", "event-emitters.ts");
    const fn = src.slice(
      src.indexOf("export async function emitDemandInterestNotification"),
    );
    const body = fn.slice(0, fn.indexOf("\n/** Absence lifecycle"));
    expect(body).toContain('.from("demand_interest_signals")');
    expect(body).toContain('.from("customer_requests")');
    expect(body).toContain("profile_id");
    // The emitter takes ONE argument — the signal id. A recipient parameter
    // would let a caller aim the notification.
    expect(body).toMatch(/emitDemandInterestNotification\(\s*signalId: string,?\s*\)/);
  });

  it("never notifies a demand owner about their own interest", () => {
    const src = read("lib", "notifications", "event-emitters.ts");
    const body = src.slice(
      src.indexOf("export async function emitDemandInterestNotification"),
    );
    expect(body).toMatch(/actor === owner\)\s*return;/);
  });

  it("the insert itself is awaited, not detached into the background", () => {
    const src = read("lib", "notifications", "event-emitters.ts");
    const body = src.slice(
      src.indexOf("export async function emitDemandInterestNotification"),
      src.indexOf("/** Absence lifecycle"),
    );
    expect(body).toContain("await emitNotificationEvent(admin, {");
    expect(body).not.toContain("emitNotificationEventInBackground");
  });

  it("carries no free text — the worker's note never reaches the event", () => {
    const src = read("lib", "notifications", "event-emitters.ts");
    const body = src.slice(
      src.indexOf("export async function emitDemandInterestNotification"),
      src.indexOf("/** Absence lifecycle"),
    );
    expect(body).not.toContain("note");
    // country only, and only when it is an ISO-3166 alpha-2 code.
    expect(body).toMatch(/\/\^\[A-Z\]\{2\}\$\//);
  });
});

describe("the type is admitted, routed and labelled everywhere", () => {
  it("the union carries the type and the entity the migration admits", () => {
    const src = read("lib", "notifications", "events.ts");
    expect(src).toContain('"demand_interest_expressed"');
    expect(src).toContain('"demand_interest_signal"');
  });

  it("the entity resolves to the scouting surface", () => {
    const src = read("lib", "notifications", "events.ts");
    expect(src).toContain('demand_interest_signal: "/dashboard/company/scouting"');
  });

  it("the migration widens both CHECKs as a strict superset", () => {
    const sql = readFileSync(
      join(
        WEB, "..", "..", "supabase", "migrations",
        "20260819110000_notification_events_v5_demand_interest.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("'demand_interest_expressed'");
    expect(sql).toContain("'demand_interest_signal'");
    // Every v4 type must survive the re-add — a widening that quietly drops a
    // type would invalidate stored rows.
    for (const t of [
      "booking_proposed", "booking_accepted", "booking_declined",
      "booking_withdrawn", "absence_requested", "absence_approved",
      "absence_rejected", "engagement_created", "engagement_ended",
      "workflow_step_pending", "workflow_decided", "workflow_delegated",
      "workflow_escalated", "document_ack_assigned", "document_ack_completed",
      "document_expiring", "work_task_assigned",
    ]) {
      expect(sql).toContain(`'${t}'`);
    }
  });

  it("every catalogue labels it — an unlabelled type renders as generic", () => {
    for (const loc of CATALOGUE) {
      const json = JSON.parse(read("messages", `${loc}.json`)) as Record<
        string,
        unknown
      >;
      const types = (
        (json.auth as Record<string, Record<string, Record<string, string>>>)
          ?.notifications
      )?.types;
      expect(types?.event_demand_interest_expressed, `missing in ${loc}`).toBeTruthy();
    }
  });
});
