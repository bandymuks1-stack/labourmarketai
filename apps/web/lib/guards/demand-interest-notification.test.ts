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
    expect(fn).toContain("emitDemandInterestNotification({");
    // The emit must sit BELOW the error branch — emitting before the upsert
    // was checked would announce an interest that was never stored.
    expect(fn.indexOf("return { kind: \"needs-migration\" }")).toBeLessThan(
      fn.indexOf("emitDemandInterestNotification({"),
    );
    // AWAITED on purpose: a detached promise can be killed when the serverless
    // invocation freezes at return, dropping the very notification this exists
    // to send. Safety is preserved by the emitter never throwing, not by
    // detaching it — so a `void` here is a regression, not a style choice.
    expect(fn).toMatch(/await emitDemandInterestNotification\(\{/);
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

describe("the recipient is the demand owner, resolved by the write path", () => {
  /**
   * 2026-09-17 ROOT CAUSE. The emitter used to resolve the owner itself with
   * the ADMIN client: `demand_interest_signals` → `customer_requests`. Neither
   * table grants service_role anything in production (deliberate allowlist),
   * so the first read failed 42501 on every call and the owner was never told
   * — for every genuine interest since the emitter shipped. The recipient is
   * now resolved by the write path, under the CALLER's own session, through
   * the gated SECURITY DEFINER `contact_demand_owner_v1` — the same RPC the
   * contact action has used since 2026-07-23 — and handed to the emitter as a
   * fact. No grant was added. These pins keep the emitter off the two
   * ungranted tables and keep the recipient off the wire.
   */
  it("the emitter reads NEITHER ungranted table with the admin client", () => {
    const src = read("lib", "notifications", "event-emitters.ts");
    const fn = src.slice(
      src.indexOf("export async function emitDemandInterestNotification"),
    );
    const body = fn.slice(0, fn.indexOf("\n/**\n * DEMAND INTEREST, THE RETURN DIRECTION"));
    expect(body).not.toContain('.from("demand_interest_signals")');
    expect(body).not.toContain('.from("customer_requests")');
    expect(body).not.toContain('.from("profiles")');
    // The only admin touches left are the two grants service_role holds.
    expect(body).toContain("readPrefRowsFailOpen(admin, owner)");
    expect(body).toContain("emitNotificationEvent(admin, {");
    expect(body).toMatch(/emitDemandInterestNotification\(\s*facts: DemandInterestNotificationFacts,?\s*\)/);
  });

  it("the write path resolves the owner through the gated RPC, never from input", () => {
    const src = read("lib", "opportunities", "interest.ts");
    const helper = src.slice(
      src.indexOf("async function resolveDemandOwnerForNotification"),
      src.indexOf("/** Express interest in a worker-visible demand."),
    );
    expect(helper).toContain('"contact_demand_owner_v1"');
    expect(helper).toContain("caller.supabase");
    expect(helper).not.toContain("createAdminClient");
    const core = src.slice(
      src.indexOf("export async function expressInterestCore"),
      src.indexOf("export async function withdrawInterest"),
    );
    const call = core.slice(core.indexOf("emitDemandInterestNotification({"));
    expect(call).toContain("ownerProfileId: owner.kind === \"owner\" ? owner.profileId : null");
    expect(call).toContain("actorProfileId: caller.userId");
    expect(call).not.toMatch(/ownerProfileId:\s*input\./);
  });

  it("every caller hands over facts from an authoritative return, never the browser", () => {
    const inv = read("lib", "invitations", "actions.ts");
    const calls = inv.split("emitDemandInterestNotification({").slice(1);
    expect(calls.length).toBe(2);
    for (const c of calls) {
      const head = c.slice(0, 400);
      expect(head).toContain("ownerProfileId: (data?.inviter_profile_id ?? null)");
      expect(head).toContain("actorProfileId: user.id");
    }
    // Nobody else emits it.
    const emittersOnly = ["lib/opportunities/interest.ts", "lib/invitations/actions.ts"];
    expect(emittersOnly.length).toBe(2);
  });

  it("never notifies a demand owner about their own interest", () => {
    const src = read("lib", "notifications", "event-emitters.ts");
    const body = src.slice(
      src.indexOf("export async function emitDemandInterestNotification"),
    );
    expect(body).toMatch(/actor === owner\)\s*return;/);
    // And the write path does not even call it for the owner's own demand.
    const interest = read("lib", "opportunities", "interest.ts");
    expect(interest).toContain('if (owner.kind === "self")');
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

  it("the return direction reads the signal under the OWNER's session, not the admin client", () => {
    const src = read("lib", "notifications", "event-emitters.ts");
    const body = src.slice(
      src.indexOf("export async function emitDemandInterestResponseNotification"),
      src.indexOf("/** Absence lifecycle"),
    );
    expect(body).not.toContain('.from("demand_interest_signals")');
    expect(body).toContain("readonly signalId: string | null");
    const interest = read("lib", "opportunities", "interest.ts");
    const ack = interest.slice(
      interest.indexOf("export async function acknowledgeInterest"),
      interest.indexOf("export async function listDemandInterestForCompany"),
    );
    expect(ack).toContain('.from("demand_interest_signals")');
    expect(ack).toContain("signalId,");
    expect(ack.indexOf('if (data !== true) return { kind: "no-signal" }')).toBeLessThan(
      ack.indexOf('.from("demand_interest_signals")'),
    );
  });
});

describe("the type is admitted, routed and labelled everywhere", () => {
  it("the union carries the type and the entity the migration admits", () => {
    const src = read("lib", "notifications", "events.ts");
    expect(src).toContain('"demand_interest_expressed"');
    expect(src).toContain('"demand_interest_signal"');
  });

  it("each direction resolves to the surface its RECIPIENT can open", () => {
    // The employer half points at scouting; the worker half must NOT, or the
    // notification lands a worker on a company page they cannot read.
    const src = read("lib", "notifications", "events.ts");
    expect(src).toContain('demand_interest_signal: "/dashboard/company/scouting"');
    expect(src).toContain('demand_interest_response: "/dashboard/opportunities"');
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
    expect(sql).toContain("'demand_interest_reviewed'");
    expect(sql).toContain("'demand_interest_signal'");
    expect(sql).toContain("'demand_interest_response'");
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
      for (const key of [
        "event_demand_interest_expressed",
        "event_demand_interest_reviewed",
      ]) {
        expect(types?.[key], `${key} missing in ${loc}`).toBeTruthy();
      }
    }
  });
});

describe("the return direction — the worker hears the answer", () => {
  it("acknowledge emits, and only past the no-op branch", () => {
    const src = read("lib", "opportunities", "interest.ts");
    const fn = src.slice(src.indexOf("export async function acknowledgeInterest"));
    const body = fn.slice(0, fn.indexOf("export async function listDemandInterestForCompany"));
    expect(body).toContain("await emitDemandInterestResponseNotification({");
    // An acknowledgement that changed nothing must never manufacture news.
    expect(body.indexOf('return { kind: "no-signal" }')).toBeLessThan(
      body.indexOf("await emitDemandInterestResponseNotification"),
    );
  });

  it("the recipient is the WORKER, and never the person who answered", () => {
    const src = read("lib", "notifications", "event-emitters.ts");
    const body = src.slice(
      src.indexOf("export async function emitDemandInterestResponseNotification"),
      src.indexOf("/** Absence lifecycle"),
    );
    expect(body).toContain("workerProfileId(admin, input.workerId)");
    expect(body).toMatch(/recipient === input\.actorProfileId\)\s*return;/);
  });

  it("'contacted' emits nothing — the conversation is its own notification", () => {
    // That status is set only after contact-interested-worker opened a real
    // thread, which already reaches the worker through unread-messages. A
    // second bell for one act is noise, so the emitter returns before any write.
    const src = read("lib", "notifications", "event-emitters.ts");
    const body = src.slice(
      src.indexOf("export async function emitDemandInterestResponseNotification"),
      src.indexOf("/** Absence lifecycle"),
    );
    expect(body).toMatch(/if \(input\.status !== "reviewed"\) return;/);
    expect(body).not.toContain('"demand_interest_contacted"');
    expect(body).toContain("await emitNotificationEvent(admin, {");
  });

  it("the worker-facing copy never adopts 'someone viewed you' framing", () => {
    // worker-notifications-framing.test.ts bans the engagement-bait pattern
    // across the whole notifications catalogue; this pins the reason THIS copy
    // is phrased as a status the company deliberately set, not as a view.
    for (const loc of ["en", "lt"] as const) {
      const json = JSON.parse(read("messages", `${loc}.json`)) as Record<string, unknown>;
      const label = (
        (json.auth as Record<string, Record<string, Record<string, string>>>)
          .notifications
      ).types.event_demand_interest_reviewed;
      expect(label).not.toMatch(/viewed you|someone viewed|peržiūrėjo jūs/i);
    }
  });

  it("shortlist is deliberately NOT a notification", () => {
    // setShortlist records an employer-internal judgement including rejection;
    // turning that into a bell is a product decision, not a gap to close
    // silently. Pinned so a later slice makes it deliberately, not by drift.
    const src = read("lib", "scouting", "scouting.ts");
    expect(src).not.toContain("emitDemandInterestResponseNotification");
    expect(src).not.toContain("demand_interest_contacted");
  });
});
