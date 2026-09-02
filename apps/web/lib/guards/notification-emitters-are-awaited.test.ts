import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * NOTIFICATION EMITTERS MUST SURVIVE THE SERVERLESS RETURN (TRAIN 10).
 *
 * On Vercel serverless the invocation can be FROZEN the instant an action
 * returns. A `void emit...(...)`-detached notification insert is then killed
 * mid-flight — which is exactly what made the live `demand_interest_expressed`
 * emitter deliver NOTHING in production (only backfill rows existed) while
 * every test stayed green. The fix has two layers, and this guard pins both:
 *
 *   1. CALL SITES: every write-path action awaits its emitter. The emitters
 *      never throw, so the await can never fail the domain write it follows.
 *   2. EMITTER INTERNALS: the write-path emitters in
 *      lib/notifications/event-emitters.ts await their insert through
 *      `emitNotificationEvent` — awaiting an emitter whose final insert still
 *      detaches through `emitNotificationEventInBackground` would be
 *      cosmetic.
 *
 * APPROVED READ-TIME EXCEPTIONS (deliberately detached, comment-documented at
 * each site): the two document_expiring emitters and the weekly_digest
 * emitter. They fire on READ/render paths where an await taxes every page
 * load, and unlike a write-path event they SELF-HEAL: the fact is re-derived
 * on every visit and the store's UNIQUE (recipient, dedupe_key) keeps it
 * exactly-once, so a killed insert is retried next visit rather than lost.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

/** Every file that calls a notification emitter after a domain WRITE. */
const WRITE_PATH_EMITTER_FILES = [
  "lib/booking/booking-actions.ts",
  "lib/leave/absences-actions.ts",
  "lib/engagements/end-engagement.ts",
  "lib/tasks/task-actions.ts",
  "lib/tasks/task-approval-actions.ts",
  "lib/documents/org-document-actions.ts",
  "lib/documents/document-file-actions.ts",
  "lib/approvals/approvals-actions.ts",
  "lib/agreements/agreements-actions.ts",
  "lib/trips/trips-actions.ts",
  "lib/timesheets/timesheets-actions.ts",
  "lib/procurement/procurement-actions.ts",
  "lib/finance/finance-actions.ts",
  "lib/requests/requests-actions.ts",
  "lib/opportunities/interest.ts",
] as const;

/** The one place a detached `void emit...` is the point: the background
 *  wrapper itself (used only by the approved read-time emitters). */
const DETACH_ALLOWLIST = new Set(["lib/notifications/events.ts"]);

const VOID_EMIT = /\bvoid emit[A-Z]/;

describe("write-path notification emitters are awaited at every call site", () => {
  it.each(WRITE_PATH_EMITTER_FILES)("%s has no detached emit", (file) => {
    const src = read(...file.split("/"));
    expect(src, `${file} detaches an emitter with 'void emit...'`).not.toMatch(
      VOID_EMIT,
    );
    // The list stays honest: a file on it really does await an emitter. If an
    // emitter call was removed entirely, remove the file here too.
    expect(src, `${file} no longer awaits any emitter`).toMatch(/await emit/);
  });

  it("no file anywhere in lib/ or components/ reintroduces `void emit...`", () => {
    const offenders: string[] = [];
    const walk = (rel: string): void => {
      for (const name of readdirSync(join(WEB, rel))) {
        const relPath = `${rel}/${name}`;
        const full = join(WEB, relPath);
        if (statSync(full).isDirectory()) {
          walk(relPath);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
        if (DETACH_ALLOWLIST.has(relPath)) continue;
        if (VOID_EMIT.test(readFileSync(full, "utf8"))) offenders.push(relPath);
      }
    };
    walk("lib");
    walk("components");
    // A new hit is either a killable notification (award it an await) or a
    // genuinely detachable non-notification emitter (extend the allowlist
    // WITH a comment saying why the serverless freeze cannot lose it).
    expect(offenders).toEqual([]);
  });
});

describe("the emitters themselves await the insert (event-emitters.ts)", () => {
  const emitters = read("lib", "notifications", "event-emitters.ts");

  it("write-path emitters ride the awaited insert, not the background wrapper", () => {
    // Exactly the three approved READ-TIME emitters may still detach their
    // insert: emitWorkerDocumentExpiringNotifications,
    // emitOrgDocumentExpiringNotifications, maybeEmitWeeklyDigestInBackground.
    const calls = emitters.match(/emitNotificationEventInBackground\(/g) ?? [];
    expect(calls).toHaveLength(3);
    // ...and all three live in the read-time section at the bottom — no
    // write-path emitter above it detaches.
    const readTimeStart = emitters.indexOf(
      "export function emitWorkerDocumentExpiringNotifications",
    );
    expect(readTimeStart).toBeGreaterThan(0);
    expect(
      emitters.indexOf("emitNotificationEventInBackground("),
    ).toBeGreaterThan(readTimeStart);
  });

  it("the awaited path exists and reports the only unapproved outcome", () => {
    expect(emitters).toMatch(/await emitNotificationEvent\(/);
    expect(emitters).toMatch(/NOTIFICATION_UNDELIVERED/);
    // A silent-skip branch is a delivery failure someone can grep for — the
    // exact lesson of INTEREST_UNDELIVERED.
    expect(emitters).toMatch(/notDelivered\("engagement_created"/);
  });
});

describe("the read-time exceptions are documented where they detach", () => {
  it.each([
    ["lib/documents/document-files.ts", 2],
    ["components/app/spine-stream.tsx", 1],
  ] as const)("%s records the decision", (file, count) => {
    const src = read(...file.split("/"));
    const hits = src.match(/DELIBERATELY DETACHED/g) ?? [];
    expect(hits.length, `${file} lost its detachment rationale`).toBe(count);
  });

  it("the emitters carry the READ-TIME DETACHED contract", () => {
    const emitters = read("lib", "notifications", "event-emitters.ts");
    expect(
      (emitters.match(/READ-TIME DETACHED/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
  });
});
