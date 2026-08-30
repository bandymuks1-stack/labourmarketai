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
        in: () => chain,
        order: () => chain,
        limit: () => chain,
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
  it("exposes the reads AND the draft→confirm pair (write extraction landed 2026-08-29)", () => {
    expect(exposedCapabilities().map((c) => c.id)).toEqual([
      "profile.get",
      "living_cv.skills.get",
      "journal.list",
      "journal.create_draft",
      "journal.confirm",
    ]);
    expect(listCapabilities().map((c) => c.id)).toEqual([
      "profile.get",
      "living_cv.skills.get",
      "journal.list",
      "journal.create_draft",
      "journal.confirm",
    ]);
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
