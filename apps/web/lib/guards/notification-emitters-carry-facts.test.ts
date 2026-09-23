import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * NOTIFICATION EMITTERS CARRY THEIR FACTS — no admin read of an ungranted
 * table, ever again.
 *
 * Production deliberately allowlists service_role table grants. Verified
 * 2026-09-23 through information_schema.role_table_grants (grantee =
 * 'service_role', schema public): the notification spine holds
 * notification_events I/S/U, notification_preferences S, workers S and
 * journal_entries S — and NOTHING on booking_requests,
 * company_worker_engagements, companies, work_tasks, worker_absences,
 * demand_interest_signals, customer_requests, invitations or profiles.
 *
 * Every write-path emitter in lib/notifications/event-emitters.ts used to
 * open with an admin-client read of exactly one of those tables to find its
 * recipient. PostgREST answered 42501, `maybeSingle()` surfaced it as a null
 * row, the emitter logged `row_unreadable`, and nine event types (four
 * booking, two engagement, one task, two absence outcomes) delivered nothing
 * — the same class #1761 closed for demand interest, and invisible to every
 * green test because the tests never held the production grant table.
 *
 * The fix grants nothing: the WRITE PATH reads the row it just wrote under
 * the caller's own session (RLS admits the two parties by construction) and
 * hands the emitter a facts object. This guard pins that shape from both
 * ends, with negative controls so the detector is known to detect.
 *
 * WHEN the write path reads is part of the shape. The applied
 * `worker_absences_select` (20260808120000) admits a manager only while
 * `status = 'requested'`, and `review_worker_absence_v1` is what ends that:
 * the review path must read its facts BEFORE the RPC, or the two absence
 * outcomes are undelivered again under a truthful-looking
 * `recipient_unresolved`. Pinned below by index comparison, with the exact
 * first-cut (post-RPC) shape as the negative control.
 *
 * DELIBERATELY NOT LISTED: `profiles`. `email-dispatch.ts` reads
 * profiles.email with the admin client, and that grant is knowingly
 * withheld until email delivery is turned on (migration 20260908070000, "NEXT
 * PREREQUISITE"); the hop stops at `channel_disabled` first. Listing it here
 * would fail on a documented owner decision, not a defect.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");
/** CRLF-safe: a Windows checkout must not change what the detector sees. */
const lf = (s: string): string => s.replace(/\r\n/g, "\n");

/** The source between two markers (from the first to the start of the second). */
function sliceBetween(src: string, from: string, to: string): string {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + 1);
  return a >= 0 && b > a ? src.slice(a, b) : "";
}

const REVIEW_RPC = /\.rpc\(\s*["']review_worker_absence_v1["']/;

/**
 * In a review action's source, is the facts read placed BEFORE the review
 * RPC? Ordering is what the applied RLS makes load-bearing: the manager's
 * SELECT arm on worker_absences closes the moment the RPC leaves
 * `requested`. Index comparison on the lf'd source, so CRLF cannot move it.
 */
function readsFactsBeforeReviewRpc(reviewSource: string): boolean {
  const s = lf(reviewSource);
  const factsAt = s.indexOf("absenceNotificationFacts(");
  const rpcAt = s.search(REVIEW_RPC);
  return factsAt >= 0 && rpcAt >= 0 && factsAt < rpcAt;
}

/** Domain tables service_role holds NO grant on (production, 2026-09-23). */
const UNGRANTED_DOMAIN_TABLES = [
  "booking_requests",
  "company_worker_engagements",
  "companies",
  "work_tasks",
  "worker_absences",
  "demand_interest_signals",
  "invitations",
  "customer_requests",
] as const;

/**
 * A module is ADMIN-SCOPED when it mints the admin client itself OR is
 * handed one: a parameter or variable typed `AdminClient`, or one named
 * `admin` that is declared (`admin:`) or read through (`admin.from(`). The
 * second shape is the module's own existing pattern — `deliver(admin, …)`,
 * `workerProfileId(admin, …)`, email-dispatch's `admin` argument — and a
 * `.from()` of an ungranted table through it is the same 42501-as-null
 * silence one indirection away. Deliberately file-scoped, not
 * receiver-scoped: a module that mixes a handed-over admin client with a
 * caller-session read of one of these tables is flagged too, and must say
 * so here if that is ever the intended design.
 */
const ADMIN_SCOPED = /createAdminClient\s*\(|\bAdminClient\b|\badmin\s*(:|\.from\()/;

/**
 * The tables a module reads that the admin client cannot. A module that is
 * not admin-scoped is out of scope: its reads run under a caller session and
 * RLS, which is exactly the allowed pattern.
 */
function ungrantedAdminReads(source: string): string[] {
  const src = lf(source);
  if (!ADMIN_SCOPED.test(src)) return [];
  const hits: string[] = [];
  for (const table of UNGRANTED_DOMAIN_TABLES) {
    const rx = new RegExp(`\\.from\\(\\s*["'\`]${table}["'\`]\\s*\\)`);
    if (rx.test(src)) hits.push(table);
  }
  return hits;
}

const EMITTERS = read("lib", "notifications", "event-emitters.ts");

describe("the detector detects (negative controls)", () => {
  it("flags the exact pre-2026-09-23 emitter shape, CRLF included", () => {
    const before =
      'const admin = createAdminClient();\r\n' +
      '    const { data } = await admin\r\n' +
      '      .from("booking_requests")\r\n' +
      '      .select("owner_id, worker_id, start_date, location_country")\r\n' +
      '      .eq("id", bookingId)\r\n' +
      "      .maybeSingle();\r\n";
    expect(ungrantedAdminReads(before)).toEqual(["booking_requests"]);
  });

  it("flags an inline chain and single quotes", () => {
    expect(ungrantedAdminReads("createAdminClient().from('work_tasks')")).toEqual([
      "work_tasks",
    ]);
    expect(
      ungrantedAdminReads(
        'const a = createAdminClient(); a.from( "worker_absences" ); a.from(`companies`)',
      ),
    ).toEqual(["companies", "worker_absences"]);
  });

  it("flags a module that is HANDED the admin client instead of minting it", () => {
    // The parameter pattern the module already uses (`deliver(admin, …)`).
    expect(
      ungrantedAdminReads(
        'async function x(admin: AdminClient) { await admin.from("booking_requests") }',
      ),
    ).toEqual(["booking_requests"]);
    // The type alone marks the module, whatever the parameter is called.
    expect(
      ungrantedAdminReads(
        'async function y(client: AdminClient) { await client.from("work_tasks") }',
      ),
    ).toEqual(["work_tasks"]);
    // The name alone marks it too, CRLF'd across the chain like real code.
    expect(
      ungrantedAdminReads(
        "function z(admin: DbClient) {\r\n  return admin\r\n    .from('worker_absences')\r\n}",
      ),
    ).toEqual(["worker_absences"]);
  });

  it("does NOT flag the allowed pattern — a caller-session read with no admin client", () => {
    expect(
      ungrantedAdminReads(
        'const supabase = await createClient();\nawait supabase.from("booking_requests").select("owner_id")',
      ),
    ).toEqual([]);
  });

  it("does NOT flag admin reads of the granted tables", () => {
    expect(
      ungrantedAdminReads(
        'const admin = createAdminClient();\nadmin.from("workers").select("profile_id");\nadmin.from("notification_events").insert({});',
      ),
    ).toEqual([]);
  });

  it("the ordering detector sees the exact 3db8eda4 review shape as WRONG, and the fix as right", () => {
    // Verbatim shape of the first cut of this PR: facts read AFTER the RPC,
    // i.e. after the manager's SELECT arm had already closed. CRLF included.
    const preFix =
      "  const { error } = await asAny(supabase).rpc(\"review_worker_absence_v1\", {\r\n" +
      "    p_absence_id: input.absenceId,\r\n" +
      "    p_decision: input.decision,\r\n" +
      "  });\r\n" +
      "  if (error) return mapError(error);\r\n" +
      "  await emitAbsenceNotification(\r\n" +
      "    await absenceNotificationFacts(supabase, input.absenceId),\r\n" +
      '    input.decision === "approved" ? "absence_approved" : "absence_rejected",\r\n' +
      "  );\r\n";
    expect(readsFactsBeforeReviewRpc(preFix)).toBe(false);
    const fixed =
      "  const facts = await absenceNotificationFacts(supabase, input.absenceId);\r\n" +
      "  const { error } = await asAny(supabase).rpc(\"review_worker_absence_v1\", {\r\n" +
      "    p_absence_id: input.absenceId,\r\n" +
      "  });\r\n" +
      "  if (error) return mapError(error);\r\n" +
      "  await emitAbsenceNotification(facts, eventType);\r\n";
    expect(readsFactsBeforeReviewRpc(fixed)).toBe(true);
    // A source with either marker missing is never "before".
    expect(readsFactsBeforeReviewRpc("await emitAbsenceNotification(facts, t);")).toBe(false);
    expect(readsFactsBeforeReviewRpc('.rpc("review_worker_absence_v1", {})')).toBe(false);
  });
});

describe("lib/notifications never reads an ungranted table with the admin client", () => {
  const dir = join(WEB, "lib", "notifications");
  const modules = readdirSync(dir).filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
  );

  it("scans a real inventory", () => {
    expect(modules).toContain("event-emitters.ts");
    expect(modules.length).toBeGreaterThan(5);
  });

  it.each(modules)("%s", (file) => {
    const src = readFileSync(join(dir, file), "utf8");
    expect(ungrantedAdminReads(src), `${file} reads an ungranted table via service_role`).toEqual([]);
  });

  it("the symptom is gone from the six fact-carrying emitters: none reports `row_unreadable`", () => {
    // That reason existed only because an emitter read a domain row itself.
    // With facts handed over, an unresolved recipient is named as such.
    // Scoped to the write-path section this fix covers: the workflow and
    // document emitters below it still read their engine tables with the
    // admin client (also ungranted — the same class, recorded as residue,
    // and behind owner-gated engine migrations); they are out of this lane.
    const writePath = lf(EMITTERS).slice(
      lf(EMITTERS).indexOf("export interface BookingNotificationFacts"),
      lf(EMITTERS).indexOf("Workflow & Approval Engine v1"),
    );
    expect(writePath.length).toBeGreaterThan(5000);
    expect(writePath).not.toContain('"row_unreadable"');
    expect(writePath).toContain('"recipient_unresolved"');
  });
});

describe("every affected emitter takes facts and answers { delivered, reason }", () => {
  const src = lf(EMITTERS);

  it.each([
    ["emitBookingNotification", "BookingNotificationFacts"],
    ["emitEngagementCreatedNotification", "BookingNotificationFacts"],
    ["emitEngagementEndedNotification", "EngagementEndedNotificationFacts"],
    ["emitWorkTaskAssignedNotification", "WorkTaskAssignedNotificationFacts"],
    ["emitAbsenceNotification", "AbsenceNotificationFacts"],
    ["emitDemandInterestNotification", "DemandInterestNotificationFacts"],
  ] as const)("%s(facts: %s)", (name, factsType) => {
    const rx = new RegExp(
      `export async function ${name}\\(\\s*facts: ${factsType},?[\\s\\S]{0,260}?\\): Promise<NotificationEmitResult>`,
    );
    expect(src, `${name} must take ${factsType} and return NotificationEmitResult`).toMatch(rx);
  });

  it("the facts types are exported, so callers cannot drift from the emitter's contract", () => {
    for (const t of [
      "BookingNotificationFacts",
      "EngagementEndedNotificationFacts",
      "WorkTaskAssignedNotificationFacts",
      "AbsenceNotificationFacts",
    ]) {
      expect(src).toContain(`export interface ${t} {`);
    }
    expect(src).toContain("export type NotificationEmitResult =");
    expect(src).toContain("export type NotificationUndeliveredReason =");
  });

  it("a missing recipient is a LOGGED miss, and the approved silences are unlogged results", () => {
    // One helper logs and returns; the marker stays greppable.
    expect(src).toContain("export const NOTIFICATION_UNDELIVERED");
    expect(src).toMatch(/function undeliveredResult\(/);
    expect(
      (src.match(/undeliveredResult\([^)]*"recipient_unresolved"\)/g) ?? []).length,
    ).toBeGreaterThanOrEqual(5);
    // Self-action silences return without the marker.
    for (const line of src.split("\n")) {
      if (line.includes('reason: "self_action"')) {
        expect(line, "a self_action silence must not fire the marker").not.toMatch(
          /notDelivered|undelivered\(/,
        );
      }
    }
    // The return-direction emitter's catch is no longer bare.
    const response = src.slice(
      src.indexOf("export async function emitDemandInterestResponseNotification"),
      src.indexOf("export interface AbsenceNotificationFacts"),
    );
    expect(response).not.toMatch(/\}\s*catch\s*\{\s*(\/\/[^\n]*\n\s*)*\}/);
    expect(response).toMatch(/undeliveredResult\(\s*"demand_interest_reviewed",\s*"threw"/);
  });
});

describe("every write path resolves its facts under the CALLER's session", () => {
  it("bookings: one row read serves the booking bell and the engagement bell", () => {
    const src = lf(read("lib", "booking", "booking-actions.ts"));
    expect(src).toMatch(/async function bookingNotificationFacts\(/);
    const facts = src.slice(src.indexOf("async function bookingNotificationFacts("));
    expect(facts).toContain('.from("booking_requests")');
    expect(facts).toContain('.select("owner_id, worker_id, start_date, location_country")');
    expect(src).not.toMatch(/createAdminClient|supabase\/admin/);
    // propose ×1, declined ×3, accepted ×3, withdrawn ×3 — every lifecycle
    // success return rings its bell through the one facts-carrying helper.
    expect(src.match(/notifyBooking\(supabase, /g) ?? []).toHaveLength(10);
    // The two engagement-minting accepts ring BOTH bells from one read.
    expect(
      src.match(/notifyBooking\(supabase, input\.bookingId, "booking_accepted", engagement === "created"\)/g) ?? [],
    ).toHaveLength(2);
    // Negative control: the id-only calls are gone.
    expect(src).not.toMatch(/emitBookingNotification\((input\.bookingId|newBookingId)/);
    expect(src).not.toMatch(/emitEngagementCreatedNotification\(input\.bookingId\)/);
  });

  it("engagement end: the row and, for a worker actor, the company owner pointer", () => {
    const src = lf(read("lib", "engagements", "end-engagement.ts"));
    const facts = src.slice(src.indexOf("async function engagementEndedNotificationFacts("));
    expect(facts).toContain('.from("company_worker_engagements")');
    expect(facts).toMatch(/actorSide === "worker"[\s\S]{0,300}\.from\("companies"\)/);
    expect(src).toContain(
      "await engagementEndedNotificationFacts(client, engagement, actorSide)",
    );
    expect(src).not.toMatch(/createAdminClient|supabase\/admin/);
  });

  it("absences: request and review both hand over the stored row", () => {
    const src = lf(read("lib", "leave", "absences-actions.ts"));
    const facts = src.slice(src.indexOf("async function absenceNotificationFacts("));
    expect(facts).toContain('.from("worker_absences")');
    expect(facts).toContain('.select("worker_id, requested_by, start_date")');
    expect(src.match(/await absenceNotificationFacts\(supabase, /g) ?? []).toHaveLength(2);
    expect(src).not.toMatch(/createAdminClient|supabase\/admin/);
    expect(src).not.toMatch(/emitAbsenceNotification\((newAbsenceId|input\.absenceId),/);
    // The status gate is documented where the read lives, not only here.
    const factsDoc = src.slice(0, src.indexOf("async function absenceNotificationFacts("));
    expect(factsDoc).toMatch(/status = 'requested'/);
  });

  it("absences: the REVIEW path reads its facts BEFORE the RPC closes the manager's SELECT arm", () => {
    // The applied worker_absences_select (20260808120000) admits a manager
    // only while status = 'requested'; review_worker_absence_v1 leaves the row
    // approved/rejected. A post-RPC read under the reviewer's session is a
    // null row for every ordinary reviewer — the two outcome events this lane
    // exists to deliver would stay undelivered, now under a misleading reason.
    const src = lf(read("lib", "leave", "absences-actions.ts"));
    const review = sliceBetween(
      src,
      "export async function reviewAbsenceAction(",
      "export async function cancelAbsenceAction(",
    );
    expect(review.length).toBeGreaterThan(200);
    expect(readsFactsBeforeReviewRpc(review)).toBe(true);
    // …and still rings only once the RPC has decided: a refused review emits nothing.
    const rpcAt = review.search(REVIEW_RPC);
    const errorReturnAt = review.indexOf("if (error) return mapError(error);");
    const emitAt = review.indexOf("emitAbsenceNotification(");
    expect(rpcAt).toBeGreaterThan(-1);
    expect(errorReturnAt).toBeGreaterThan(rpcAt);
    expect(emitAt).toBeGreaterThan(errorReturnAt);
    // The REQUEST path is the other way round, and correctly so: the id does
    // not exist before the write, and the requester is the worker, admitted
    // by the policy in every status.
    const request = sliceBetween(
      src,
      "export async function requestAbsenceAction(",
      "export async function reviewAbsenceAction(",
    );
    const requestRpcAt = request.search(/\.rpc\(\s*"request_worker_absence_v1"/);
    expect(requestRpcAt).toBeGreaterThan(-1);
    expect(request.indexOf("absenceNotificationFacts(")).toBeGreaterThan(requestRpcAt);
  });

  it("tasks: the ONE RLS-scoped reader lends both write paths the stored assignee", () => {
    const reads = lf(read("lib", "tasks", "tasks.ts"));
    expect(reads).toContain("export async function readWorkTaskAssignmentFacts(");
    expect(reads).toMatch(
      /readWorkTaskAssignmentFacts\([\s\S]{0,400}\.from\("work_tasks"\)[\s\S]{0,80}\.select\("assignee_profile_id, due_at"\)/,
    );
    for (const rel of ["task-actions.ts", "create-task-core.ts"] as const) {
      const src = lf(read("lib", "tasks", rel));
      expect(src, rel).toMatch(/await readWorkTaskAssignmentFacts\(supabase, /);
      expect(src, rel).not.toMatch(/createAdminClient|supabase\/admin/);
      expect(src, rel).not.toMatch(/emitWorkTaskAssignedNotification\((taskId|outcome), /);
    }
  });
});

describe("the register tells the truth about what was delivered", () => {
  it("COM-3 records the 2026-09-23 correction and no longer claims all twenty were emitted", () => {
    const register = lf(read("lib", "product-gate", "capability-register.ts"));
    const com3 = register.slice(register.indexOf('id: "COM-3"'), register.indexOf('id: "COM-4"'));
    expect(com3).toContain("CORRECTED AGAIN 2026-09-23");
    expect(com3).toContain("information_schema.role_table_grants");
    const inventory = lf(readFileSync(join(WEB, "..", "..", "docs", "CAPABILITY_INVENTORY.md"), "utf8"));
    const row = inventory.split("\n").find((l) => l.startsWith("| COM-3 |")) ?? "";
    expect(row).not.toContain("all 20 emitted");
    expect(row).toContain("2026-09-23");
  });

  it("the emitter records the correction the frozen migration comment cannot carry", () => {
    // 20260908070000 says the `workers` grant repaired the booking and
    // absence emitters. It did not — their FIRST read was the domain row.
    // Applied migrations are frozen, so the emitter's header carries it.
    expect(EMITTERS).toContain("SERVICE_ROLE GRANT TRUTH");
    expect(EMITTERS).toMatch(/CORRECTION to migration 20260908070000/);
  });
});
