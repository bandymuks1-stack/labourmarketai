import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/company/active-organization", () => ({
  withSessionWorkspacePointer: async (c: unknown) => c,
  listWorkspaceMemberships: async () => [],
  resolveActiveWorkspaceForCaller: async () => ({ activeWorkspaceId: null }),
}));

import { readCompanyPerson } from "./company-person-read";
import { readCompetencySignalsForPerson } from "./competency-signals-read";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const PERSON = "33333333-3333-4333-8333-333333333333";

type Err = { code: string } | null;
interface World {
  people: {
    id: string;
    organization_id: string;
    display_name: string;
    relationship_kind: string | null;
    link_state: string;
    linked_worker_id: string | null;
  }[];
  records: Record<string, unknown>[];
  signals: Record<string, unknown>[];
  workObjects: { id: string; name: string }[];
  fail?: { people?: Err; records?: Err; signals?: Err };
}

function record(i: number, over: Record<string, unknown> = {}) {
  return {
    id: `rec-${i}`,
    organization_person_id: PERSON,
    organization_id: ORG,
    activity_kind: "work",
    activity_date: `2025-03-${String((i % 28) + 1).padStart(2, "0")}`,
    period_start: null,
    period_end: null,
    hours: 8,
    original_text: "Tile laying",
    original_language: "lt",
    context_label: null,
    work_object_id: null,
    project_id: null,
    supplied_by_organization_id: ORG,
    row_origin: "parsed_file",
    supplier_role: "employer",
    source_kind: "xlsx",
    source_filename: "x.xlsx",
    imported_at: "2026-09-16T00:00:00Z",
    imported_by_profile_id: null,
    evidence_state: "ORGANIZATION_REPORTED",
    source_fact: null,
    derived: {},
    organization_people: { display_name: "Jonas", linked_profile_id: null, relationship_kind: "employee" },
    organization_evidence_events: [],
    organization_evidence_parties: [],
    ...over,
  };
}

/** Table-keyed fake honouring eq / range / maybeSingle, as the real client would. */
function fake(w: World) {
  const rangeCalls: [number, number][] = [];
  const from = (table: string) => {
    const eqs: [string, unknown][] = [];
    let range: [number, number] | null = null;
    const b: Record<string, unknown> = {};
    for (const m of ["select", "in", "order", "limit", "not"]) b[m] = () => b;
    b.eq = (c: string, v: unknown) => {
      eqs.push([c, v]);
      return b;
    };
    b.range = (a: number, z: number) => {
      range = [a, z];
      rangeCalls.push([a, z]);
      return b;
    };
    const rows = (): { data: unknown[] | null; error: Err } => {
      if (table === "organization_people") {
        const err = w.fail?.people ?? null;
        const hit = w.people.filter((p) => eqs.every(([c, v]) => (p as Record<string, unknown>)[c] === v));
        return { data: err ? null : hit, error: err };
      }
      if (table === "organization_evidence_records") {
        const err = w.fail?.records ?? null;
        const hit = w.records.filter((r) => eqs.every(([c, v]) => (r as Record<string, unknown>)[c] === v));
        const page = range ? hit.slice(range[0], range[1] + 1) : hit;
        return { data: err ? null : page, error: err };
      }
      if (table === "organization_evidence_competency_signals") {
        const err = w.fail?.signals ?? null;
        return { data: err ? null : w.signals, error: err };
      }
      if (table === "work_objects") return { data: w.workObjects, error: null };
      return { data: [], error: null };
    };
    b.maybeSingle = () => {
      const r = rows();
      return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error });
    };
    b.then = (resolve: (v: unknown) => unknown) => resolve(rows());
    return b;
  };
  return { client: { from } as never, rangeCalls };
}

const person = (over: Partial<World["people"][number]> = {}) => ({
  id: PERSON,
  organization_id: ORG,
  display_name: "Jonas Jonaitis",
  relationship_kind: "employee",
  link_state: "unlinked",
  linked_worker_id: null,
  ...over,
});

const run = (w: World, personId = PERSON, organizationId = ORG) => {
  const { client, rangeCalls } = fake(w);
  return readCompanyPerson({
    caller: { supabase: client, userId: "u1", locale: "lt" } as never,
    organizationId,
    organizationName: "Acme",
    personId,
  }).then((load) => ({ load, rangeCalls }));
};

const empty = (over: Partial<World> = {}): World => ({
  people: [person()],
  records: [],
  signals: [],
  workObjects: [],
  ...over,
});

describe("readCompanyPerson - the historical person card for an UNLINKED roster person", () => {
  it("includes an UNLINKED person and all their records, with the unlinked state", async () => {
    const { load } = await run(empty({ records: [record(1), record(2)] }));
    expect(load.kind).toBe("ready");
    if (load.kind !== "ready") return;
    expect(load.person.linkState).toBe("unlinked");
    expect(load.person.linkedWorkerId).toBeNull();
    expect(load.person.name).toBe("Jonas Jonaitis");
    expect(load.records).toHaveLength(2);
  });

  it("reads PAST 1000 records: 2944 stored, 2944 returned, not truncated", async () => {
    const records = Array.from({ length: 2944 }, (_, i) => record(i));
    const { load, rangeCalls } = await run(empty({ records }));
    expect(load.kind === "ready" && load.records.length).toBe(2944);
    expect(load.kind === "ready" && load.truncated).toBe(false);
    expect(rangeCalls.length).toBeGreaterThanOrEqual(3);
  });

  it("RETAINS records without a work_object_id in the person history and summary", async () => {
    const records = [
      record(1, { work_object_id: "w1" }),
      record(2, { work_object_id: null, context_label: "Kaunas, Savanoriu 1" }),
      record(3, { work_object_id: null, context_label: null }),
    ];
    const { load } = await run(empty({ records, workObjects: [{ id: "w1", name: "Site A" }] }));
    expect(load.kind).toBe("ready");
    if (load.kind !== "ready") return;
    expect(load.records.map((r) => r.id)).toEqual(["rec-1", "rec-2", "rec-3"]);
    expect(load.summary.recordsWithoutWorkObject).toBe(2);
    expect(load.summary.history.places.reduce((n, p) => n + p.records.length, 0)).toBe(3);
  });

  it("an existing person with NO records is ready/empty - distinct from unavailable and not-found", async () => {
    const { load } = await run(empty());
    expect(load.kind).toBe("ready");
    expect(load.kind === "ready" && load.records).toEqual([]);
  });

  it("a failed record read is UNAVAILABLE, never an empty history", async () => {
    const { load } = await run(empty({ fail: { records: { code: "XX000" } } }));
    expect(load.kind).toBe("unavailable");
  });

  it("a failed roster read is UNAVAILABLE, not not-found", async () => {
    const { load } = await run(empty({ people: [], fail: { people: { code: "XX000" } } }));
    expect(load.kind).toBe("unavailable");
  });

  it("another organization person (or an unknown id) is NOT FOUND - never data", async () => {
    const w = empty({ people: [person({ organization_id: OTHER_ORG })], records: [record(1)] });
    expect((await run(w)).load.kind).toBe("not-found");
    expect((await run({ ...w, people: [] })).load.kind).toBe("not-found");
    expect((await run(w, "not-a-uuid")).load.kind).toBe("not-found");
  });

  it("states the link: link_proposed carries no worker link, linked carries the worker id", async () => {
    const proposed = await run(empty({ people: [person({ link_state: "link_proposed", linked_worker_id: "w9" })] }));
    expect(proposed.load.kind === "ready" && proposed.load.person.linkState).toBe("link_proposed");
    expect(proposed.load.kind === "ready" && proposed.load.person.linkedWorkerId).toBeNull();
    const linked = await run(empty({ people: [person({ link_state: "linked", linked_worker_id: "w9" })] }));
    expect(linked.load.kind === "ready" && linked.load.person.linkState).toBe("linked");
    expect(linked.load.kind === "ready" && linked.load.person.linkedWorkerId).toBe("w9");
  });

  it("an unknown link_state falls back to the conservative unlinked", async () => {
    const { load } = await run(empty({ people: [person({ link_state: "weird" })] }));
    expect(load.kind === "ready" && load.person.linkState).toBe("unlinked");
  });

  it("skill signals are derived + unverified, and a failed read is error, not empty", async () => {
    const ok = await run(
      empty({
        records: [record(1)],
        signals: [{ record_id: "rec-1", term: "tiles", skill_slug: "tiling", confidence: 0.9 }],
      }),
    );
    expect(ok.load.kind).toBe("ready");
    if (ok.load.kind === "ready" && ok.load.signals.kind === "ok") {
      expect(ok.load.signals.signals.map((s) => s.slug)).toEqual(["tiling"]);
      expect(ok.load.signals.provenance).toBe("organization_history_derived");
      expect(ok.load.signals.verified).toBe(false);
    } else {
      throw new Error("expected ok signals");
    }

    const failed = await run(empty({ records: [record(1)], fail: { signals: { code: "XX000" } } }));
    expect(failed.load.kind === "ready" && failed.load.signals.kind).toBe("error");
  });
});

describe("readCompetencySignalsForPerson", () => {
  it("no records -> ok with no signals (no read needed)", async () => {
    const { client } = fake(empty());
    const r = await readCompetencySignalsForPerson(client, []);
    expect(r.kind).toBe("ok");
  });
});
