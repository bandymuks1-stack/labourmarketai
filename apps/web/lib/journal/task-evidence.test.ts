import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * G-2 (counter-canonical v1): a task's evidence follows the CURRENT version of
 * each linked entry.
 *
 * THE DEFECT. `getTaskEvidence` / `getTaskEvidenceByTask` read
 * `journal_entry_tasks` with no deleted / superseded filter and degraded every
 * reader error to "no evidence". After an edit (supersede) the task still
 * listed the old text and hours and the edited version was linked to nothing;
 * after a delete it kept listing the deleted entry; a failed read rendered as
 * "nothing attached". Each case below failed before the change.
 */

type Row = Record<string, unknown>;
const state: {
  links: Row[];
  entries: Row[];
  linksError: boolean;
  entriesError: boolean;
} = { links: [], entries: [], linksError: false, entriesError: false };

function builder(table: string) {
  const filters: { op: string; col: string; val: unknown }[] = [];
  const b: Record<string, unknown> = {};
  const settle = () => {
    if (table === "journal_entry_tasks") {
      return state.linksError
        ? { data: null, error: { code: "57014" } }
        : { data: state.links, error: null };
    }
    if (state.entriesError) return { data: null, error: { code: "57014" } };
    const byId = filters.find((f) => f.op === "in" && f.col === "id");
    const byCorrection = filters.find((f) => f.op === "in" && f.col === "correction_of");
    let rows = state.entries;
    if (byId) rows = rows.filter((e) => (byId.val as string[]).includes(e.id as string));
    if (byCorrection) {
      rows = rows.filter(
        (e) =>
          (byCorrection.val as string[]).includes(e.correction_of as string) &&
          e.deleted_at == null &&
          e.superseded_by == null,
      );
    }
    return { data: rows, error: null };
  };
  b.select = () => b;
  b.eq = (col: string, val: unknown) => (filters.push({ op: "eq", col, val }), b);
  b.in = (col: string, val: unknown) => (filters.push({ op: "in", col, val }), b);
  b.is = (col: string, val: unknown) => (filters.push({ op: "is", col, val }), b);
  b.order = () => b;
  b.limit = () => b;
  b.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
    Promise.resolve(settle()).then(ok, err);
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (t: string) => builder(t),
  })),
}));

import { getTaskEvidence, getTaskEvidenceByTask } from "@/lib/journal/task-evidence";

const TASK = "11111111-1111-4111-8111-111111111111";

function entry(id: string, over: Row = {}): Row {
  return {
    id,
    worker_id: "w1",
    project_id: null,
    original_text: `text of ${id}`,
    original_language: "en",
    created_at: "2026-09-10T08:00:00Z",
    deleted_at: null,
    superseded_by: null,
    correction_of: null,
    journal_entry_photos: [],
    journal_entry_confirmations: [],
    journal_entry_metrics: [],
    workers: { profile_id: "p-subject", display_name: "Person A", profiles: null },
    ...over,
  };
}
const link = (entryId: string, over: Row = {}): Row => ({
  id: `link-${entryId}`,
  task_id: TASK,
  entry_id: entryId,
  linked_at: "2026-09-10T09:00:00Z",
  linked_by: "u1",
  ...over,
});

beforeEach(() => {
  state.links = [];
  state.entries = [];
  state.linksError = false;
  state.entriesError = false;
});

async function ids() {
  const r = await getTaskEvidence(TASK);
  if (r.status !== "ok") throw new Error(`status ${r.status}`);
  return r.items.map((i) => i.entryId);
}

describe("task evidence shows the CURRENT version of an entry", () => {
  it("a live entry is listed as before", async () => {
    const e = entry("e1");
    state.entries = [e];
    state.links = [link("e1", { journal_entries: e })];
    expect(await ids()).toEqual(["e1"]);
  });

  it("an EDITED (superseded) entry shows the new version, not the withdrawn one", async () => {
    const old = entry("old", { superseded_by: "new", original_text: "withdrawn text" });
    const next = entry("new", { original_text: "edited text" });
    state.entries = [old, next];
    state.links = [link("old", { journal_entries: old })];
    const r = await getTaskEvidence(TASK);
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.items.map((i) => i.entryId)).toEqual(["new"]); // pre-fix: ["old"]
    expect(r.items[0]!.originalText).toBe("edited text");
  });

  it("a DELETED entry is no longer evidence", async () => {
    const gone = entry("gone", { deleted_at: "2026-09-11T00:00:00Z" });
    state.entries = [gone];
    state.links = [link("gone", { journal_entries: gone })];
    expect(await ids()).toEqual([]); // pre-fix: ["gone"]
  });

  it("a CORRECTED confirmed original is replaced by its live correction (counted once)", async () => {
    const orig = entry("orig", {
      journal_entry_confirmations: [
        { confirmation_scope: { decision: "approved" }, created_at: "2026-09-10T12:00:00Z", confirmer_id: "m1" },
      ],
    });
    const fix = entry("fix", { correction_of: "orig" });
    state.entries = [orig, fix];
    state.links = [link("orig", { journal_entries: orig })];
    const r = await getTaskEvidence(TASK);
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.items.map((i) => i.entryId)).toEqual(["fix"]);
    // the withdrawn approval is not inherited by the correction
    expect(r.items[0]!.confirmedAt).toBeNull();
    expect(r.summary.confirmed).toBe(0);
  });

  it("two links that resolve to the same current entry list it once", async () => {
    const a = entry("a", { superseded_by: "c" });
    const b = entry("b", { superseded_by: "c" });
    const c = entry("c");
    state.entries = [a, b, c];
    state.links = [link("a", { journal_entries: a }), link("b", { journal_entries: b })];
    expect(await ids()).toEqual(["c"]);
  });
});

describe("'manager-confirmed' on a task uses the ONE definition", () => {
  it("a rejection and the author's own approval are not confirmations", async () => {
    const rejected = entry("r", {
      journal_entry_confirmations: [
        { confirmation_scope: { decision: "rejected" }, created_at: "2026-09-10T12:00:00Z", confirmer_id: "m1" },
      ],
    });
    const own = entry("o", {
      journal_entry_confirmations: [
        { confirmation_scope: { decision: "approved" }, created_at: "2026-09-10T12:00:00Z", confirmer_id: "p-subject" },
      ],
    });
    state.entries = [rejected, own];
    state.links = [link("r", { journal_entries: rejected }), link("o", { journal_entries: own })];
    const r = await getTaskEvidence(TASK);
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.summary.confirmed).toBe(0); // pre-fix: 2 (any decision row)
  });
});

describe("decision 0018: client acceptance is not 'manager-confirmed'", () => {
  it("a client_accept row leaves confirmedAt null; an employer approval beside it still counts", async () => {
    const clientAccept = {
      confirmation_scope: { action: "client_accept", decision: "approved", authority: { basis: "counterparty" } },
      created_at: "2026-09-10T12:00:00Z",
      confirmer_id: "client-user",
    };
    const onlyClient = entry("c1", { journal_entry_confirmations: [clientAccept] });
    const both = entry("c2", {
      journal_entry_confirmations: [
        { confirmation_scope: { decision: "approved" }, created_at: "2026-09-10T13:00:00Z", confirmer_id: "m1" },
        clientAccept,
      ],
    });
    state.entries = [onlyClient, both];
    state.links = [link("c1", { journal_entries: onlyClient }), link("c2", { journal_entries: both })];
    const r = await getTaskEvidence(TASK);
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.summary.confirmed).toBe(1);
    expect(r.items.find((i) => i.entryId === "c1")!.confirmedAt).toBeNull();
    expect(r.items.find((i) => i.entryId === "c2")!.confirmedAt).toBe("2026-09-10T13:00:00Z");
  });
});

describe("a failed read is not 'no evidence' (SEP-7)", () => {
  it("link read failure -> unreadable (single and batch)", async () => {
    state.linksError = true;
    expect((await getTaskEvidence(TASK)).status).toBe("unreadable");
    expect((await getTaskEvidenceByTask([TASK])).status).toBe("unreadable");
  });

  it("a failed version lookup -> unreadable, never the stale old entry", async () => {
    const old = entry("old", { superseded_by: "new" });
    state.links = [link("old", { journal_entries: old })];
    state.entriesError = true;
    expect((await getTaskEvidence(TASK)).status).toBe("unreadable");
  });

  it("batch groups current versions by task", async () => {
    const old = entry("old", { superseded_by: "new" });
    state.entries = [old, entry("new")];
    state.links = [link("old", { journal_entries: old })];
    const batch = await getTaskEvidenceByTask([TASK]);
    expect(batch.status).toBe("ok");
    expect(batch.itemsByTask[TASK]?.map((i) => i.entryId)).toEqual(["new"]);
  });
});
