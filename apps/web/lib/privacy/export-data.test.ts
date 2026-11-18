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
const rpcCalls: string[] = [];
const rpcResults = new Map<string, Result>();
/** Every `.in(column, ids)` the exporter issued, in order. */
const calls: { table: string; column: string; ids: string[] }[] = [];
/** Rows a table returns per call number, to exercise paging (default: none). */
const pages = new Map<string, Result[]>();
const pageCursor = new Map<string, number>();
const signed = { error: null as unknown, data: [] as unknown[], called: [] as string[][] };

function ok(data: unknown): Result {
  return { data, error: null };
}
function fails(): Result {
  return { data: null, error: { code: "57014", message: "timeout" } };
}

/** Minimal PostgREST-shaped builder: every terminal is the same recorded row. */
function builderFor(table: string) {
  let result = tables.get(table) ?? ok([]);
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    in: (column: string, ids: string[]) => {
      calls.push({ table, column, ids });
      return chain;
    },
    range: () => {
      const queue = pages.get(table);
      if (queue) {
        const n = pageCursor.get(table) ?? 0;
        pageCursor.set(table, n + 1);
        result = queue[n] ?? ok([]);
      }
      return chain;
    },
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
    rpc: async (fn: string) => {
      rpcCalls.push(fn);
      return rpcResults.get(fn) ?? ok([]);
    },
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          signed.called.push(paths);
          return { data: signed.data, error: signed.error };
        },
      }),
    },
  })),
}));

import { buildPrivacyExport, redactRows } from "@/lib/privacy/export-data";
import { EXPORTED_RELATIONS } from "@/lib/privacy/personal-relations";

beforeEach(() => {
  tables.clear();
  rpcCalls.length = 0;
  rpcResults.clear();
  calls.length = 0;
  pages.clear();
  pageCursor.clear();
  signed.error = null;
  signed.data = [];
  signed.called = [];
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
    // The parent is named, and so are the PER-12 children chained off it:
    // their emptiness would otherwise read as "no metrics" when the truth is
    // "we could not see which entries to look under".
    expect(b.unavailable).toEqual([
      "journal_entries",
      "journal_entry_metrics",
      "journal_entry_extractions",
      "journal_entry_tasks",
    ]);
    expect(b.data.journal_entries).toEqual([]);
    // The reads that worked are still delivered in full — a transient failure
    // must not deny someone the data that could be reached.
    expect(b.data.worker_skills).toHaveLength(1);
    expect(b.data.worker_documents).toHaveLength(1);
    expect(b.data.consents).toHaveLength(1);
  });

  it("a failed profile read yields null AND an entry, not a bare null", async () => {
    // The bundle key is the TABLE name now (format version 2): every other
    // key in `data` is a table, and `profile` was the one exception.
    tables.set("profiles", fails());
    const b = await bundle();
    expect(b.data.profiles).toBeNull();
    expect(b.unavailable).toContain("profiles");
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

describe("PER-12 chained child relations", () => {
  it("reads children from the ids of the already-exported parents", async () => {
    tables.set("journal_entries", ok([{ id: "j1" }, { id: "j2" }]));
    tables.set("journal_entry_metrics", ok([{ id: "m1", entry_id: "j1" }]));
    tables.set("booking_requests", ok([{ id: "b1" }]));
    tables.set("booking_request_events", ok([{ id: "e1", booking_request_id: "b1" }]));
    const b = await bundle();
    expect(b.data.journal_entry_metrics).toHaveLength(1);
    expect(b.data.booking_request_events).toHaveLength(1);
    const metricsCall = calls.find((c) => c.table === "journal_entry_metrics");
    expect(metricsCall).toEqual({
      table: "journal_entry_metrics",
      column: "entry_id",
      ids: ["j1", "j2"],
    });
    const bookingCall = calls.find((c) => c.table === "booking_request_events");
    expect(bookingCall?.column).toBe("booking_request_id");
    expect(bookingCall?.ids).toEqual(["b1"]);
  });

  it("a child of an empty parent is empty and is never queried", async () => {
    tables.set("timesheets", ok([]));
    const b = await bundle();
    expect(b.data.timesheet_events).toEqual([]);
    expect(calls.some((c) => c.table === "timesheet_events")).toBe(false);
    expect(b.unavailable).toEqual([]);
  });

  it("every chained relation of the register appears as a bundle key", async () => {
    const b = await bundle();
    for (const r of EXPORTED_RELATIONS.filter((x) => x.key === "parent_row")) {
      expect(Object.keys(b.data)).toContain(r.as ?? r.table);
    }
  });

  it("chunks long id lists so the request URL stays bounded", async () => {
    const entries = Array.from({ length: 250 }, (_, i) => ({ id: `j${i}` }));
    tables.set("journal_entries", ok(entries));
    tables.set("journal_entry_metrics", ok([]));
    await bundle();
    const metricCalls = calls.filter((c) => c.table === "journal_entry_metrics");
    expect(metricCalls.map((c) => c.ids.length)).toEqual([100, 100, 50]);
  });

  it("pages past the 1000-row cap instead of silently truncating", async () => {
    tables.set("journal_entries", ok([{ id: "j1" }]));
    const full = Array.from({ length: 1000 }, (_, i) => ({ id: `m${i}` }));
    pages.set("journal_entry_metrics", [ok(full), ok([{ id: "m1000" }])]);
    const b = await bundle();
    expect(b.data.journal_entry_metrics).toHaveLength(1001);
  });

  it("a failed parent names its children unavailable, not empty", async () => {
    tables.set("journal_entries", fails());
    const b = await bundle();
    expect(b.unavailable).toContain("journal_entries");
    expect(b.unavailable).toContain("journal_entry_metrics");
    expect(b.unavailable).toContain("journal_entry_tasks");
  });

  it("a failed child read is named unavailable and keeps the rest", async () => {
    tables.set("journal_entries", ok([{ id: "j1" }]));
    tables.set("journal_entry_metrics", fails());
    tables.set("worker_documents", ok([{ id: "d1" }]));
    tables.set("worker_document_events", ok([{ id: "x1", worker_document_id: "d1" }]));
    const b = await bundle();
    expect(b.unavailable).toEqual(["journal_entry_metrics"]);
    expect(b.data.journal_entry_metrics).toEqual([]);
    expect(b.data.worker_document_events).toHaveLength(1);
  });

  it.each(["42P01", "42703", "PGRST205"])(
    "a child table the database lacks (%s) is empty, not unavailable",
    async (code) => {
      tables.set("journal_entries", ok([{ id: "j1" }]));
      tables.set("journal_entry_metrics", {
        data: null,
        error: { code, message: "absent" },
      });
      const b = await bundle();
      expect(b.data.journal_entry_metrics).toEqual([]);
      expect(b.unavailable).toEqual([]);
    },
  );

  it("a chain off the organization evidence record reads competency signals", async () => {
    tables.set("organization_people", ok([{ id: "op1" }]));
    tables.set("organization_evidence_records", ok([{ id: "rec1" }]));
    tables.set(
      "organization_evidence_competency_signals",
      ok([{ id: "sig1", record_id: "rec1", term: "tiling" }]),
    );
    tables.set("evidence_import_rows", ok([]));
    const b = await bundle();
    expect(b.data.organization_evidence_competency_signals).toHaveLength(1);
    // evidence_import_rows is read ONLY through the subject-safe RPC, never
    // by a table select (its table policy is not widened).
    expect(calls.find((c) => c.table === "evidence_import_rows")).toBeUndefined();
    expect(rpcCalls).toContain("privacy_export_evidence_import_rows_v1");
  });

  it("an unapplied evidence-import RPC is reported unavailable, not empty", async () => {
    tables.set("organization_people", ok([{ id: "op1" }]));
    rpcResults.set("privacy_export_evidence_import_rows_v1", {
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    });
    const b = await bundle();
    expect(b.data.evidence_import_rows).toEqual([]);
    expect(b.unavailable).toContain("evidence_import_rows");
  });
});

describe("PER-12 redaction", () => {
  const rel = { redactActors: ["actor_id"], omitColumns: ["after_state"] } as const;

  it("blanks another person's id and keeps the subject's own", () => {
    const rows = redactRows(
      [
        { id: "1", actor_id: "manager-9", after_state: { assignee: "x" }, to_status: "accepted" },
        { id: "2", actor_id: "user-1", after_state: null, to_status: "proposed" },
      ],
      rel,
      "user-1",
    );
    expect(rows[0]).toEqual({ id: "1", actor_id: null, after_state: null, to_status: "accepted" });
    expect(rows[1].actor_id).toBe("user-1");
  });

  it("does not invent a column a row does not have", () => {
    const rows = redactRows([{ id: "1" }], rel, "user-1");
    expect(rows[0]).toEqual({ id: "1" });
  });

  it("leaves a relation without redaction untouched (same rows)", () => {
    const input = [{ id: "1", actor_id: "other" }];
    expect(redactRows(input, {}, "user-1")).toBe(input);
  });

  it("the exported bundle blanks a manager on a booking event and worker absence", async () => {
    tables.set("booking_requests", ok([{ id: "b1" }]));
    tables.set(
      "booking_request_events",
      ok([{ id: "e1", booking_request_id: "b1", actor_id: "manager-9", event_type: "proposed" }]),
    );
    tables.set(
      "worker_absences",
      ok([{ id: "a1", requested_by: "manager-9", reviewed_by: "user-1", status: "approved" }]),
    );
    const b = await bundle();
    const ev = (b.data.booking_request_events as Record<string, unknown>[])[0];
    expect(ev.actor_id).toBeNull();
    expect(ev.event_type).toBe("proposed");
    const ab = (b.data.worker_absences as Record<string, unknown>[])[0];
    expect(ab.requested_by).toBeNull();
    expect(ab.reviewed_by).toBe("user-1");
    expect(b.redactions.booking_request_events).toEqual(["actor_id"]);
    expect(b.redactions.worker_absences).toEqual(["requested_by", "reviewed_by"]);
  });

  it("free-form task history state is withheld (it can name an assignee)", async () => {
    tables.set("work_tasks", ok([{ id: "t1" }]));
    tables.set(
      "work_task_events",
      ok([{ id: "e1", task_id: "t1", action: "assigned", after_state: { assignee: "other" } }]),
    );
    const b = await bundle();
    const ev = (b.data.work_task_events as Record<string, unknown>[])[0];
    expect(ev.action).toBe("assigned");
    expect(ev.after_state).toBeNull();
  });
});

describe("PER-12 honesty about what RLS may hide", () => {
  it("lists policy-limited relations in relationNotes, never silently empty", async () => {
    const b = await bundle();
    expect(b.relationNotes.evidence_import_rows).toMatch(/subject-safe function/);
    expect(b.relationNotes.agreement_events).toMatch(/NEEDS POLICY/);
    expect(b.relationNotes.agreement_amendments).toMatch(/NEEDS POLICY/);
    for (const key of Object.keys(b.relationNotes)) {
      expect(Object.keys(b.data)).toContain(key);
    }
  });

  it("the bundle is format version 3", async () => {
    const b = await bundle();
    expect(b.version).toBe(3);
  });
});

describe("PER-12 storage manifest", () => {
  it("is empty and never touches storage when the person has no files", async () => {
    const b = await bundle();
    expect(b.data.storage_manifest).toEqual([]);
    expect(signed.called).toEqual([]);
  });

  it("signs the person's own photo paths as the person and carries metadata", async () => {
    tables.set(
      "journal_entry_photos",
      ok([
        {
          id: "p1",
          storage_path: "user-1/p1.jpg",
          upload_status: "uploaded",
          file_name: "a.jpg",
          mime_type: "image/jpeg",
          file_size_bytes: 10,
        },
        { id: "p2", storage_path: "user-1/p2.jpg", upload_status: "removed" },
      ]),
    );
    signed.data = [{ path: "user-1/p1.jpg", signedUrl: "https://signed/p1" }];
    const b = await bundle();
    expect(signed.called).toEqual([["user-1/p1.jpg"]]);
    expect(b.data.storage_manifest).toEqual([
      {
        bucket: "journal-entry-photos",
        path: "user-1/p1.jpg",
        fileName: "a.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        signedUrl: "https://signed/p1",
        expiresInSeconds: 86400,
      },
    ]);
  });

  it("a signing failure is named unavailable and the metadata is still delivered", async () => {
    tables.set(
      "journal_entry_photos",
      ok([{ id: "p1", storage_path: "user-1/p1.jpg", upload_status: "uploaded" }]),
    );
    signed.error = { message: "denied" };
    const b = await bundle();
    expect(b.unavailable).toContain("storage_manifest");
    const m = b.data.storage_manifest as { signedUrl: string | null }[];
    expect(m[0].signedUrl).toBeNull();
  });
});
