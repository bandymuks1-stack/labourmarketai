import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length",
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  },
}));

import {
  exposedCapabilities,
  listCapabilities,
  runCapability,
} from "./registry";
import type { CapabilityCaller } from "./contract";

/**
 * Handlers run against a scripted supabase stub — the capability layer's own
 * rules (validation, honest three-valued reads, the draft→confirm token
 * chain, the not-yet-executable gate) are what is under test here. The RLS
 * authority behind the client is proven by the auth-core e2e controls, not
 * re-proven per capability.
 */

type TableScript = Record<
  string,
  { data: unknown; error: { message: string } | null }
>;

function stubSupabase(script: TableScript) {
  return {
    from(table: string) {
      const outcome = script[table] ?? { data: null, error: { message: `unscripted table ${table}` } };
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => outcome,
        then: (resolve: (v: unknown) => unknown) => resolve(outcome),
      };
      return chain;
    },
  } as unknown as CapabilityCaller["supabase"];
}

function caller(script: TableScript, transport: "cookie" | "bearer" = "bearer"): CapabilityCaller {
  return {
    userId: "00000000-0000-4000-8000-0000000000aa",
    transport,
    supabase: stubSupabase(script),
    locale: "lt",
  };
}

const PROFILE_ROW = {
  id: "00000000-0000-4000-8000-0000000000aa",
  full_name: "Test Worker",
  email: "w@example.test",
  locale: "lt",
  country: "LT",
  onboarded: true,
  active_role: "worker",
};

describe("the registry itself", () => {
  it("exposes ONLY the read capabilities — the write pair exists but is gated", () => {
    expect(exposedCapabilities().map((c) => c.id)).toEqual([
      "profile.get",
      "living_cv.skills.get",
    ]);
    expect(listCapabilities().map((c) => c.id)).toEqual([
      "profile.get",
      "living_cv.skills.get",
      "journal.create_draft",
      "journal.confirm",
    ]);
  });

  it("an unknown capability id is refused, never a throw", async () => {
    const r = await runCapability("db.drop_everything", caller({}), {});
    expect(r).toMatchObject({ ok: false, code: "unknown_capability" });
  });

  it("input that fails the schema never reaches a handler", async () => {
    const r = await runCapability("profile.get", caller({}), { surprise: 1 });
    expect(r).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("profile.get", () => {
  it("returns recorded facts and the worker's three-valued existence", async () => {
    const r = await runCapability(
      "profile.get",
      caller({
        profiles: { data: PROFILE_ROW, error: null },
        workers: { data: { id: "worker-1" }, error: null },
      }),
      {},
    );
    expect(r).toEqual({
      ok: true,
      data: {
        profile: {
          id: PROFILE_ROW.id,
          fullName: "Test Worker",
          email: "w@example.test",
          locale: "lt",
          country: "LT",
          onboarded: true,
          activeRole: "worker",
        },
        worker: { status: "exists", workerId: "worker-1" },
      },
    });
  });

  it("a failed profile read is 'unavailable', never 'no profile' (#1314)", async () => {
    const r = await runCapability(
      "profile.get",
      caller({ profiles: { data: null, error: { message: "boom" } } }),
      {},
    );
    expect(r).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("a failed WORKER read reports unavailable, not 'no worker'", async () => {
    const r = await runCapability(
      "profile.get",
      caller({
        profiles: { data: PROFILE_ROW, error: null },
        workers: { data: null, error: { message: "boom" } },
      }),
      {},
    );
    expect(r).toMatchObject({
      ok: true,
      data: { worker: { status: "unavailable" } },
    });
  });
});

describe("living_cv.skills.get", () => {
  it("returns the caller's worker_skills rows joined to catalogue slugs", async () => {
    const r = await runCapability(
      "living_cv.skills.get",
      caller({
        workers: { data: { id: "worker-1" }, error: null },
        worker_skills: {
          data: [
            {
              skill_id: "s-1",
              verified: true,
              source: "work_journal",
              verified_at: "2026-08-01T00:00:00Z",
              skills: { slug: "tiling" },
            },
          ],
          error: null,
        },
      }),
      {},
    );
    expect(r).toEqual({
      ok: true,
      data: {
        workerId: "worker-1",
        skills: [
          {
            skillId: "s-1",
            slug: "tiling",
            verified: true,
            source: "work_journal",
            verifiedAt: "2026-08-01T00:00:00Z",
          },
        ],
      },
    });
  });

  it("no worker row is an honest no_worker, not an empty success", async () => {
    const r = await runCapability(
      "living_cv.skills.get",
      caller({ workers: { data: null, error: null } }),
      {},
    );
    expect(r).toMatchObject({ ok: false, code: "no_worker" });
  });
});

describe("journal draft → confirm", () => {
  const DRAFT = {
    engagementContextId: "00000000-0000-4000-8000-0000000000ec",
    notes: "Klojau plyteles objekte, 6 valandos.",
    workDate: "2026-08-29",
    siteName: "Vilnius A1",
  };

  it("a draft returns the exact preview + a token, and touches NO table", async () => {
    const r = await runCapability("journal.create_draft", caller({}), DRAFT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data?.preview).toEqual({
        workDate: "2026-08-29",
        siteName: "Vilnius A1",
        notes: DRAFT.notes,
        engagementContextId: DRAFT.engagementContextId,
      });
      expect(typeof r.data?.confirmationToken).toBe("string");
    }
  });

  it("confirm verifies the token for the EXACT draft, then refuses honestly (write not yet executable)", async () => {
    const drafted = await runCapability("journal.create_draft", caller({}), DRAFT);
    expect(drafted.ok).toBe(true);
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";

    const confirmed = await runCapability("journal.confirm", caller({}), {
      ...DRAFT,
      confirmationToken: token,
    });
    expect(confirmed).toMatchObject({ ok: false, code: "not_executable" });
  });

  it("a TAMPERED draft is rejected at the token, before the gate", async () => {
    const drafted = await runCapability("journal.create_draft", caller({}), DRAFT);
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";

    const confirmed = await runCapability("journal.confirm", caller({}), {
      ...DRAFT,
      notes: "Different notes than were previewed",
      confirmationToken: token,
    });
    expect(confirmed).toMatchObject({ ok: false, code: "confirmation_rejected" });
  });

  it("another user cannot spend the token", async () => {
    const drafted = await runCapability("journal.create_draft", caller({}), DRAFT);
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";

    const other: CapabilityCaller = {
      ...caller({}),
      userId: "00000000-0000-4000-8000-0000000000bb",
    };
    const confirmed = await runCapability("journal.confirm", other, {
      ...DRAFT,
      confirmationToken: token,
    });
    expect(confirmed).toMatchObject({ ok: false, code: "confirmation_rejected" });
  });
});
