import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DELETION_PLAN_CLASSES,
} from "./deletion-plan";

/**
 * Deletion plan preview (V9 phase 2) — a READ-ONLY design projection.
 *
 * Pinned here:
 *   1. the builder maps every data class to the design doc's E1–E8 action,
 *      with real HEAD counts for admin-visible tables;
 *   2. the two RLS-self-only classes (consents, notifications) are marked
 *      NOT COUNTABLE (null) and NO query is ever issued for them — a HEAD
 *      count there would return a false zero;
 *   3. zero writes: the module's code contains no update/delete/insert/
 *      upsert/rpc call at all;
 *   4. non-superadmin callers get nothing.
 */

const APP = resolve(__dirname, "..", "..");

/** Recording fake: per-table row fixtures answered as HEAD counts. */
function planFakeClient(counts: Record<string, number | { error: true }>) {
  const queried: string[] = [];
  const client = {
    from: (table: string) => {
      queried.push(table);
      const result = counts[table];
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ["select", "eq", "in", "or", "limit"]) chain[m] = self;
      chain.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
        Promise.resolve(
          typeof result === "object"
            ? { data: null, count: null, error: { code: "500" } }
            : table === "workers"
              ? {
                  // the worker-id list read (not a HEAD count)
                  data: Array.from({ length: result ?? 0 }, (_, i) => ({
                    id: `w-${i + 1}`,
                  })),
                  count: null,
                  error: null,
                }
              : { data: null, count: result ?? 0, error: null },
        ).then(ok, err);
      return chain;
    },
  };
  return { client, queried };
}

async function runPlan(
  fake: ReturnType<typeof planFakeClient>,
  profileId: string,
  superadmin = true,
) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => fake.client,
  }));
  vi.doMock("@/lib/auth/superadmin", () => ({
    isSuperadmin: async () => superadmin,
  }));
  vi.resetModules();
  const mod = await import("@/lib/privacy/deletion-plan");
  const result = await mod.buildDeletionPlanPreview(profileId);
  vi.doUnmock("@/lib/supabase/server");
  vi.doUnmock("@/lib/auth/superadmin");
  vi.resetModules();
  return result;
}

describe("1 · the builder maps classes to the design doc's actions", () => {
  it("counts admin-visible classes and projects E1–E8", async () => {
    const fake = planFakeClient({
      workers: 1,
      profiles: 1,
      journal_entries: 12,
      journal_entry_photos: 3,
      worker_skills: 7,
      profile_skill_claims: 2,
      worker_documents: 4,
      booking_requests: 5,
      engagement_contexts: 2,
      conversation_messages: 9,
      customer_requests: 1,
    });
    const result = await runPlan(fake, "profile-1");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    const byClass = Object.fromEntries(result.rows.map((r) => [r.dataClass, r]));
    // Every declared class appears exactly once.
    expect(result.rows.map((r) => r.dataClass).sort()).toEqual(
      [...DELETION_PLAN_CLASSES].sort(),
    );
    expect(byClass.journal).toMatchObject({
      rowCount: 12,
      plannedAction: "anonymize_detach",
      basis: "E1",
    });
    expect(byClass.bookings).toMatchObject({
      rowCount: 5,
      plannedAction: "keep_pending_decision",
      basis: "E3",
    });
    expect(byClass.engagements).toMatchObject({
      plannedAction: "keep_pending_decision",
      basis: "E3",
    });
    expect(byClass.inquiries).toMatchObject({
      rowCount: 1,
      plannedAction: "anonymize_detach",
      basis: "E4",
    });
    expect(byClass.journalPhotos).toMatchObject({ rowCount: 3, plannedAction: "delete", basis: "E5" });
    expect(byClass.documents).toMatchObject({ rowCount: 4, plannedAction: "delete", basis: "E5" });
    expect(byClass.messages).toMatchObject({ rowCount: 9, plannedAction: "anonymize_detach", basis: "E6" });
    expect(byClass.skills).toMatchObject({ rowCount: 7, plannedAction: "delete", basis: "E7" });
    expect(byClass.skillClaims).toMatchObject({ rowCount: 2, plannedAction: "delete", basis: "E7" });
    // Account = profiles row + worker rows, the one cascade root.
    expect(byClass.account).toMatchObject({ rowCount: 2, plannedAction: "delete", basis: "E7" });
  });

  it("a failed read degrades that class to null — never a fabricated zero", async () => {
    const fake = planFakeClient({
      workers: 1,
      profiles: 1,
      journal_entries: { error: true },
    });
    const result = await runPlan(fake, "profile-1");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const journal = result.rows.find((r) => r.dataClass === "journal");
    expect(journal?.rowCount).toBeNull();
  });
});

describe("2 · RLS-self-only classes are never queried and never fake a zero", () => {
  it("consents + notifications stay null; their tables are not touched", async () => {
    const fake = planFakeClient({ workers: 0, profiles: 1 });
    const result = await runPlan(fake, "profile-1");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const consents = result.rows.find((r) => r.dataClass === "consents");
    const notifications = result.rows.find((r) => r.dataClass === "notifications");
    expect(consents).toMatchObject({ rowCount: null, plannedAction: "anonymize_detach", basis: "E2" });
    expect(notifications).toMatchObject({ rowCount: null, plannedAction: "delete", basis: "E8" });
    expect(fake.queried).not.toContain("privacy_consent_events");
    expect(fake.queried).not.toContain("notification_events");
  });
});

describe("3 · zero writes — the module cannot mutate anything", () => {
  const strip = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const src = strip(
    readFileSync(resolve(APP, "lib", "privacy", "deletion-plan.ts"), "utf8"),
  );

  it("no update/delete/insert/upsert/rpc call exists in the source", () => {
    expect(src).not.toMatch(/\.update\(|\.delete\(|\.insert\(|\.upsert\(|\.rpc\(/);
  });

  it("no privileged client — ordinary authenticated reads only", () => {
    expect(src).not.toMatch(/service_role|createAdminClient|supabase\/admin/);
  });
});

describe("4 · access", () => {
  it("a non-superadmin caller gets nothing", async () => {
    const fake = planFakeClient({ workers: 1, profiles: 1 });
    const result = await runPlan(fake, "profile-1", false);
    expect(result).toEqual({ kind: "not-superadmin" });
    expect(fake.queried).toHaveLength(0);
  });

  it("an empty profile id is invalid", async () => {
    const fake = planFakeClient({});
    expect(await runPlan(fake, "  ")).toEqual({ kind: "invalid" });
  });
});
