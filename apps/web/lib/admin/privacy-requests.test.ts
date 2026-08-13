import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { isPrivacyRequestPayload } from "@/lib/privacy/privacy-request-model";

/**
 * Privacy requests are visible AS privacy requests (V8 W4-C item 2).
 *
 * The audit fact: export/deletion rows surfaced to operators ONLY inside the
 * labour-demand matching workbench, mixed with hiring needs. Pinned here:
 *
 *   1. the shared classifier recognises exactly the payloads the intake RPC
 *      writes (either marker alone still classifies);
 *   2. the matching workbench EXCLUDES privacy rows from its demand list;
 *   3. the admin queue read lists them, maps type/status/date/identity, and
 *      degrades honestly (42P01 → needs-migration, other errors → error);
 *   4. the section is wired on the EXISTING admin control room — no new
 *      route (the Product Gate refuses undeclared screens), no processing
 *      control faked.
 */

const APP = resolve(__dirname, "..", "..");
const read = (rel: string): string =>
  readFileSync(resolve(APP, ...rel.split("/")), "utf8");

describe("1 · the shared payload classifier", () => {
  it("recognises the RPC's payload (both markers, or either alone)", () => {
    expect(
      isPrivacyRequestPayload({
        source: "privacy_self_service",
        privacy_request_type: "account_deletion",
      }),
    ).toBe(true);
    expect(isPrivacyRequestPayload({ source: "privacy_self_service" })).toBe(true);
    expect(isPrivacyRequestPayload({ privacy_request_type: "data_export" })).toBe(true);
  });

  it("never classifies demand payloads or junk", () => {
    expect(isPrivacyRequestPayload({ role_or_work_type: "carpenter" })).toBe(false);
    expect(isPrivacyRequestPayload({ source: "demand_intake" })).toBe(false);
    expect(isPrivacyRequestPayload(null)).toBe(false);
    expect(isPrivacyRequestPayload("privacy_self_service")).toBe(false);
    expect(isPrivacyRequestPayload({ privacy_request_type: 7 })).toBe(false);
  });
});

/** A minimal recording fake for the two reads under test. */
function fakeClient(tables: Record<string, { data?: unknown[]; error?: { code?: string } }>) {
  const chainFor = (table: string) => {
    const result = tables[table] ?? { data: [] };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ["select", "eq", "in", "not", "order", "limit"]) chain[m] = self;
    chain.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(ok, err);
    return chain;
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) },
    from: (table: string) => chainFor(table),
  };
}

const PRIVACY_ROW = {
  id: "req-privacy",
  profile_id: "p-1",
  title: "Privatumo prašymas: paskyros ištrynimas",
  status: "in_review",
  created_at: "2026-08-13T10:00:00.000Z",
  payload: { source: "privacy_self_service", privacy_request_type: "account_deletion" },
  profiles: { email: "worker@example.org" },
};

const DEMAND_ROW = {
  id: "req-demand",
  profile_id: "p-2",
  title: "Reikia dailidžių",
  status: "submitted",
  created_at: "2026-08-12T10:00:00.000Z",
  payload: { role_or_work_type: "carpenter" },
  profiles: null,
};

describe("2 · the matching workbench excludes privacy rows from demand", () => {
  it("a privacy row never appears in the workbench demand list", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () =>
        fakeClient({
          customer_requests: { data: [PRIVACY_ROW, DEMAND_ROW] },
          skills: { data: [] },
        }),
    }));
    vi.resetModules();
    const mod = await import("@/lib/admin/matching-workbench");
    const result = await mod.listWorkbench("en");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const ids = result.demand.map((d) => d.id);
    expect(ids).toContain("req-demand");
    expect(ids).not.toContain("req-privacy");
    vi.doUnmock("@/lib/supabase/server");
    vi.resetModules();
  });
});

describe("3 · the admin queue read", () => {
  const load = async (tables: Parameters<typeof fakeClient>[0]) => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => fakeClient(tables),
    }));
    vi.resetModules();
    const mod = await import("@/lib/admin/privacy-requests");
    const result = await mod.listPrivacyRequestQueue();
    vi.doUnmock("@/lib/supabase/server");
    vi.resetModules();
    return result;
  };

  it("maps type, status, date and identity from the row", async () => {
    const result = await load({ customer_requests: { data: [PRIVACY_ROW] } });
    expect(result).toEqual({
      kind: "ok",
      rows: [
        {
          id: "req-privacy",
          type: "account_deletion",
          status: "in_review",
          createdAtIso: "2026-08-13T10:00:00.000Z",
          profileId: "p-1",
          email: "worker@example.org",
        },
      ],
    });
  });

  it("42P01 degrades to needs-migration; other errors to error — never a fake empty queue", async () => {
    expect(
      await load({ customer_requests: { error: { code: "42P01" } } }),
    ).toEqual({ kind: "needs-migration" });
    expect(
      await load({ customer_requests: { error: { code: "500" } } }),
    ).toEqual({ kind: "error" });
  });
});

/** Recording fake for the review verb: read (maybeSingle) + update chains. */
function reviewFakeClient(options: {
  row?: Record<string, unknown> | null;
  readError?: { code?: string } | null;
  updatedRows?: unknown[];
}) {
  const updates: { payload: Record<string, unknown>; filters: [string, unknown][] }[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = (col: string, value: unknown) => {
        const last = updates[updates.length - 1];
        if (last && !("done" in last)) last.filters.push([col, value]);
        return chain;
      };
      chain.maybeSingle = async () => ({
        data: options.readError ? null : (options.row ?? null),
        error: options.readError ?? null,
      });
      chain.update = (payload: Record<string, unknown>) => {
        updates.push({ payload, filters: [] });
        return chain;
      };
      chain.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
        Promise.resolve({
          data: options.updatedRows ?? [{ id: "req-privacy" }],
          error: null,
        }).then(ok, err);
      void table;
      return chain;
    },
  };
  return { client, updates };
}

async function runReview(
  fake: ReturnType<typeof reviewFakeClient>,
  input: { requestId: string; status: string; note?: string | null },
  superadmin = true,
) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => fake.client,
  }));
  vi.doMock("@/lib/auth/superadmin", () => ({
    isSuperadmin: async () => superadmin,
  }));
  vi.resetModules();
  const mod = await import("@/lib/admin/privacy-requests");
  const result = await mod.reviewPrivacyRequest(input);
  vi.doUnmock("@/lib/supabase/server");
  vi.doUnmock("@/lib/auth/superadmin");
  vi.resetModules();
  return result;
}

describe("5 · review verbs (V9 phase 1) — review only, never deletion", () => {
  it("the allowed transition set is exactly the review subset", async () => {
    const { PRIVACY_REVIEW_STATUSES } = await import("./privacy-requests");
    expect([...PRIVACY_REVIEW_STATUSES]).toEqual([
      "in_review",
      "needs_followup",
      "approved",
      "closed",
    ]);
    // Intake states are not review outcomes.
    for (const bad of ["draft", "submitted", "deleted", ""]) {
      const fake = reviewFakeClient({ row: PRIVACY_ROW });
      expect(await runReview(fake, { requestId: "req-privacy", status: bad })).toEqual({
        kind: "invalid",
      });
      expect(fake.updates).toHaveLength(0);
    }
  });

  it("a non-superadmin caller is refused before any read or write", async () => {
    const fake = reviewFakeClient({ row: PRIVACY_ROW });
    const result = await runReview(
      fake,
      { requestId: "req-privacy", status: "approved" },
      false,
    );
    expect(result).toEqual({ kind: "not-superadmin" });
    expect(fake.updates).toHaveLength(0);
  });

  it("NEGATIVE CONTROL: a demand row can never be reviewed through this verb", async () => {
    const fake = reviewFakeClient({ row: DEMAND_ROW });
    const result = await runReview(fake, {
      requestId: "req-demand",
      status: "closed",
    });
    expect(result).toEqual({ kind: "not-privacy-request" });
    expect(fake.updates).toHaveLength(0);
  });

  it("a successful review writes the status AND appends the payload audit entry", async () => {
    const fake = reviewFakeClient({ row: PRIVACY_ROW });
    const result = await runReview(fake, {
      requestId: "req-privacy",
      status: "approved",
      note: "identity checked",
    });
    expect(result).toEqual({ kind: "ok" });
    expect(fake.updates).toHaveLength(1);
    const update = fake.updates[0];
    expect(update.payload.status).toBe("approved");
    expect(update.payload.manual_review_note).toBe("identity checked");
    const payload = update.payload.payload as Record<string, unknown>;
    // The original markers survive; the audit log is APPENDED, not replaced.
    expect(payload.source).toBe("privacy_self_service");
    const log = payload.privacy_review_log as Record<string, unknown>[];
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      status_set: "approved",
      note: "identity checked",
      decided_by: "admin-1",
      decided_via: "human",
    });
    expect(typeof log[0].decided_at).toBe("string");
    // The UPDATE carries the SQL-side source lock as its second filter.
    expect(update.filters).toContainEqual([
      "payload->>source",
      "privacy_self_service",
    ]);
  });

  it("0 updated rows (RLS/source filter) is a refusal, never a fake ok", async () => {
    const fake = reviewFakeClient({ row: PRIVACY_ROW, updatedRows: [] });
    const result = await runReview(fake, {
      requestId: "req-privacy",
      status: "closed",
    });
    expect(result).toEqual({ kind: "not-found" });
  });

  it("42P01 on the read degrades to needs-migration", async () => {
    const fake = reviewFakeClient({ readError: { code: "42P01" } });
    expect(
      await runReview(fake, { requestId: "req-privacy", status: "closed" }),
    ).toEqual({ kind: "needs-migration" });
  });
});

describe("4 · wiring — an existing surface, visibility only", () => {
  it("the admin page passes ?deletionPlanFor= through — the section renders fine without it", () => {
    const page = read("app/[locale]/dashboard/admin/page.tsx");
    expect(page).toMatch(/deletionPlanFor\?: string/);
    expect(page).toMatch(/deletionPlanFor=\{sp\.deletionPlanFor \?\? null\}/);
    const section = read("components/admin/privacy-requests-section.tsx");
    // The prop is optional with a null default — absent param = collapsed.
    expect(section).toMatch(/deletionPlanFor = null/);
  });

  it("the workbench read routes exclusion through the shared classifier", () => {
    const src = read("lib/admin/matching-workbench.ts");
    expect(src).toContain(
      'from "@/lib/privacy/privacy-request-model"',
    );
    expect(src).toMatch(/!isPrivacyRequestPayload\(/);
  });

  it("the admin control room mounts the section — no new route exists", () => {
    const page = read("app/[locale]/dashboard/admin/page.tsx");
    expect(page).toContain("<PrivacyRequestsSection");
    // No new admin screen was added for this queue (product gate A-09).
    expect(() =>
      readFileSync(
        resolve(APP, "app", "[locale]", "dashboard", "admin", "privacy-requests", "page.tsx"),
      ),
    ).toThrow();
  });

  it("the section's ONLY mutating control is the review verb — deletion never", () => {
    const section = read("components/admin/privacy-requests-section.tsx");
    expect(section).toMatch(/manualNote/);
    // V9 phase 1: exactly ONE form action — the review verb. The honesty
    // line renders beside it, and no destructive path is reachable.
    const actions = [...section.matchAll(/action=\{([^}]+)\}/g)].map((m) =>
      m[1].trim(),
    );
    expect(actions).toEqual(["reviewPrivacyRequestAction"]);
    expect(section).toMatch(/review\.honesty/);
    expect(section).not.toMatch(/\.rpc\(|\.update\(|\.delete\(/);
    // The phase-2 preview renders through the read-only plan lib only.
    expect(section).toMatch(/buildDeletionPlanPreview/);
    expect(section).not.toMatch(/executeDeletion|deleteUser|admin\.delete/);
  });
});
