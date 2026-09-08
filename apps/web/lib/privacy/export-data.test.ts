import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The personal-data export must never present a FAILED read as an EMPTY one.
 *
 * THE DEFECT THESE TESTS LOCK. Every read in `buildPrivacyExport` discarded
 * its error and fell back to `[]` or `null`. That is wrong anywhere and worst
 * here: the bundle is a subject-access response and it carries an `excluded`
 * list naming what was deliberately left out, so a reader is entitled to
 * conclude that everything NOT on that list IS included. A failed read did not
 * merely lose data — it made the bundle assert something false about itself.
 *
 * The sharpest case: the journal / skills / documents branch is gated on
 * `workerIds`. A failed `workers` read produced an empty id list, skipped the
 * branch entirely, and handed the person an export claiming they had no work
 * history at all.
 */

type Result = { data: unknown; error: unknown };

const tables = new Map<string, Result>();

function ok(data: unknown): Result {
  return { data, error: null };
}
function fails(): Result {
  return { data: null, error: { code: "57014", message: "timeout" } };
}

/** Minimal PostgREST-shaped builder: every terminal is the same recorded row. */
function builderFor(table: string) {
  const result = tables.get(table) ?? ok([]);
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (r: Result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
    from: (table: string) => builderFor(table),
  })),
}));

import { buildPrivacyExport } from "@/lib/privacy/export-data";

beforeEach(() => {
  tables.clear();
  tables.set("profiles", ok({ id: "user-1" }));
  tables.set("consents", ok([{ id: "c1" }]));
  tables.set("workers", ok([{ id: "w1" }]));
  tables.set("journal_entries", ok([{ id: "j1" }]));
  tables.set("worker_skills", ok([{ id: "s1" }]));
  tables.set("worker_documents", ok([{ id: "d1" }]));
});

async function bundle() {
  const res = await buildPrivacyExport();
  if (res.kind !== "ok") throw new Error("expected ok, got " + res.kind);
  return res.bundle;
}

describe("a complete export says so", () => {
  it("reports nothing unavailable when every read succeeds", async () => {
    const b = await bundle();
    expect(b.unavailable).toEqual([]);
    expect(b.data.journal_entries).toHaveLength(1);
    expect(b.data.worker_skills).toHaveLength(1);
    expect(b.data.worker_documents).toHaveLength(1);
  });

  it("a person who genuinely has no worker row is still a COMPLETE export", async () => {
    // Empty because there is nothing, not because a read failed. The
    // distinction is the whole point, so it must hold in both directions.
    tables.set("workers", ok([]));
    const b = await bundle();
    expect(b.unavailable).toEqual([]);
    expect(b.data.journal_entries).toEqual([]);
  });
});

describe("a failed read is named, never rendered as absence", () => {
  it("a failed workers read does NOT claim the person has no work history", async () => {
    tables.set("workers", fails());
    const b = await bundle();
    // The branch is skipped, so all three are unread — and all three say so.
    expect(b.unavailable).toContain("workers");
    expect(b.unavailable).toContain("journal_entries");
    expect(b.unavailable).toContain("worker_skills");
    expect(b.unavailable).toContain("worker_documents");
  });

  it("names exactly the failing part and keeps everything else", async () => {
    tables.set("journal_entries", fails());
    const b = await bundle();
    expect(b.unavailable).toEqual(["journal_entries"]);
    expect(b.data.journal_entries).toEqual([]);
    // The reads that worked are still delivered in full — a transient failure
    // must not deny someone the data that could be reached.
    expect(b.data.worker_skills).toHaveLength(1);
    expect(b.data.worker_documents).toHaveLength(1);
    expect(b.data.consents).toHaveLength(1);
  });

  it("a failed profile read yields null AND an entry, not a bare null", async () => {
    tables.set("profiles", fails());
    const b = await bundle();
    expect(b.data.profile).toBeNull();
    expect(b.unavailable).toContain("profile");
  });

  it("a failed consents read is not an empty consent audit trail", async () => {
    tables.set("consents", fails());
    const b = await bundle();
    expect(b.data.consents).toEqual([]);
    expect(b.unavailable).toContain("consents");
  });

  it("every unavailable key names a real key of the bundle's data", async () => {
    // Otherwise the person is told something is missing and cannot tell what.
    tables.set("workers", fails());
    tables.set("profiles", fails());
    const b = await bundle();
    for (const key of b.unavailable) {
      expect(Object.keys(b.data)).toContain(key);
    }
  });
});
