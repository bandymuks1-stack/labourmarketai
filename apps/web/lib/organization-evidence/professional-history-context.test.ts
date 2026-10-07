import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildHistoryContext,
  deriveHistoryProof,
  type HistoryContextInput,
} from "./professional-history-context";
import { readEvidenceRecordsForWorker } from "./worker-evidence-read";

const base: HistoryContextInput = {
  activityDate: "2025-03-04",
  periodStart: null,
  periodEnd: null,
  importedAt: "2026-09-16T09:17:33Z",
  contextLabel: null,
  activityKind: "work",
  workObjectId: null,
  workObjectName: null,
  projectId: null,
  projectName: null,
  parties: [],
  organizationNames: null,
  relationshipKind: null,
  supplierRole: "employer",
  supplierOrganizationId: null,
  sourceKind: null,
  rowOrigin: null,
  reportedState: "ORGANIZATION_REPORTED",
  attestation: null,
  independentlyVerified: false,
  contested: false,
};

describe("buildHistoryContext - absent means absent", () => {
  it("a bare record invents nothing", () => {
    const c = buildHistoryContext({ ...base, supplierRole: null, reportedState: null });
    expect(c.project).toBeNull();
    expect(c.place).toBeNull();
    expect(c.clients).toEqual([]);
    expect(c.otherParties).toEqual([]);
    expect(c.relationshipKind).toBeNull();
    expect(c.source.reconstructed).toBe(false);
    expect(c.source.supplierName).toBeNull();
    expect(c.proof.concepts).toEqual([]);
    expect(c.hasDetail).toBe(false);
  });

  it("a project id that did not resolve shows no project (never the id, never a guess)", () => {
    const c = buildHistoryContext({ ...base, projectId: "p1", projectName: null });
    expect(c.project).toBeNull();
  });

  it("a client is never inferred from the project name or the context label", () => {
    const c = buildHistoryContext({
      ...base,
      projectId: "p1",
      projectName: "Acme Tower",
      contextLabel: "Acme Tower, level 3",
    });
    expect(c.project?.name).toBe("Acme Tower");
    expect(c.clients).toEqual([]);
  });

  it("an unnamed party (no label, organisation not resolvable) is not shown", () => {
    const c = buildHistoryContext({
      ...base,
      parties: [{ role: "client", organizationId: "o9", label: null }],
      organizationNames: new Map(),
    });
    expect(c.clients).toEqual([]);
  });

  it("a place that only repeats the source's own context cell adds nothing", () => {
    const c = buildHistoryContext({
      ...base,
      contextLabel: "Hoofdgracht 3",
      workObjectId: "w1",
      workObjectName: "hoofdgracht 3",
    });
    expect(c.place).toBeNull();
    const d = buildHistoryContext({ ...base, workObjectId: "w1", workObjectName: "Hoofdgracht 3" });
    expect(d.place?.name).toBe("Hoofdgracht 3");
  });
});

describe("buildHistoryContext - parties, roles, source", () => {
  it("separates the client side from other parties and resolves platform organisations", () => {
    const c = buildHistoryContext({
      ...base,
      parties: [
        { role: "end_client", organizationId: "o1", label: null },
        { role: "client", organizationId: null, label: "  Bouw BV " },
        { role: "client", organizationId: null, label: "bouw bv" },
        { role: "subcontractor", organizationId: null, label: "Tile Crew" },
      ],
      organizationNames: new Map([["o1", "City Hall"]]),
    });
    expect(c.clients.map((x) => x.label)).toEqual(["City Hall", "Bouw BV"]);
    expect(c.otherParties.map((x) => x.label)).toEqual(["Tile Crew"]);
  });

  it("keeps the work date and the recorded date apart", () => {
    const c = buildHistoryContext(base);
    expect(c.effective).toEqual({ kind: "day", date: "2025-03-04" });
    expect(c.recordedAt).toBe("2026-09-16");
    const p = buildHistoryContext({ ...base, activityDate: null, periodStart: "2025-06-01", periodEnd: "2025-11-30" });
    expect(p.effective).toEqual({ kind: "period", start: "2025-06-01", end: "2025-11-30" });
    expect(p.recordedAt).toBe("2026-09-16");
  });

  it("only rows rebuilt from an earlier file or reading are 'reconstructed'; typed rows are not", () => {
    expect(buildHistoryContext({ ...base, rowOrigin: "parsed_file" }).source.reconstructed).toBe(true);
    expect(buildHistoryContext({ ...base, rowOrigin: "agent_rows" }).source.reconstructed).toBe(true);
    expect(buildHistoryContext({ ...base, rowOrigin: "typed" }).source.reconstructed).toBe(false);
    expect(buildHistoryContext({ ...base, rowOrigin: null }).source.reconstructed).toBe(false);
  });

  it("names the supplier only when the organisation resolved", () => {
    const c = buildHistoryContext({
      ...base,
      supplierOrganizationId: "o7",
      organizationNames: new Map([["o7", "Nonstop"]]),
    });
    expect(c.source.supplierName).toBe("Nonstop");
    expect(buildHistoryContext({ ...base, supplierOrganizationId: "o7" }).source.supplierName).toBeNull();
  });
});

describe("deriveHistoryProof - distinct facts, never one 'verified'", () => {
  const none = { independentlyVerified: false, contested: false };

  it("an organisation's own record is evidence-supported and nothing more", () => {
    const p = deriveHistoryProof({ reportedState: "ORGANIZATION_REPORTED", attestation: null, ...none });
    expect(p.concepts).toEqual(["EVIDENCE_SUPPORTED"]);
  });

  it("a record the person reported is only self-declared", () => {
    expect(deriveHistoryProof({ reportedState: "SELF_REPORTED", attestation: null, ...none }).concepts).toEqual([
      "SELF_DECLARED",
    ]);
  });

  it("a self-attestation is self-declared, never employer or client confirmation", () => {
    const p = deriveHistoryProof({
      reportedState: "ORGANIZATION_REPORTED",
      attestation: { role: "employer", self: true },
      ...none,
    });
    expect(p.concepts).toContain("SELF_DECLARED");
    expect(p.concepts).not.toContain("EMPLOYER_CONFIRMED");
    expect(p.concepts).not.toContain("CLIENT_ACCEPTED");
    expect(p.attestedByRole).toBeNull();
  });

  it("an agency / subcontractor / project-owner attestation is NOT client acceptance and NOT employer confirmation", () => {
    for (const role of ["agency", "subcontractor", "project_owner", "other"]) {
      const p = deriveHistoryProof({
        reportedState: "ORGANIZATION_REPORTED",
        attestation: { role, self: false },
        ...none,
      });
      expect(p.concepts).toEqual(["EVIDENCE_SUPPORTED"]);
      expect(p.attestedByRole).toBe(role);
    }
  });

  it("client acceptance and employer confirmation are separate concepts and neither implies verification", () => {
    const client = deriveHistoryProof({
      reportedState: "ORGANIZATION_REPORTED",
      attestation: { role: "client", self: false },
      ...none,
    });
    expect(client.concepts).toContain("CLIENT_ACCEPTED");
    expect(client.concepts).not.toContain("EMPLOYER_CONFIRMED");
    expect(client.concepts).not.toContain("INDEPENDENTLY_VERIFIED");
    const employer = deriveHistoryProof({
      reportedState: "ORGANIZATION_REPORTED",
      attestation: { role: "employer", self: false },
      ...none,
    });
    expect(employer.concepts).toContain("EMPLOYER_CONFIRMED");
    expect(employer.concepts).not.toContain("CLIENT_ACCEPTED");
  });

  it("independent verification comes only from the verification flag; SUPERVISOR_CONFIRMED is never derived", () => {
    const v = deriveHistoryProof({
      reportedState: "ORGANIZATION_REPORTED",
      attestation: null,
      independentlyVerified: true,
      contested: false,
    });
    expect(v.concepts).toContain("INDEPENDENTLY_VERIFIED");
    for (const role of ["employer", "client", "verifier", "assessor"]) {
      expect(
        deriveHistoryProof({ reportedState: "UNVERIFIED", attestation: { role, self: false }, ...none }).concepts,
      ).not.toContain("SUPERVISOR_CONFIRMED");
    }
  });

  it("a record that needs review claims no supporting fact; a contest is its own flag", () => {
    const p = deriveHistoryProof({
      reportedState: "NEEDS_REVIEW",
      attestation: null,
      independentlyVerified: false,
      contested: true,
    });
    expect(p.concepts).toEqual([]);
    expect(p.contested).toBe(true);
  });

  it("the importer is not an input: nothing here can make an uploader a confirmer", () => {
    // The input type has no importer field; a record with no attestation event
    // carries no confirmation concept however it was uploaded.
    const p = deriveHistoryProof({ reportedState: "ORGANIZATION_REPORTED", attestation: null, ...none });
    expect(p.concepts.filter((c) => c !== "EVIDENCE_SUPPORTED")).toEqual([]);
  });
});

// ── the extended worker read, through a table-keyed fake client ─────────────

type Table = { data: unknown[] | null; error?: { code: string } | null };

function fakeClient(tables: Record<string, Table>) {
  const builder = (table: string) => {
    const t = tables[table] ?? { data: [] };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit"]) b[m] = () => b;
    b.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: t.error ? null : t.data, error: t.error ?? null });
    return b;
  };
  return { from: (table: string) => builder(table) } as never;
}

const rec = (over: Record<string, unknown>) => ({
  id: "r1",
  organization_id: "org1",
  organization_person_id: "p1",
  activity_date: "2025-03-04",
  period_start: null,
  period_end: null,
  hours: 8,
  evidence_state: "ORGANIZATION_REPORTED",
  derived: {},
  activity_kind: "work",
  context_label: null,
  work_object_id: null,
  project_id: null,
  supplied_by_organization_id: "org1",
  supplier_role: "employer",
  source_kind: "xlsx",
  row_origin: "parsed_file",
  imported_at: "2026-09-16T09:17:33Z",
  organization_people: { relationship_kind: "employee", linked_profile_id: "u1" },
  organization_evidence_events: [],
  organization_evidence_parties: [],
  ...over,
});

const linked = { data: [{ id: "p1" }] };

describe("readEvidenceRecordsForWorker - context travels with the same rows", () => {
  it("an unlinked person has no roster link and therefore no records and no context", async () => {
    const out = await readEvidenceRecordsForWorker(
      fakeClient({ organization_people: { data: [] }, organization_evidence_records: { data: [rec({})] } }),
      "w1",
    );
    expect(out).toEqual({ kind: "ok", rows: [], periodRows: [] });
  });

  it("withdrawn records stay excluded", async () => {
    const out = await readEvidenceRecordsForWorker(
      fakeClient({
        organization_people: linked,
        organization_evidence_records: {
          data: [
            rec({
              organization_evidence_events: [
                { event_type: "withdrawn", actor_role: "employer", actor_profile_id: "m1", created_at: "2026-09-17T00:00:00Z" },
              ],
            }),
          ],
        },
      }),
      "w1",
    );
    expect(out.kind === "ok" && out.rows.length).toBe(0);
  });

  it("day rows and period rows are unchanged in shape and count; context rides along", async () => {
    const out = await readEvidenceRecordsForWorker(
      fakeClient({
        organization_people: linked,
        organization_evidence_records: {
          data: [
            rec({ id: "d1", work_object_id: "w1", project_id: "pr1", context_label: "Level 3" }),
            rec({
              id: "pe1",
              activity_date: null,
              period_start: "2025-06-01",
              period_end: "2025-11-30",
              hours: 800,
              derived: { timeSemantics: { classification: "period_total" } },
            }),
          ],
        },
        work_objects: { data: [{ id: "w1", name: "Hoofdgracht 3" }] },
        projects: { data: [{ id: "pr1", title: "Canal renovation" }] },
        organizations: { data: [{ id: "org1", display_name: "Nonstop", legal_name: null }] },
      }),
      "w1",
    );
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({ id: "d1", workDate: "2025-03-04", hours: 8, organizationId: "org1" });
    expect(out.rows[0].context.project?.name).toBe("Canal renovation");
    expect(out.rows[0].context.place?.name).toBe("Hoofdgracht 3");
    expect(out.rows[0].context.relationshipKind).toBe("employee");
    expect(out.rows[0].context.source.supplierName).toBe("Nonstop");
    expect(out.rows[0].context.source.reconstructed).toBe(true);
    // The effective date is the work day; the import day is separate.
    expect(out.rows[0].context.effective).toEqual({ kind: "day", date: "2025-03-04" });
    expect(out.rows[0].context.recordedAt).toBe("2026-09-16");
    expect(out.periodRows).toHaveLength(1);
    expect(out.periodRows[0]).toMatchObject({ id: "pe1", hours: 800 });
    expect(out.periodRows[0].context.effective).toEqual({
      kind: "period",
      start: "2025-06-01",
      end: "2025-11-30",
    });
  });

  it("no context in the data => no invented values, and the hours are untouched", async () => {
    const out = await readEvidenceRecordsForWorker(
      fakeClient({
        organization_people: linked,
        organization_evidence_records: {
          data: [
            rec({
              row_origin: null,
              source_kind: null,
              supplier_role: null,
              supplied_by_organization_id: null,
              organization_people: { relationship_kind: null, linked_profile_id: "u1" },
            }),
          ],
        },
      }),
      "w1",
    );
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    const c = out.rows[0].context;
    expect(out.rows[0].hours).toBe(8);
    expect(c.project).toBeNull();
    expect(c.place).toBeNull();
    expect(c.clients).toEqual([]);
    expect(c.relationshipKind).toBeNull();
    expect(c.source.reconstructed).toBe(false);
  });

  it("a failed or RLS-hidden name lookup never fails the read and never changes a row", async () => {
    const out = await readEvidenceRecordsForWorker(
      fakeClient({
        organization_people: linked,
        organization_evidence_records: { data: [rec({ work_object_id: "w1", project_id: "pr1" })] },
        work_objects: { data: null, error: { code: "42501" } },
        projects: { data: [] },
      }),
      "w1",
    );
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].context.project).toBeNull();
    expect(out.rows[0].context.place).toBeNull();
  });

  it("the same record twice in the payload is counted once; two real sources stay two rows", async () => {
    const out = await readEvidenceRecordsForWorker(
      fakeClient({
        organization_people: linked,
        organization_evidence_records: {
          data: [rec({ id: "a" }), rec({ id: "a" }), rec({ id: "b", organization_id: "org2" })],
        },
      }),
      "w1",
    );
    expect(out.kind === "ok" && out.rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("the attestation role is read from the record's own events, not from who imported it", async () => {
    const out = await readEvidenceRecordsForWorker(
      fakeClient({
        organization_people: linked,
        organization_evidence_records: {
          data: [
            rec({
              imported_by_profile_id: "u-importer",
              organization_evidence_events: [
                { event_type: "attested", actor_role: "agency", actor_profile_id: "m1", created_at: "2026-09-17T00:00:00Z" },
              ],
            }),
          ],
        },
      }),
      "w1",
    );
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    const p = out.rows[0].context.proof;
    expect(p.concepts).toEqual(["EVIDENCE_SUPPORTED"]);
    expect(p.attestedByRole).toBe("agency");
  });
});
