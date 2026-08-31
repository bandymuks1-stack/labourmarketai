import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length",
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  },
}));

// The canonical write is its own module with its own equivalence proofs
// (journal suites + the live MCP write controls). Here it is a spy: these
// tests prove the CAPABILITY layer's rules — token verification precedes the
// write, the FormData mapping matches the conversation executor's, failures
// map through — not the write itself.
const coreWrite = vi.fn(async () => ({
  ok: true as const,
  entryId: "e-1",
  skills: {
    status: "completed",
    added: 1,
    strengthened: 0,
    reviewNeeded: 0,
    claimsSaved: 0,
    cvUpdated: true,
  },
}));
vi.mock("@/lib/journal/journal-write-core", () => ({
  createJournalEntryCore: (...args: unknown[]) => coreWrite(...(args as [])),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    Object.assign((key: string) => key, { has: () => false }),
}));

// The notification emitters resolve an admin client of their own (recipient
// resolution AFTER the caller's RLS write) — out of scope here; the spy
// proves the core reached the emission step with the real signal id.
const interestEmit = vi.fn(async () => {});
vi.mock("@/lib/notifications/event-emitters", () => ({
  INTEREST_UNDELIVERED: "interest_undelivered",
  emitDemandInterestNotification: (...a: unknown[]) => interestEmit(...(a as [])),
  emitDemandInterestResponseNotification: async () => {},
}));

import {
  exposedCapabilities,
  listCapabilities,
  runCapability,
} from "./registry";
import { getConversationAction } from "@/lib/conversation/action-registry";
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
        in: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        update: () => chain,
        upsert: () => chain,
        maybeSingle: async () => outcome,
        then: (resolve: (v: unknown) => unknown) => resolve(outcome),
      };
      return chain;
    },
    // RPCs are scripted under "rpc:<name>" — the board pipeline reads one.
    async rpc(fn: string) {
      return (
        script[`rpc:${fn}`] ?? { data: null, error: { message: `unscripted rpc ${fn}` } }
      );
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
  it("exposes the reads AND the draft→confirm pair (write extraction landed 2026-08-29)", () => {
    expect(exposedCapabilities().map((c) => c.id)).toEqual([
      "profile.get",
      "living_cv.skills.get",
      "journal.list",
      "journal.create_draft",
      "journal.confirm",
      "interest.express_draft",
      "interest.express_confirm",
      "work_card.save_draft",
      "work_card.save_confirm",
      "context.switch",
    ]);
    expect(listCapabilities().map((c) => c.id)).toEqual([
      "profile.get",
      "living_cv.skills.get",
      "journal.list",
      "journal.create_draft",
      "journal.confirm",
      "interest.express_draft",
      "interest.express_confirm",
      "work_card.save_draft",
      "work_card.save_confirm",
      "context.switch",
    ]);
  });

  it("G4 bridge: a capability that names a conversation action matches its confirmation contract", () => {
    const bridged = listCapabilities().filter((c) => c.conversationActionId);
    // Wagon 1 bridged express-interest; wagon 2 the work card.
    expect(bridged.map((c) => c.id).sort()).toEqual([
      "interest.express_confirm",
      "interest.express_draft",
      "work_card.save_confirm",
      "work_card.save_draft",
    ]);
    for (const c of bridged) {
      const action = getConversationAction(c.conversationActionId!);
      // The named conversation action must exist…
      expect(action, c.id).toBeTruthy();
      // …and its write tier maps to the draft→confirm split — an external
      // client can never run the write with LESS confirmation than the web
      // chat requires (draft→confirm ≥ a reversible form submit, and equals
      // the important_write two-phase flow).
      expect(["important_write", "reversible_write"]).toContain(
        action!.confirmation,
      );
      expect(["draft", "confirm"]).toContain(c.kind);
    }
  });

  it("every capability declares HONEST behavior annotations — no spec-default lies", () => {
    for (const c of listCapabilities()) {
      // All four hints are explicit, reviewed claims (contract requires them).
      expect(Object.keys(c.annotations).sort()).toEqual([
        "destructiveHint",
        "idempotentHint",
        "openWorldHint",
        "readOnlyHint",
      ]);
      // Nothing in the registry reaches outside the product's own domain.
      expect(c.annotations.openWorldHint).toBe(false);
      // Nothing in the registry destroys data (journal writes are append-only).
      expect(c.annotations.destructiveHint).toBe(false);
    }
    const byId = Object.fromEntries(listCapabilities().map((c) => [c.id, c]));
    // Reads AND the write-nothing draft are read-only; the confirm is not.
    expect(byId["profile.get"].annotations.readOnlyHint).toBe(true);
    expect(byId["living_cv.skills.get"].annotations.readOnlyHint).toBe(true);
    expect(byId["journal.list"].annotations.readOnlyHint).toBe(true);
    expect(byId["journal.create_draft"].annotations.readOnlyHint).toBe(true);
    expect(byId["journal.confirm"].annotations.readOnlyHint).toBe(false);
    // The one-time token makes a duplicate confirm a no-op, not a second row.
    expect(byId["journal.confirm"].annotations.idempotentHint).toBe(true);
    // A pointer write: not read-only, never destructive, repeat = no-op.
    expect(byId["context.switch"].annotations.readOnlyHint).toBe(false);
    expect(byId["context.switch"].annotations.idempotentHint).toBe(true);
    // The interest pair mirrors the journal pair's honesty split.
    expect(byId["interest.express_draft"].annotations.readOnlyHint).toBe(true);
    expect(byId["interest.express_confirm"].annotations.readOnlyHint).toBe(false);
    expect(byId["interest.express_confirm"].annotations.idempotentHint).toBe(true);
    // The work-card pair follows the same split (partial save, repeat = same card).
    expect(byId["work_card.save_draft"].annotations.readOnlyHint).toBe(true);
    expect(byId["work_card.save_confirm"].annotations.readOnlyHint).toBe(false);
    expect(byId["work_card.save_confirm"].annotations.idempotentHint).toBe(true);
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

describe("journal.list", () => {
  const ENTRY_ROW = {
    id: "e-1",
    original_text: "Klojau plyteles objekte.",
    created_at: "2026-08-30T08:00:00Z",
    deleted_at: null,
    superseded_by: null,
    engagement_context_id: "00000000-0000-4000-8000-0000000000ec",
    journal_entry_metrics: [
      { metric_slug: "work_date", value_text: "2026-08-30", value_numeric: null, unit_slug: null },
    ],
    journal_entry_confirmations: [{ confirmation_scope: "entry" }],
  };

  it("returns the caller's own live entries through the canonical list core", async () => {
    const r = await runCapability(
      "journal.list",
      caller({
        workers: { data: { id: "worker-1" }, error: null },
        journal_entries: {
          data: [ENTRY_ROW, { ...ENTRY_ROW, id: "e-dead", deleted_at: "2026-08-30T09:00:00Z" }],
          error: null,
        },
      }),
      {},
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      // The soft-deleted row is filtered — live projection only.
      expect(r.data?.entries).toEqual([
        {
          entryId: "e-1",
          text: ENTRY_ROW.original_text,
          createdAt: ENTRY_ROW.created_at,
          engagementContextId: ENTRY_ROW.engagement_context_id,
          metrics: [
            { slug: "work_date", valueText: "2026-08-30", valueNumeric: null, unitSlug: null },
          ],
          confirmations: 1,
        },
      ]);
    }
  });

  it("no worker profile is an honest no_worker_profile, not an empty success", async () => {
    const r = await runCapability(
      "journal.list",
      caller({ workers: { data: null, error: null } }),
      {},
    );
    expect(r).toMatchObject({ ok: false, code: "no_worker_profile" });
  });

  it("a failed journal read is 'unavailable', never an empty list (#1314)", async () => {
    const r = await runCapability(
      "journal.list",
      caller({
        workers: { data: { id: "worker-1" }, error: null },
        journal_entries: { data: null, error: { message: "boom" } },
      }),
      {},
    );
    expect(r).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("rejects an out-of-bounds limit at the schema", async () => {
    const r = await runCapability("journal.list", caller({}), { limit: 500 });
    expect(r).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("interest draft → confirm (G4 tail wagon 1)", () => {
  const REQ = "00000000-0000-4000-8000-0000000000dd";
  const DEMAND_ROW = {
    id: REQ,
    approved_route: true,
    role_text: "Plytelių klojėjas",
    company_name: "Dev Statyba",
    location_label: "Vilnius",
    country: "LT",
  };

  /** The caller's own worker world + the visible board + a signal store.
   *  `signal` scripts the demand_interest_signals outcome: its `status`
   *  feeds the fingerprint read, its `id` the post-upsert select. */
  const interestWorld = (
    signal: { id?: string; status?: string } | null = { id: "sig-1" },
    overrides: TableScript = {},
  ): TableScript => ({
    workers: {
      data: { id: "worker-1", profile_id: "00000000-0000-4000-8000-0000000000aa" },
      error: null,
    },
    worker_skills: { data: [], error: null },
    worker_professions: { data: [], error: null },
    preferred_locations: { data: [], error: null },
    worker_languages: { data: [], error: null },
    demand_interest_signals: { data: signal, error: null },
    "rpc:list_open_demand_for_workers": { data: [DEMAND_ROW], error: null },
    ...overrides,
  });

  it("draft WITHOUT a requestId → the caller's visible demands as labeled options, NO token", async () => {
    const r = await runCapability("interest.express_draft", caller(interestWorld()), {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data?.status).toBe("demand_choice_required");
      expect(r.data?.confirmationToken).toBeUndefined();
      expect(r.data?.options).toEqual([
        { id: REQ, label: "Plytelių klojėjas — Dev Statyba, Vilnius" },
      ]);
    }
  });

  it("a foreign/unknown requestId gets the SAME options answer (no oracle), NO token", async () => {
    const r = await runCapability("interest.express_draft", caller(interestWorld()), {
      requestId: "00000000-0000-4000-8000-0000000000ee",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data?.status).toBe("demand_choice_required");
      expect(r.data?.confirmationToken).toBeUndefined();
      expect(r.data?.preview).toBeUndefined();
    }
  });

  it("an unreadable board is 'unavailable', never an empty choice (#1314)", async () => {
    const r = await runCapability(
      "interest.express_draft",
      caller(
        interestWorld(null, {
          "rpc:list_open_demand_for_workers": { data: null, error: { message: "boom" } },
        }),
      ),
      { requestId: REQ },
    );
    expect(r).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("no visible demands at all → an honest refusal, no options theater", async () => {
    const r = await runCapability(
      "interest.express_draft",
      caller(
        interestWorld(null, {
          "rpc:list_open_demand_for_workers": { data: [], error: null },
        }),
      ),
      {},
    );
    expect(r).toMatchObject({ ok: false, code: "no_visible_demand" });
  });

  it("no worker profile → honest refusal, NEVER a token for an unconfirmable draft", async () => {
    const r = await runCapability(
      "interest.express_draft",
      caller(interestWorld(null, { workers: { data: null, error: null } })),
      { requestId: REQ },
    );
    expect(r).toMatchObject({ ok: false, code: "no_worker_profile" });
  });

  it("a valid draft returns the human preview + a token; alreadyExpressed is honest", async () => {
    const fresh = await runCapability(
      "interest.express_draft",
      caller(interestWorld({ id: "sig-1" })),
      { requestId: REQ, note: "Galiu pradėti kitą savaitę." },
    );
    expect(fresh.ok).toBe(true);
    if (fresh.ok) {
      expect(fresh.data?.preview).toEqual({
        requestId: REQ,
        demandLabel: "Plytelių klojėjas — Dev Statyba, Vilnius",
        note: "Galiu pradėti kitą savaitę.",
        alreadyExpressed: false,
      });
      expect(typeof fresh.data?.confirmationToken).toBe("string");
    }

    const repeat = await runCapability(
      "interest.express_draft",
      caller(interestWorld({ id: "sig-1", status: "interested" })),
      { requestId: REQ },
    );
    expect(repeat.ok).toBe(true);
    if (repeat.ok) {
      const preview = repeat.data?.preview as Record<string, unknown>;
      expect(preview.alreadyExpressed).toBe(true);
    }
  });

  it("draft → confirm runs THE canonical core: real write path, real emitter key", async () => {
    interestEmit.mockClear();
    const world = interestWorld({ id: "sig-1" });
    const drafted = await runCapability("interest.express_draft", caller(world), {
      requestId: REQ,
    });
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";

    const confirmed = await runCapability("interest.express_confirm", caller(world), {
      requestId: REQ,
      confirmationToken: token,
    });
    expect(confirmed).toMatchObject({
      ok: true,
      data: { status: "interested", structuredDestination: "/dashboard/opportunities" },
    });
    // The notification is keyed on the REAL signal row id from the upsert.
    expect(interestEmit).toHaveBeenCalledTimes(1);
    expect(interestEmit).toHaveBeenCalledWith("sig-1");
  });

  it("a TAMPERED note is rejected at the token, before any write", async () => {
    interestEmit.mockClear();
    const world = interestWorld({ id: "sig-1" });
    const drafted = await runCapability("interest.express_draft", caller(world), {
      requestId: REQ,
      note: "Original note",
    });
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";
    const confirmed = await runCapability("interest.express_confirm", caller(world), {
      requestId: REQ,
      note: "Different note",
      confirmationToken: token,
    });
    expect(confirmed).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(interestEmit).not.toHaveBeenCalled();
  });

  it("STALE/replay: after the signal status moves, the old token is dead", async () => {
    interestEmit.mockClear();
    // Token minted while the caller had NO signal (fingerprint interest:none)…
    const drafted = await runCapability(
      "interest.express_draft",
      caller(interestWorld({ id: "sig-1" })),
      { requestId: REQ },
    );
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";
    // …replayed after the express landed (status now `interested`).
    const replayed = await runCapability(
      "interest.express_confirm",
      caller(interestWorld({ id: "sig-1", status: "interested" })),
      { requestId: REQ, confirmationToken: token },
    );
    expect(replayed).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(replayed.ok === false && /stale_state/.test(replayed.message ?? "")).toBe(true);
    expect(interestEmit).not.toHaveBeenCalled();
  });

  it("another user cannot spend the token", async () => {
    const world = interestWorld({ id: "sig-1" });
    const drafted = await runCapability("interest.express_draft", caller(world), {
      requestId: REQ,
    });
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";
    const other: CapabilityCaller = {
      ...caller(world),
      userId: "00000000-0000-4000-8000-0000000000bb",
    };
    const confirmed = await runCapability("interest.express_confirm", other, {
      requestId: REQ,
      confirmationToken: token,
    });
    expect(confirmed).toMatchObject({ ok: false, code: "confirmation_rejected" });
  });

  it("a demand that closed between draft and confirm is refused by the write-time gate", async () => {
    interestEmit.mockClear();
    const world = interestWorld({ id: "sig-1" });
    const drafted = await runCapability("interest.express_draft", caller(world), {
      requestId: REQ,
    });
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";
    // Same signal state (token still fresh) — but the board no longer shows
    // the demand: the core's own visibility re-check refuses.
    const confirmed = await runCapability(
      "interest.express_confirm",
      caller(
        interestWorld({ id: "sig-1" }, {
          "rpc:list_open_demand_for_workers": { data: [], error: null },
        }),
      ),
      { requestId: REQ, confirmationToken: token },
    );
    expect(confirmed).toMatchObject({ ok: false, code: "not_visible" });
    expect(interestEmit).not.toHaveBeenCalled();
  });
});

describe("context.switch", () => {
  /** One owned org + no governance/engagement memberships + a writable
   *  profiles pointer — the minimal membership world. */
  const workspaceWorld = (profilesOutcome?: {
    data: unknown;
    error: { message: string; code?: string } | null;
  }): TableScript => ({
    organizations: {
      data: [
        {
          id: "00000000-0000-4000-8000-00000000or01",
          display_name: "Dev Statyba",
          legal_name: null,
          organization_type: "company",
          legacy_company_id: null,
        },
      ],
      error: null,
    },
    engagement_contexts: { data: [], error: null },
    company_memberships: { data: [], error: null },
    profiles: profilesOutcome ?? { data: null, error: null },
  });

  it("switches by the organization's exact name through the SAME core the web action runs", async () => {
    const r = await runCapability("context.switch", caller(workspaceWorld()), {
      workspace: "Dev Statyba",
    });
    expect(r).toMatchObject({
      ok: true,
      data: {
        status: "switched",
        workspaceId: "00000000-0000-4000-8000-00000000or01",
        durablePointer: true,
      },
    });
  });

  it("'personal' switches to the personal workspace", async () => {
    const r = await runCapability("context.switch", caller(workspaceWorld()), {
      workspace: "personal",
    });
    expect(r).toMatchObject({
      ok: true,
      data: { status: "switched", workspaceId: "personal" },
    });
  });

  it("an unknown or foreign workspace → the labeled options, NOTHING switched", async () => {
    const r = await runCapability("context.switch", caller(workspaceWorld()), {
      workspace: "Some Other Company",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data?.status).toBe("workspace_choice_required");
      expect(r.data?.options).toEqual([
        // The translation mock renders keys — the personal label resolves
        // through the localized catalogue in the app.
        { id: "personal", label: "workspacePersonal" },
        { id: "00000000-0000-4000-8000-00000000or01", label: "Dev Statyba" },
      ]);
    }
  });

  it("a missing durable pointer column is an HONEST needs_migration refusal for bearer callers", async () => {
    const r = await runCapability(
      "context.switch",
      caller(
        workspaceWorld({ data: null, error: { message: "column absent", code: "42703" } }),
      ),
      { workspace: "Dev Statyba" },
    );
    expect(r).toMatchObject({ ok: false, code: "needs_migration" });
  });
});

describe("journal draft → confirm", () => {
  const DRAFT = {
    engagementContextId: "00000000-0000-4000-8000-0000000000ec",
    notes: "Klojau plyteles objekte, 6 valandos.",
    workDate: "2026-08-29",
    siteName: "Vilnius A1",
  };

  /** One active org-linked engagement context the caller can log against —
   *  the row the capability's context resolution reads. */
  const EC_ROW = {
    id: DRAFT.engagementContextId,
    relationship_slug: "employee",
    title: null,
    is_primary: true,
    organization_id: "org-1",
    status: "active",
    started_at: null,
    ended_at: null,
    organizations: { display_name: "Dev Statyba", legal_name: null },
  };

  /** The caller's own worker + journal chain head, as the token fingerprint
   *  reads them. `head` moves after a successful write — the one-time rule. */
  const journalState = (head: string | null): TableScript => ({
    workers: { data: { id: "worker-1" }, error: null },
    journal_entries: { data: head === null ? null : { hash_self: head }, error: null },
    engagement_contexts: { data: [EC_ROW], error: null },
  });

  it("a draft returns the exact preview + a token, and WRITES nothing", async () => {
    const r = await runCapability("journal.create_draft", caller(journalState("h0")), DRAFT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data?.preview).toEqual({
        workDate: "2026-08-29",
        siteName: "Vilnius A1",
        notes: DRAFT.notes,
        engagementContextId: DRAFT.engagementContextId,
        // The named context — the human sees WHERE the entry lands before
        // confirming.
        engagementLabel: "Dev Statyba",
      });
      expect(typeof r.data?.confirmationToken).toBe("string");
    }
  });

  it("engagementContextId may be OMITTED: one applicable org context resolves (rule B) and is NAMED in the preview", async () => {
    const { engagementContextId: _omitted, ...withoutContext } = DRAFT;
    const r = await runCapability(
      "journal.create_draft",
      caller(journalState("h0")),
      withoutContext,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const preview = r.data?.preview as Record<string, unknown>;
      expect(preview.engagementContextId).toBe(DRAFT.engagementContextId);
      expect(preview.engagementLabel).toBe("Dev Statyba");
      expect(typeof r.data?.confirmationToken).toBe("string");
    }
  });

  it("a resolved draft's token confirms — the OMITTED id round-trips through the preview", async () => {
    coreWrite.mockClear();
    const { engagementContextId: _omitted, ...withoutContext } = DRAFT;
    const drafted = await runCapability(
      "journal.create_draft",
      caller(journalState("h0")),
      withoutContext,
    );
    expect(drafted.ok).toBe(true);
    const preview = drafted.ok
      ? (drafted.data?.preview as Record<string, unknown>)
      : {};
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";
    // The confirming client copies the PREVIEW back — including the explicit
    // null siteName it renders — which is exactly what an MCP model does.
    const confirmed = await runCapability("journal.confirm", caller(journalState("h0")), {
      engagementContextId: preview.engagementContextId,
      notes: preview.notes,
      workDate: preview.workDate,
      siteName: preview.siteName,
      confirmationToken: token,
    });
    expect(confirmed).toMatchObject({ ok: true });
    expect(coreWrite).toHaveBeenCalledTimes(1);
  });

  it("several applicable org contexts → the LABELED options, no preselection, NO token (rule C)", async () => {
    const second = {
      ...EC_ROW,
      id: "00000000-0000-4000-8000-0000000000ed",
      is_primary: false,
      organizations: { display_name: "Nonstop Group", legal_name: null },
    };
    const { engagementContextId: _omitted, ...withoutContext } = DRAFT;
    const r = await runCapability(
      "journal.create_draft",
      caller({
        ...journalState("h0"),
        engagement_contexts: { data: [EC_ROW, second], error: null },
      }),
      withoutContext,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data?.status).toBe("engagement_choice_required");
      expect(r.data?.confirmationToken).toBeUndefined();
      expect(r.data?.options).toEqual([
        { id: EC_ROW.id, label: "Dev Statyba" },
        { id: second.id, label: "Nonstop Group" },
      ]);
    }
  });

  it("a requested id that is NOT the caller's own → the labeled options, NEVER a token (fabricated-id E2E 2026-08-30)", async () => {
    // The real ChatGPT write E2E showed the model inventing the nil UUID —
    // a valid uuid shape that belongs to nobody. The old pass-through minted
    // a token for it; now the caller's real options come back instead.
    const r = await runCapability("journal.create_draft", caller(journalState("h0")), {
      ...DRAFT,
      engagementContextId: "00000000-0000-0000-0000-000000000000",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data?.status).toBe("engagement_choice_required");
      expect(r.data?.confirmationToken).toBeUndefined();
      expect(r.data?.preview).toBeUndefined();
      expect(r.data?.options).toEqual([{ id: EC_ROW.id, label: "Dev Statyba" }]);
      expect(String(r.data?.note)).toMatch(/not one of this account's active work contexts/);
    }
  });

  it("a well-formed uuid outside the caller's own list (other user's / stale / inaccessible) → options, NEVER a token", async () => {
    // Under RLS + the query's own filters (profile_id = caller, status =
    // active, professional slugs) every one of those classes arrives here
    // the same way: as an id absent from the caller's visible list.
    const r = await runCapability("journal.create_draft", caller(journalState("h0")), {
      ...DRAFT,
      engagementContextId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data?.status).toBe("engagement_choice_required");
      expect(r.data?.confirmationToken).toBeUndefined();
      expect(r.data?.options).toEqual([{ id: EC_ROW.id, label: "Dev Statyba" }]);
    }
  });

  it("a foreign requested id with NO contexts of one's own → an honest refusal, no token", async () => {
    const r = await runCapability(
      "journal.create_draft",
      caller({
        ...journalState("h0"),
        engagement_contexts: { data: [], error: null },
      }),
      {
        ...DRAFT,
        engagementContextId: "00000000-0000-0000-0000-000000000000",
      },
    );
    expect(r).toMatchObject({ ok: false, code: "no_engagement_context" });
  });

  it("duplicate option labels are qualified by relationship — two contexts at the same org stay tellable apart", async () => {
    // The education case from the web selector (worklog-engagements.ts):
    // employed at the org that also hosts the placement. Both bases render
    // as the org name, so each gets its relationship as a qualifier.
    const placement = {
      ...EC_ROW,
      id: "00000000-0000-4000-8000-0000000000ed",
      relationship_slug: "student",
      is_primary: false,
    };
    const { engagementContextId: _omitted, ...withoutContext } = DRAFT;
    const r = await runCapability(
      "journal.create_draft",
      caller({
        ...journalState("h0"),
        engagement_contexts: { data: [EC_ROW, placement], error: null },
      }),
      withoutContext,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data?.status).toBe("engagement_choice_required");
      // The translation mock has() => false, so the qualifier is the raw
      // slug here; in the app it is the localized relationshipTypes word.
      expect(r.data?.options).toEqual([
        { id: EC_ROW.id, label: "Dev Statyba — employee" },
        { id: placement.id, label: "Dev Statyba — student" },
      ]);
    }
  });

  it("no usable context at all → an honest refusal, never a guess", async () => {
    const { engagementContextId: _omitted, ...withoutContext } = DRAFT;
    const r = await runCapability(
      "journal.create_draft",
      caller({
        ...journalState("h0"),
        engagement_contexts: { data: [], error: null },
      }),
      withoutContext,
    );
    expect(r).toMatchObject({ ok: false, code: "no_engagement_context" });
  });

  it("confirm verifies the token, then performs the canonical write with the executor's exact FormData mapping", async () => {
    coreWrite.mockClear();
    const drafted = await runCapability("journal.create_draft", caller(journalState("h0")), DRAFT);
    expect(drafted.ok).toBe(true);
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";

    const confirmed = await runCapability("journal.confirm", caller(journalState("h0")), {
      ...DRAFT,
      confirmationToken: token,
    });
    expect(confirmed).toMatchObject({
      ok: true,
      data: { entryId: "e-1", skills: { status: "completed", added: 1 } },
    });

    expect(coreWrite).toHaveBeenCalledTimes(1);
    const [deps, formData] = coreWrite.mock.calls[0] as unknown as [
      { userId: string },
      FormData,
    ];
    expect(deps.userId).toBe("00000000-0000-4000-8000-0000000000aa");
    // Byte-for-byte the mapping worker-executors.ts "worker.log-work" uses —
    // one write contract, no ChatGPT-specific fork.
    expect(Object.fromEntries(formData.entries())).toEqual({
      locale: "lt",
      engagement_context_id: DRAFT.engagementContextId,
      notes: DRAFT.notes,
      work_date: DRAFT.workDate,
      site_name: DRAFT.siteName,
    });
  });

  it("a write failure maps through with its real code — never invented success", async () => {
    coreWrite.mockResolvedValueOnce({
      ok: false,
      code: "no_worker_profile",
      message: "no worker",
    } as never);
    const drafted = await runCapability("journal.create_draft", caller(journalState("h0")), DRAFT);
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";
    const confirmed = await runCapability("journal.confirm", caller(journalState("h0")), {
      ...DRAFT,
      confirmationToken: token,
    });
    expect(confirmed).toMatchObject({ ok: false, code: "no_worker_profile" });
  });

  it("negative control: a rejected token NEVER reaches the write", async () => {
    coreWrite.mockClear();
    const confirmed = await runCapability("journal.confirm", caller(journalState("h0")), {
      ...DRAFT,
      confirmationToken: "not-a-real.token",
    });
    expect(confirmed).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(coreWrite).not.toHaveBeenCalled();
  });

  it("a TAMPERED draft is rejected at the token, before the gate", async () => {
    const drafted = await runCapability("journal.create_draft", caller(journalState("h0")), DRAFT);
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";

    const confirmed = await runCapability("journal.confirm", caller(journalState("h0")), {
      ...DRAFT,
      notes: "Different notes than were previewed",
      confirmationToken: token,
    });
    expect(confirmed).toMatchObject({ ok: false, code: "confirmation_rejected" });
  });

  it("another user cannot spend the token", async () => {
    const drafted = await runCapability("journal.create_draft", caller(journalState("h0")), DRAFT);
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";

    const other: CapabilityCaller = {
      ...caller(journalState("h0")),
      userId: "00000000-0000-4000-8000-0000000000bb",
    };
    const confirmed = await runCapability("journal.confirm", other, {
      ...DRAFT,
      confirmationToken: token,
    });
    expect(confirmed).toMatchObject({ ok: false, code: "confirmation_rejected" });
  });

  it("ONE-TIME: after the journal chain head moves, the same token is dead (replay/dup-retry safe)", async () => {
    coreWrite.mockClear();
    const drafted = await runCapability("journal.create_draft", caller(journalState("h0")), DRAFT);
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";

    // The successful confirm appended an entry — the head is now h1. The
    // identical token, replayed, must be rejected WITHOUT reaching the write.
    const replayed = await runCapability("journal.confirm", caller(journalState("h1")), {
      ...DRAFT,
      confirmationToken: token,
    });
    expect(replayed).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(replayed.ok === false && /stale_state/.test(replayed.message ?? "")).toBe(true);
    expect(coreWrite).not.toHaveBeenCalled();
  });
});

describe("work card draft → confirm (G4 tail wagon 2)", () => {
  /** The caller's own workers row, as the core row read returns it. */
  const workerRow = (confirmedAt: string) => ({
    id: "worker-1",
    profile_id: "00000000-0000-4000-8000-0000000000aa",
    availability_status: "busy",
    available_from: null,
    current_location_country: "LT",
    preferred_countries: ["LT"],
    preferred_contract_type: null,
    willing_to_relocate: null,
    has_transport: null,
    driving_licence_categories: null,
    pay_basis_preference: null,
    night_shifts_ok: null,
    weekend_shifts_ok: null,
    overtime_ok: null,
    own_vehicle: null,
    own_tools: null,
    work_card_confirmed_at: confirmedAt,
  });

  const cardWorld = (confirmedAt = "2026-08-01T00:00:00Z", overrides: TableScript = {}): TableScript => ({
    workers: { data: workerRow(confirmedAt), error: null },
    "rpc:save_worker_card": { data: null, error: null },
    ...overrides,
  });

  const DRAFT = { availabilityStatus: "available" as const, locationCountry: "NL" };

  it("an empty draft is an honest nothing_to_save, no token", async () => {
    const r = await runCapability("work_card.save_draft", caller(cardWorld()), {});
    expect(r).toMatchObject({ ok: false, code: "nothing_to_save" });
  });

  it("no worker profile → honest refusal, NEVER a token for an unconfirmable draft", async () => {
    const r = await runCapability(
      "work_card.save_draft",
      caller(cardWorld("t", { workers: { data: null, error: null } })),
      DRAFT,
    );
    expect(r).toMatchObject({ ok: false, code: "no_worker_profile" });
  });

  it("an unreadable workers row is 'unavailable', never 'no worker' (#1314)", async () => {
    const r = await runCapability(
      "work_card.save_draft",
      caller(cardWorld("t", { workers: { data: null, error: { message: "boom" } } })),
      DRAFT,
    );
    expect(r).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("a valid draft previews exactly the provided fields (current → drafted) and WRITES nothing", async () => {
    // No save RPC scripted: if the draft reached the write, it would error.
    const r = await runCapability(
      "work_card.save_draft",
      caller(cardWorld("t", { "rpc:save_worker_card": undefined as never })),
      DRAFT,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const preview = r.data?.preview as { changes: { field: string; from: unknown; to: unknown }[] };
      expect(preview.changes).toEqual([
        { field: "availabilityStatus", from: "busy", to: "available" },
        { field: "locationCountry", from: "LT", to: "NL" },
      ]);
      expect(typeof r.data?.confirmationToken).toBe("string");
    }
  });

  it("draft → confirm performs the canonical save and names the saved fields", async () => {
    const drafted = await runCapability("work_card.save_draft", caller(cardWorld()), DRAFT);
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";
    const confirmed = await runCapability("work_card.save_confirm", caller(cardWorld()), {
      ...DRAFT,
      confirmationToken: token,
    });
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) {
      expect(confirmed.data?.status).toBe("saved");
      expect(confirmed.data?.savedFields).toEqual(["availabilityStatus", "locationCountry"]);
    }
  });

  it("a TAMPERED draft is rejected at the token, before any write", async () => {
    const drafted = await runCapability("work_card.save_draft", caller(cardWorld()), DRAFT);
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";
    const confirmed = await runCapability("work_card.save_confirm", caller(cardWorld()), {
      ...DRAFT,
      locationCountry: "DE",
      confirmationToken: token,
    });
    expect(confirmed).toMatchObject({ ok: false, code: "confirmation_rejected" });
  });

  it("'clear this field' (null) and 'keep this field' (absent) are DIFFERENT drafts", async () => {
    const drafted = await runCapability("work_card.save_draft", caller(cardWorld()), DRAFT);
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";
    // Adding an explicit availableFrom:null (= clear) to the confirmed input
    // is a different write than the draft the human saw — rejected.
    const confirmed = await runCapability("work_card.save_confirm", caller(cardWorld()), {
      ...DRAFT,
      availableFrom: null,
      confirmationToken: token,
    });
    expect(confirmed).toMatchObject({ ok: false, code: "confirmation_rejected" });
  });

  it("ONE-TIME: after the card changes (confirmed_at moves), the token is dead", async () => {
    const drafted = await runCapability("work_card.save_draft", caller(cardWorld("t0")), DRAFT);
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";
    const replayed = await runCapability("work_card.save_confirm", caller(cardWorld("t1")), {
      ...DRAFT,
      confirmationToken: token,
    });
    expect(replayed).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(replayed.ok === false && /stale_state/.test(replayed.message ?? "")).toBe(true);
  });

  it("another user cannot spend the token", async () => {
    const drafted = await runCapability("work_card.save_draft", caller(cardWorld()), DRAFT);
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";
    const other = { ...caller(cardWorld()), userId: "00000000-0000-4000-8000-0000000000bb" };
    const confirmed = await runCapability("work_card.save_confirm", other, {
      ...DRAFT,
      confirmationToken: token,
    });
    expect(confirmed).toMatchObject({ ok: false, code: "confirmation_rejected" });
  });

  it("a missing save RPC maps to an honest needs_migration, never invented success", async () => {
    const drafted = await runCapability("work_card.save_draft", caller(cardWorld()), DRAFT);
    const token = drafted.ok ? (drafted.data?.confirmationToken as string) : "";
    const confirmed = await runCapability(
      "work_card.save_confirm",
      caller(
        cardWorld("2026-08-01T00:00:00Z", {
          "rpc:save_worker_card": {
            data: null,
            error: { message: "function does not exist", code: "42883" } as { message: string },
          },
        }),
      ),
      { ...DRAFT, confirmationToken: token },
    );
    expect(confirmed).toMatchObject({ ok: false, code: "needs_migration" });
  });
});
