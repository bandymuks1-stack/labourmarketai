import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
// The door must never reach the cookie client: it runs as the caller's own client.
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => {
    throw new Error("the project-invoice door must not use the cookie/session client directly");
  },
}));

type View = {
  header: Record<string, unknown>;
  lines: Record<string, unknown>[];
  sources: Record<string, unknown>[];
  sourcesVisible: boolean;
  chain: Record<string, unknown>[];
};
const reads = {
  invoicing: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ kind: "ok", value: {} })),
  view: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ kind: "ok", value: null })),
  preview: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ kind: "ok", value: [] })),
  changes: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ kind: "ok", value: [] })),
  unattributed: vi.fn(async (..._a: unknown[]): Promise<number | null> => 0),
};
vi.mock("@/lib/finance/project-invoice", () => ({
  getProjectInvoicing: (...a: unknown[]) => reads.invoicing(...a),
  getInvoiceView: (...a: unknown[]) => reads.view(...a),
  getPeriodPreview: (...a: unknown[]) => reads.preview(...a),
  getPeriodChanges: (...a: unknown[]) => reads.changes(...a),
  countUnattributedEntries: (...a: unknown[]) => reads.unattributed(...a),
}));

import type { CapabilityCaller, CapabilityDescriptor } from "./contract";
import { PROJECT_INVOICE_CAPABILITIES } from "./project-invoice-capabilities";

const P = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const PERIOD = "33333333-3333-4333-8333-333333333333";
const INV = "44444444-4444-4444-8444-444444444444";
const LINE = "55555555-5555-4555-8555-555555555555";
const E1 = "66666666-6666-4666-8666-666666666666";
const E2 = "77777777-7777-4777-8777-777777777777";

const byId = new Map(PROJECT_INVOICE_CAPABILITIES.map((c) => [c.id, c] as const));
const cap = (id: string): CapabilityDescriptor => {
  const c = byId.get(id);
  if (!c) throw new Error(`missing capability ${id}`);
  return c;
};

type Table = { data?: unknown; error?: { code?: string } | null; count?: number };
let tables: Record<string, Table>;
let rpcResults: Record<string, unknown>;
let rpcCalls: { name: string; args: Record<string, unknown> }[];

function chain(t: Table) {
  const out: Record<string, unknown> = {};
  const self = () => out;
  for (const m of ["select", "eq", "in", "is", "not", "limit", "order"]) out[m] = self;
  out.maybeSingle = async () => ({ data: Array.isArray(t.data) ? t.data[0] ?? null : t.data ?? null, error: t.error ?? null });
  out.then = (res: (v: unknown) => unknown) => res({ data: t.data ?? [], error: t.error ?? null, count: t.count ?? 0 });
  return out;
}
function makeCaller(): CapabilityCaller {
  const supabase = {
    from: (name: string) => chain(tables[name] ?? { data: null }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { data: rpcResults[name] ?? { status: "error" }, error: null };
    },
  };
  return { userId: "user-1", transport: "bearer", locale: "en", supabase: supabase as never };
}

beforeEach(() => {
  tables = { projects: { data: { id: P, title: "Site A", organization_id: ORG } } };
  rpcResults = {};
  rpcCalls = [];
  for (const r of Object.values(reads)) r.mockClear();
});

const run = (id: string, input: unknown, caller = makeCaller()) => cap(id).run(caller, cap(id).inputSchema.parse(input));

describe("registry shape", () => {
  it("exposes four reads and six draft/confirm pairs, all with honest annotations", () => {
    expect(PROJECT_INVOICE_CAPABILITIES).toHaveLength(16);
    for (const c of PROJECT_INVOICE_CAPABILITIES) {
      expect(c.exposed).toBe(true);
      expect(["read", "draft", "confirm"]).toContain(c.kind);
      expect(c.annotations.readOnlyHint).toBe(c.kind !== "confirm");
      expect(c.annotations.destructiveHint).toBe(false);
    }
    const drafts = PROJECT_INVOICE_CAPABILITIES.filter((c) => c.kind === "draft").map((c) => c.id.replace("_draft", ""));
    const confirms = PROJECT_INVOICE_CAPABILITIES.filter((c) => c.kind === "confirm").map((c) => c.id.replace("_confirm", ""));
    expect(drafts.sort()).toEqual(confirms.sort());
  });

  it("schemas are strict: no identity, organization or service argument can be smuggled in", () => {
    expect(() => cap("project_invoice.overview_get").inputSchema.parse({ projectId: P, userId: "x" })).toThrow();
    expect(() => cap("project_invoice.period_create_draft").inputSchema.parse({ projectId: P, periodStart: "2026-10-01", periodEnd: "2026-10-31", organizationId: ORG })).toThrow();
  });
});

describe("reads run as the caller", () => {
  it("overview passes the CALLER's client to the same readers the pages use and never mixes currencies", async () => {
    reads.invoicing.mockResolvedValueOnce({
      kind: "ok",
      value: {
        recipients: [], series: [], presets: [], periods: [],
        rateTerms: [{ id: "t1", basisType: "hours", unit: "hours", rateCents: 2550, currency: "EUR", label: null, roleLabel: null, validFrom: "2026-10-01", validTo: null }],
        invoices: [],
        totals: [
          { currency: "EUR", kind: "invoice", documents: 1, netCents: 10000, taxCents: 2100, grossCents: 12100 },
          { currency: "GBP", kind: "invoice", documents: 1, netCents: 5000, taxCents: 0, grossCents: 5000 },
        ],
      },
    });
    const caller = makeCaller();
    const res = await cap("project_invoice.overview_get").run(caller, { projectId: P });
    expect(res.ok).toBe(true);
    expect(reads.invoicing.mock.calls[0]![2]).toBe(caller.supabase);
    const data = (res as unknown as { data: { totals: { currency: string; gross: string }[]; rateTerms: { rate: string }[] } }).data;
    expect(data.rateTerms[0]!.rate).toBe("25.50");
    expect(data.totals.map((t) => t.currency)).toEqual(["EUR", "GBP"]);
  });

  it("an outsider / anonymous caller gets nothing: an unreadable project is not_found", async () => {
    tables.projects = { data: null };
    const res = await cap("project_invoice.overview_get").run(makeCaller(), { projectId: P });
    expect(res).toMatchObject({ ok: false, code: "not_found" });
    expect(reads.invoicing).not.toHaveBeenCalled();
  });

  it("explain says WHY each row is held back: not confirmed, disputed, unpriced, already invoiced", async () => {
    tables.billing_periods = { data: { id: PERIOD, project_id: P, organization_id: ORG, status: "open", period_start: "2026-10-01", period_end: "2026-10-31" } };
    const row = (eligibility: string, termId: string | null, entryId = E1) => ({ entryId, workDay: "2026-10-02", sourceKey: `k-${eligibility}`, kind: "hours", unit: "hours", hours: 8, quantity: null, eligibility, evidenceClass: "internal_confirmed", photoCount: 0, termId });
    reads.preview.mockResolvedValueOnce({
      kind: "ok",
      value: [row("billable", "t1"), row("billable", null, E2), row("not_confirmed", null), row("client_disputed", "t1"), row("billed", "t1")],
    });
    const res = (await run("project_invoice.billable_explain", { periodId: PERIOD })) as { ok: true; data: Record<string, { rows: unknown[]; reason: string }> };
    expect(res.ok).toBe(true);
    expect(res.data.billable!.rows).toHaveLength(1);
    expect(res.data.unpriced!.rows).toHaveLength(1);
    expect(res.data.notConfirmed!.rows).toHaveLength(1);
    expect(res.data.clientDisputed!.reason).toMatch(/cannot override/);
    expect(res.data.alreadyInvoiced!.rows).toHaveLength(1);
    expect(JSON.stringify(res)).toMatch(/outside the period/i);
  });
});

function viewOf(over: Partial<View["header"]> = {}, lines: Record<string, unknown>[] = []): { kind: "ok"; value: View } {
  return {
    kind: "ok",
    value: {
      header: { id: INV, projectId: P, kind: "invoice", status: "issued", currency: "EUR", invoiceNumber: "INV-0001", creditedAt: null, ...over },
      lines,
      sources: [],
      sourcesVisible: true,
      chain: [],
    },
  };
}
const line = { id: LINE, lineNo: 1, quantity: 10, netCents: 10000, currency: "EUR" };

describe("correction is prepared, never created", () => {
  it("shows what would be credited and creates nothing", async () => {
    reads.view.mockResolvedValueOnce(viewOf({}, [line]));
    tables.finance_record_lines = { data: [{ credits_line_id: LINE, quantity: 4, net_cents: 4000 }] };
    const res = (await run("project_invoice.correction_prepare", { invoiceId: INV, reason: "wrong quantity" })) as { ok: true; data: { created: boolean; lines: { remainingBefore: { quantity: number } }[] } };
    expect(res.ok).toBe(true);
    expect(res.data.created).toBe(false);
    expect(res.data.lines[0]!.remainingBefore.quantity).toBe(6);
    expect(rpcCalls).toEqual([]);
  });

  it("refuses an over-credit with the remaining amount", async () => {
    reads.view.mockResolvedValueOnce(viewOf({}, [line]));
    tables.finance_record_lines = { data: [{ credits_line_id: LINE, quantity: 4, net_cents: 4000 }] };
    const res = await run("project_invoice.correction_prepare", { invoiceId: INV, lines: [{ lineId: LINE, quantity: 7 }] });
    expect(res).toMatchObject({ ok: false, code: "over_credit" });
  });

  it("a plain project manager (invoice not visible) gets a refusal", async () => {
    reads.view.mockResolvedValueOnce({ kind: "ok", value: null });
    const res = await run("project_invoice.correction_prepare", { invoiceId: INV });
    expect(res).toMatchObject({ ok: false, code: "not_found" });
    expect(rpcCalls).toEqual([]);
  });

  it("a draft or a credit note is not correctable", async () => {
    reads.view.mockResolvedValueOnce(viewOf({ status: "draft" }, [line]));
    expect(await run("project_invoice.correction_prepare", { invoiceId: INV })).toMatchObject({ ok: false, code: "invalid" });
    reads.view.mockResolvedValueOnce(viewOf({ kind: "credit_note" }, [line]));
    expect(await run("project_invoice.correction_prepare", { invoiceId: INV })).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("invoice_get names the explicit action and never performs it", () => {
  it("a draft lists what is missing and the link; no RPC is called", async () => {
    reads.view.mockResolvedValueOnce(viewOf({ status: "draft", recipient: null }, [{ ...line, taxTreatment: null, evidenceClass: "internal_confirmed", basisType: "hours" }]));
    const res = (await run("project_invoice.invoice_get", { invoiceId: INV })) as { ok: true; data: { missingBeforeIssue: string[]; explicitActions: { issue: { requires: string } } } };
    expect(res.data.missingBeforeIssue.join(" ")).toMatch(/tax treatment missing/);
    expect(res.data.missingBeforeIssue.join(" ")).toMatch(/explicit tax confirmation/);
    expect(res.data.explicitActions.issue.requires).toMatch(/explicit tax confirmation/);
    expect(rpcCalls).toEqual([]);
  });
});

describe("draft -> confirm for an invoice DRAFT from explicit selection", () => {
  const selection = [{ entryId: E1, sourceKey: "k-billable" }];
  const periodRow = { id: PERIOD, project_id: P, organization_id: ORG, status: "open", period_start: "2026-10-01", period_end: "2026-10-31" };
  const preview = (eligibility: string, termId: string | null) => ({
    kind: "ok",
    value: [{ entryId: E1, workDay: "2026-10-02", sourceKey: "k-billable", kind: "hours", unit: "hours", hours: 8, quantity: null, eligibility, evidenceClass: "internal_confirmed", photoCount: 0, termId }],
  });

  it("refuses disputed / unconfirmed / unpriced rows honestly and writes nothing", async () => {
    tables.billing_periods = { data: periodRow };
    for (const [eligibility, termId] of [["client_disputed", "t1"], ["not_confirmed", null], ["billable", null]] as const) {
      reads.preview.mockResolvedValueOnce(preview(eligibility, termId));
      const res = await run("project_invoice.draft_create_draft", { periodId: PERIOD, selection });
      expect(res).toMatchObject({ ok: false, code: "selection_not_billable" });
    }
    expect(rpcCalls).toEqual([]);
  });

  it("a locked period is refused before any token is minted", async () => {
    tables.billing_periods = { data: { ...periodRow, status: "invoiced" } };
    expect(await run("project_invoice.draft_create_draft", { periodId: PERIOD, selection })).toMatchObject({ ok: false, code: "conflict" });
  });

  it("the draft step writes nothing; the confirm needs the token and then calls the same RPC with the EXPLICIT selection", async () => {
    tables.billing_periods = { data: periodRow };
    tables.finance_records = { count: 0 };
    reads.preview.mockResolvedValue(preview("billable", "t1"));
    const drafted = (await run("project_invoice.draft_create_draft", { periodId: PERIOD, selection })) as { ok: true; data: { confirmationToken: string } };
    expect(drafted.ok).toBe(true);
    expect(rpcCalls).toEqual([]);

    const bad = await run("project_invoice.draft_create_confirm", { periodId: PERIOD, selection, confirmationToken: "x".repeat(40) });
    expect(bad).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(rpcCalls).toEqual([]);

    rpcResults.create_invoice_draft_from_period_v1 = { status: "created", invoice_id: INV };
    const done = (await run("project_invoice.draft_create_confirm", { periodId: PERIOD, selection, confirmationToken: drafted.data.confirmationToken })) as { ok: true; data: { status: string; invoiceId: string } };
    expect(done).toMatchObject({ ok: true, data: { status: "created", invoiceId: INV } });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]!.args.p_selection).toEqual([{ entry_id: E1, source_key: "k-billable" }]);
    reads.preview.mockReset();
  });

  it("a replayed token is rejected once the state moved", async () => {
    tables.billing_periods = { data: periodRow };
    tables.finance_records = { count: 0 };
    reads.preview.mockResolvedValue(preview("billable", "t1"));
    const drafted = (await run("project_invoice.draft_create_draft", { periodId: PERIOD, selection })) as { ok: true; data: { confirmationToken: string } };
    tables.finance_records = { count: 1 }; // someone created an invoice in between
    const res = await run("project_invoice.draft_create_confirm", { periodId: PERIOD, selection, confirmationToken: drafted.data.confirmationToken });
    expect(res).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(rpcCalls).toEqual([]);
  });

  it("a plain project manager: the database refusal surfaces as a refusal, never a silent success", async () => {
    tables.billing_periods = { data: periodRow };
    tables.finance_records = { count: 0 };
    reads.preview.mockResolvedValue(preview("billable", "t1"));
    const drafted = (await run("project_invoice.draft_create_draft", { periodId: PERIOD, selection })) as { ok: true; data: { confirmationToken: string } };
    rpcResults.create_invoice_draft_from_period_v1 = { status: "not_found" };
    const res = await run("project_invoice.draft_create_confirm", { periodId: PERIOD, selection, confirmationToken: drafted.data.confirmationToken });
    expect(res).toMatchObject({ ok: false, code: "not_found" });
    rpcResults.create_invoice_draft_from_period_v1 = { status: "not_allowed" };
    expect(await run("project_invoice.draft_create_confirm", { periodId: PERIOD, selection, confirmationToken: drafted.data.confirmationToken })).toMatchObject({ ok: false, code: "not_authorized" });
  });

  it("an empty selection is not accepted: selection is always explicit", () => {
    expect(() => cap("project_invoice.draft_create_draft").inputSchema.parse({ periodId: PERIOD, selection: [] })).toThrow();
  });
});

describe("tax treatment on a draft (not tax confirmation)", () => {
  it("refuses an invalid treatment/rate combination and never sends a confirmation flag", async () => {
    reads.view.mockResolvedValue(viewOf({ status: "draft" }, [{ ...line, taxTreatment: null }]));
    const bad = await run("project_invoice.draft_tax_set_draft", { invoiceId: INV, treatment: "standard" });
    expect(bad).toMatchObject({ ok: false, code: "invalid" });
    const ok = (await run("project_invoice.draft_tax_set_draft", { invoiceId: INV, lineId: LINE, treatment: "standard", ratePercent: 21 })) as { ok: true; data: { confirmationToken: string } };
    expect(ok.ok).toBe(true);
    rpcResults.set_invoice_line_tax_v1 = { status: "updated" };
    const done = await run("project_invoice.draft_tax_set_confirm", { invoiceId: INV, lineId: LINE, treatment: "standard", ratePercent: 21, confirmationToken: ok.data.confirmationToken });
    expect(done.ok).toBe(true);
    expect(rpcCalls.map((c) => c.name)).toEqual(["set_invoice_line_tax_v1"]);
    expect(JSON.stringify(rpcCalls)).not.toMatch(/tax_confirmed/);
    reads.view.mockReset();
  });

  it("an issued invoice is immutable: editing it is refused at the draft step", async () => {
    reads.view.mockResolvedValue(viewOf({ status: "issued" }, [line]));
    expect(await run("project_invoice.draft_tax_set_draft", { invoiceId: INV, treatment: "exempt" })).toMatchObject({ ok: false, code: "conflict" });
    reads.view.mockReset();
  });
});
