import { describe, expect, it } from "vitest";

import {
  demandStatusTone,
  groupDemandsByClient,
  isMissingColumnCode,
  isMissingRpcCode,
  isMissingTableCode,
  validateAgencyClientInput,
  type AgencyClient,
  type AgencyDemandRow,
} from "@/lib/agency/clients-model";

function client(id: string, name = `Client ${id}`): AgencyClient {
  return {
    id,
    name,
    contactName: null,
    contactEmail: null,
    note: null,
    createdAt: "2026-07-13T00:00:00Z",
  };
}

function demand(
  id: string,
  agencyClientId: string | null,
  status = "submitted",
): AgencyDemandRow {
  return {
    id,
    title: `Demand ${id}`,
    status,
    agencyClientId,
    createdAt: "2026-07-13T00:00:00Z",
  };
}

describe("validateAgencyClientInput (mirrors save_agency_client_v1)", () => {
  it("accepts a minimal valid client (name only) and trims", () => {
    const r = validateAgencyClientInput({ name: "  UAB Statyba  " });
    expect(r).toEqual({
      ok: true,
      value: {
        name: "UAB Statyba",
        contactName: null,
        contactEmail: null,
        note: null,
      },
    });
  });

  it("normalises empty optional fields to null", () => {
    const r = validateAgencyClientInput({
      name: "AB Norfa",
      contactName: "  ",
      contactEmail: "",
      note: "   ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.contactName).toBeNull();
      expect(r.value.contactEmail).toBeNull();
      expect(r.value.note).toBeNull();
    }
  });

  it("rejects name shorter than 2 or longer than 160 (DB CHECK bounds)", () => {
    expect(validateAgencyClientInput({ name: "A" })).toEqual({
      ok: false,
      reason: "name",
    });
    expect(validateAgencyClientInput({ name: "" })).toEqual({
      ok: false,
      reason: "name",
    });
    expect(validateAgencyClientInput({ name: "x".repeat(161) })).toEqual({
      ok: false,
      reason: "name",
    });
    expect(validateAgencyClientInput({ name: "x".repeat(160) }).ok).toBe(true);
  });

  it("rejects an email without a local part or over 200 chars", () => {
    expect(
      validateAgencyClientInput({ name: "OK", contactEmail: "@x.lt" }),
    ).toEqual({ ok: false, reason: "contactEmail" });
    expect(
      validateAgencyClientInput({ name: "OK", contactEmail: "no-at-sign" }),
    ).toEqual({ ok: false, reason: "contactEmail" });
    expect(
      validateAgencyClientInput({
        name: "OK",
        contactEmail: `${"x".repeat(195)}@ilgas.lt`,
      }),
    ).toEqual({ ok: false, reason: "contactEmail" });
    expect(
      validateAgencyClientInput({ name: "OK", contactEmail: "a@b.lt" }).ok,
    ).toBe(true);
  });

  it("caps contactName at 120 and note at 500 (DB CHECK bounds)", () => {
    expect(
      validateAgencyClientInput({ name: "OK", contactName: "x".repeat(121) }),
    ).toEqual({ ok: false, reason: "contactName" });
    expect(
      validateAgencyClientInput({ name: "OK", note: "x".repeat(501) }),
    ).toEqual({ ok: false, reason: "note" });
    expect(
      validateAgencyClientInput({ name: "OK", note: "x".repeat(500) }).ok,
    ).toBe(true);
  });
});

describe("groupDemandsByClient", () => {
  it("groups linked demands under their client, preserving order", () => {
    const clients = [client("c1"), client("c2")];
    const demands = [
      demand("d1", "c1"),
      demand("d2", null),
      demand("d3", "c1"),
      demand("d4", "c2"),
    ];
    const g = groupDemandsByClient(clients, demands);
    expect(g.byClient.get("c1")?.map((d) => d.id)).toEqual(["d1", "d3"]);
    expect(g.byClient.get("c2")?.map((d) => d.id)).toEqual(["d4"]);
    expect(g.unassigned.map((d) => d.id)).toEqual(["d2"]);
  });

  it("treats a stale/unknown client id as unassigned — never invents a group", () => {
    const g = groupDemandsByClient([client("c1")], [demand("d1", "deleted-client")]);
    expect(g.byClient.size).toBe(0);
    expect(g.unassigned.map((d) => d.id)).toEqual(["d1"]);
  });

  it("handles empty inputs", () => {
    const g = groupDemandsByClient([], []);
    expect(g.byClient.size).toBe(0);
    expect(g.unassigned).toEqual([]);
  });
});

describe("missing-schema code detection (honest degradation contract)", () => {
  it("recognises the exact codes the cloud API returns for unapplied drafts", () => {
    // 42P01 raw Postgres; PGRST205 PostgREST schema cache (verified in the
    // company_locations production smoke — same gated pattern).
    expect(isMissingTableCode("42P01")).toBe(true);
    expect(isMissingTableCode("PGRST205")).toBe(true);
    expect(isMissingColumnCode("42703")).toBe(true);
    expect(isMissingRpcCode("42883")).toBe(true);
    expect(isMissingRpcCode("PGRST202")).toBe(true);
  });

  it("never treats other errors as missing schema", () => {
    for (const code of ["42501", "P0001", "P0002", "", null, undefined]) {
      expect(isMissingTableCode(code)).toBe(false);
      expect(isMissingColumnCode(code)).toBe(false);
      expect(isMissingRpcCode(code)).toBe(false);
    }
  });
});

describe("demandStatusTone", () => {
  it("maps every canonical customer_requests status", () => {
    expect(demandStatusTone("approved")).toBe("success");
    expect(demandStatusTone("submitted")).toBe("info");
    expect(demandStatusTone("in_review")).toBe("info");
    expect(demandStatusTone("needs_followup")).toBe("warning");
    expect(demandStatusTone("draft")).toBe("muted");
    expect(demandStatusTone("closed")).toBe("muted");
  });

  it("stays quiet for unknown statuses", () => {
    expect(demandStatusTone("whatever")).toBe("muted");
  });
});
