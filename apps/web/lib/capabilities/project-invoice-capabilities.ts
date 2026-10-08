import "server-only";

import { z } from "zod";

import { isMigrationMissingCode } from "@/lib/finance/finance-model";
import { isKnownCurrency, minorToDecimalString, parseMajorToMinor } from "@/lib/finance/invoice-currency";
import { TAX_TREATMENTS, isTaxTreatment, validateTax } from "@/lib/finance/invoice-tax-model";
import {
  getInvoiceView,
  getPeriodChanges,
  getPeriodPreview,
  getProjectInvoicing,
  countUnattributedEntries,
} from "@/lib/finance/project-invoice";
import {
  BASIS_TYPES,
  parseSelectionKeys,
  selectionKey,
  summarizePreview,
  type InvoiceLine,
  type PeriodPreviewRow,
} from "@/lib/finance/project-invoice-model";
import type { ExecResult } from "@/lib/conversation/executor-contract";

import { mintCapabilityConfirmation, verifyCapabilityConfirmation } from "./confirmable";
import type { CapabilityCaller, CapabilityDescriptor } from "./contract";

/**
 * PROJECT INVOICING - the assistant / MCP door for the project-to-invoice lifecycle
 * (PR #2203). NOT a second implementation and NOT a second authority.
 *
 *  - Every call runs on the CALLER'S OWN RLS-scoped client (`caller.supabase`): no service role, no
 *    new SECURITY DEFINER path. The reads are the SAME readers the invoicing pages use
 *    (`lib/finance/project-invoice`), which accept the caller's client; the writes call the SAME
 *    RPCs the web actions call (`lib/finance/project-invoice-actions`) with the same validators.
 *    The database decides authority; a refusal is surfaced as an honest message, never a success.
 *  - Writes are draft -> confirm (the capability write contract): a draft changes nothing, previews
 *    and mints a one-time token bound to the CURRENT state; only the confirm writes.
 *  - THE ASSISTANT NEVER ISSUES. This module cannot reach `issue_invoice_v1`, the tax confirmation
 *    flag, `correct_invoice_v1`, discard or series configuration: those remain explicit actions of
 *    the authorized owner/admin in the app. The reads return the link to that explicit action.
 *    Pinned by lib/guards/project-invoice-ai-door-v1.test.ts.
 *  - The assistant cannot bypass disputed-work exclusion, period locks, correction limits, recipient
 *    requirements or tax confirmation: those live in the RPCs it calls (or it never calls them).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: CapabilityCaller["supabase"]): any {
  return c;
}

const readAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const confirmAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const Id = z.string().uuid();
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

const fail = (code: string, message: string): ExecResult => ({ ok: false, code, message });
const money = (minor: number | null, currency: string): string | null =>
  minor == null || !isKnownCurrency(currency) ? null : minorToDecimalString(minor, currency);
const page = (projectId: string, invoiceId?: string | null) =>
  `/dashboard/projects/${projectId}/invoicing${invoiceId ? `/${invoiceId}` : ""}`;

// ── the database's own statuses, said honestly ────────────────────────────────────────────────────

const STATUS: Record<string, [string, string]> = {
  not_found: ["not_found", "The database found nothing the caller may act on (no such record, or the caller lacks the issuer's authority). Nothing changed."],
  not_allowed: ["not_authorized", "The caller does not have the authority this action requires. Nothing changed."],
  invalid: ["invalid", "The database refused the values as invalid. Nothing changed."],
  invalid_tax: ["invalid", "That tax treatment/rate combination is invalid. Nothing changed."],
  overlapping_term: ["conflict", "An agreed basis of the same kind and unit already overlaps those dates. Nothing changed."],
  overlapping_period: ["conflict", "A billing period already overlaps those dates. Nothing changed."],
  period_locked: ["conflict", "That billing period is already invoiced and locked. A locked period is never reopened. Nothing changed."],
  already_has_invoice: ["conflict", "That period already has a live invoice. Nothing changed."],
  nothing_billable: ["conflict", "There is nothing billable in that period/selection. Nothing changed."],
  ambiguous_rate_terms: ["conflict", "More than one agreed basis applies to the same work; end or correct one first. Nothing changed."],
  mixed_currency: ["conflict", "An invoice has exactly one currency; the basis is in another. Nothing changed."],
  selection_not_billable: ["conflict", "Some selected work rows are not billable (not confirmed, disputed, unpriced or already invoiced). Nothing changed."],
  time_basis_conflict: ["conflict", "The same work cannot be billed in two time bases. Nothing changed."],
  evidence_changed: ["conflict", "The evidence changed since the draft was prepared. Prepare again. Nothing changed."],
  not_draft: ["conflict", "Only a draft can be edited; an issued invoice is immutable. Nothing changed."],
  invalid_term: ["invalid", "That agreed basis cannot be added as a line (only milestone/fixed bases, same project). Nothing changed."],
  already_billed: ["conflict", "That fixed/milestone basis is already billed on another live invoice. Nothing changed."],
  invalid_client_org: ["invalid", "That linked organization is not valid. Nothing changed."],
  recipient_not_found: ["not_found", "No such recipient in the issuer's contact book. Nothing changed."],
  limit_reached: ["conflict", "A limit was reached. Nothing changed."],
  project_has_no_organization: ["conflict", "The project belongs to no organization, so there is no issuer. Nothing changed."],
  needs_migration: ["needs_migration", "Invoicing is not enabled on this environment yet. Nothing changed."],
};

function refusalFor(status: string): ExecResult {
  const [code, message] = STATUS[status] ?? ["refused", `The database refused: ${status.replace(/[^a-z_]/g, "").slice(0, 48) || "error"}. Nothing changed.`];
  return fail(code, message);
}

type RpcOut = { status: string; data: Record<string, unknown> };

async function callRpc(caller: CapabilityCaller, name: string, args: Record<string, unknown>): Promise<RpcOut> {
  const r = (await asAny(caller.supabase).rpc(name, args)) as {
    data: unknown;
    error: { code?: string } | null;
  };
  if (r.error) {
    return {
      status: isMigrationMissingCode(r.error.code) || r.error.code === "PGRST202" ? "needs_migration" : "error",
      data: {},
    };
  }
  const d = r.data as { status?: unknown } | string | null;
  const status = typeof d === "string" ? d : typeof d?.status === "string" ? d.status : "error";
  return { status, data: r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {} };
}

// ── small RLS-scoped lookups ──────────────────────────────────────────────────────────────────────

type ProjectRef = { id: string; title: string | null; organizationId: string | null };

async function readProject(caller: CapabilityCaller, projectId: string): Promise<ProjectRef | ExecResult> {
  const { data, error } = await asAny(caller.supabase).from("projects").select("id, title, organization_id").eq("id", projectId).maybeSingle();
  if (error) return fail("unavailable", "The project read failed.");
  if (!data) return fail("not_found", "No such project the caller can see.");
  const row = data as { id: string; title: string | null; organization_id: string | null };
  return { id: row.id, title: row.title, organizationId: row.organization_id };
}

const isRef = (v: ProjectRef | ExecResult): v is ProjectRef => "id" in v;

async function countRows(
  caller: CapabilityCaller,
  table: string,
  col: string,
  value: string,
): Promise<number | null> {
  const r = await asAny(caller.supabase).from(table).select("id", { count: "exact", head: true }).eq(col, value);
  if (r.error) return null;
  return typeof r.count === "number" ? r.count : 0;
}

type PeriodRef = { id: string; projectId: string; organizationId: string; status: string; start: string; end: string };

async function readPeriod(caller: CapabilityCaller, periodId: string): Promise<PeriodRef | ExecResult> {
  const { data, error } = await asAny(caller.supabase)
    .from("billing_periods")
    .select("id, project_id, organization_id, status, period_start, period_end")
    .eq("id", periodId)
    .maybeSingle();
  if (error) return fail("unavailable", "The billing period read failed.");
  if (!data) return fail("not_found", "No such billing period the caller can see.");
  const r = data as Record<string, string>;
  return { id: r.id!, projectId: r.project_id!, organizationId: r.organization_id!, status: r.status!, start: r.period_start!, end: r.period_end! };
}
const isPeriod = (v: PeriodRef | ExecResult): v is PeriodRef => "projectId" in v;

// ── READS ─────────────────────────────────────────────────────────────────────────────────────────

const overviewInput = z.object({ projectId: Id }).strict();

const projectInvoiceOverview: CapabilityDescriptor = {
  id: "project_invoice.overview_get",
  kind: "read",
  title: "Project invoicing state",
  description:
    "The invoicing state of ONE project as the caller may see it (row-level security decides): agreed commercial basis (rate terms), billing periods, " +
    "draft and issued invoices and credit notes with totals per currency (never added across currencies), the issuer's recipients and numbering series. " +
    "A plain project manager sees the agreed basis and periods but no invoices (invoices are the issuer's finance data). Nothing is written; this tool never issues anything.",
  exposed: true,
  annotations: readAnnotations,
  inputSchema: overviewInput,
  run: async (caller, input): Promise<ExecResult> => {
    const { projectId } = overviewInput.parse(input);
    const project = await readProject(caller, projectId);
    if (!isRef(project)) return project;
    const read = await getProjectInvoicing(projectId, project.organizationId, caller.supabase);
    if (read.kind === "needs-migration") return fail("needs_migration", "Invoicing is not enabled on this environment yet.");
    if (read.kind === "error") return fail("unavailable", "The invoicing records could not be read.");
    const v = read.value;
    const unattributed = project.organizationId ? await countUnattributedEntries(project.organizationId, caller.supabase) : null;
    return {
      ok: true,
      data: {
        project: { id: project.id, title: project.title },
        issuerOrganizationId: project.organizationId,
        rateTerms: v.rateTerms.map((t) => ({
          id: t.id,
          basis: t.basisType,
          unit: t.unit,
          rate: money(t.rateCents, t.currency),
          currency: t.currency,
          label: t.label,
          roleLabel: t.roleLabel,
          validFrom: t.validFrom,
          validTo: t.validTo,
        })),
        periods: v.periods.map((p) => ({ id: p.id, start: p.periodStart, end: p.periodEnd, status: p.status, locked: p.lockedAt != null })),
        invoices: v.invoices.map((i) => ({
          id: i.id,
          kind: i.kind,
          number: i.invoiceNumber,
          status: i.status,
          currency: i.currency,
          net: money(i.netTotalCents, i.currency),
          tax: money(i.taxTotalCents, i.currency),
          gross: money(i.grossTotalCents, i.currency),
          periodId: i.billingPeriodId,
          issuedAt: i.issuedAt,
          replacesId: i.replacesId,
          credited: i.creditedAt != null,
          recipient: i.recipient?.legalName ?? null,
        })),
        totals: v.totals.map((t) => ({
          currency: t.currency,
          kind: t.kind,
          documents: t.documents,
          net: money(t.netCents, t.currency),
          tax: money(t.taxCents, t.currency),
          gross: money(t.grossCents, t.currency),
        })),
        recipients: v.recipients.map((r) => ({ id: r.id, legalName: r.legalName, country: r.country, hasAddress: Boolean(r.address) })),
        series: v.series,
        workReportsWithoutProject: unattributed,
        note: "Money is in the currency's own minor-unit precision; totals are per currency. LabourMarket records and calculates the invoice; it does not process payment.",
        destination: page(projectId),
      },
    };
  },
};

const invoiceInput = z.object({ invoiceId: Id }).strict();

function lineView(l: InvoiceLine) {
  return {
    id: l.id,
    lineNo: l.lineNo,
    basis: l.basisType,
    description: l.description,
    unit: l.unit,
    quantity: l.quantity,
    unitPrice: money(l.unitPriceCents, l.currency),
    net: money(l.netCents, l.currency),
    taxTreatment: l.taxTreatment,
    taxRatePercent: l.taxRatePercent,
    tax: money(l.taxCents, l.currency),
    gross: money(l.grossCents, l.currency),
    evidence: l.evidenceClass,
    creditsLineId: l.creditsLineId,
  };
}

const projectInvoiceGet: CapabilityDescriptor = {
  id: "project_invoice.invoice_get",
  kind: "read",
  title: "One project invoice or credit note",
  description:
    "One invoice or credit note the caller may see: header, lines with tax treatment, a summary of the work evidence behind it, the correction chain, " +
    "and what is still missing before it could be issued. Issuing and tax confirmation are explicit actions of the authorized owner/admin in the app " +
    "(the response names the link); this tool never performs them.",
  exposed: true,
  annotations: readAnnotations,
  inputSchema: invoiceInput,
  run: async (caller, input): Promise<ExecResult> => {
    const { invoiceId } = invoiceInput.parse(input);
    const read = await getInvoiceView(invoiceId, caller.supabase);
    if (read.kind === "needs-migration") return fail("needs_migration", "Invoicing is not enabled on this environment yet.");
    if (read.kind === "error") return fail("unavailable", "The invoice could not be read.");
    if (!read.value) return fail("not_found", "No such invoice the caller can see.");
    const { header, lines, sources, sourcesVisible, chain } = read.value;
    const missing: string[] = [];
    if (header.status === "draft") {
      if (lines.length === 0) missing.push("no lines");
      if (lines.some((l) => !l.taxTreatment)) missing.push("tax treatment missing on at least one line");
      if (!header.recipient) missing.push("no recipient attached");
      missing.push("explicit tax confirmation by the authorized owner/admin at issue time");
    }
    return {
      ok: true,
      data: {
        invoice: {
          id: header.id,
          kind: header.kind,
          number: header.invoiceNumber,
          status: header.status,
          currency: header.currency,
          net: money(header.netTotalCents, header.currency),
          tax: money(header.taxTotalCents, header.currency),
          gross: money(header.grossTotalCents, header.currency),
          issuedAt: header.issuedAt,
          dueDate: header.dueDate,
          periodId: header.billingPeriodId,
          recipient: header.recipient,
          correctionReason: header.correctionReason,
          creditedAt: header.creditedAt,
        },
        lines: lines.map(lineView),
        evidence: sourcesVisible
          ? {
              rows: sources.length,
              hours: Math.round(sources.reduce((a, s) => a + (s.hours ?? 0), 0) * 100) / 100,
              clientAccepted: sources.filter((s) => s.evidenceClass === "client_accepted").length,
              internalConfirmed: sources.filter((s) => s.evidenceClass === "internal_confirmed").length,
            }
          : { visible: false },
        correctionChain: chain.map((c) => ({ id: c.id, kind: c.kind, number: c.number, status: c.status, gross: money(c.grossCents, c.currency), reason: c.reason })),
        missingBeforeIssue: header.status === "draft" ? missing : [],
        explicitActions: header.projectId
          ? {
              openInvoice: page(header.projectId, header.id),
              issue:
                header.status === "draft"
                  ? { where: page(header.projectId, header.id), who: "organization owner/admin", requires: "explicit tax confirmation in the app" }
                  : null,
            }
          : null,
      },
    };
  },
};

const explainInput = z.object({ periodId: Id }).strict();

const REASONS = {
  billable: "Confirmed work with an agreed basis in force for its day: it can be selected for an invoice draft.",
  unpriced: "Confirmed work, but no agreed rate term covers its day or unit, so it cannot be priced. Add or correct the agreed basis first.",
  not_confirmed: "Not yet confirmed (or confirmation was withdrawn). Only confirmed work is billable.",
  client_disputed: "The client side disputed or asked for a correction. Disputed work is held back and the issuer cannot override that.",
  billed: "Already on a live invoice (or locked in an invoiced period).",
} as const;

const projectInvoiceExplain: CapabilityDescriptor = {
  id: "project_invoice.billable_explain",
  kind: "read",
  title: "What is billable in a period, and why the rest is not",
  description:
    "For ONE billing period the caller may read: the work rows that can be billed and the rows held back, each with the reason (not confirmed, disputed, unpriced, " +
    "already invoiced), plus - for a locked period - what changed since it was invoiced. Billable rows carry a selectionKey for project_invoice.draft_create_draft. " +
    "Work outside the period's dates is not part of it; work that names no project cannot reach any invoice. Nothing is written.",
  exposed: true,
  annotations: readAnnotations,
  inputSchema: explainInput,
  run: async (caller, input): Promise<ExecResult> => {
    const { periodId } = explainInput.parse(input);
    const period = await readPeriod(caller, periodId);
    if (!isPeriod(period)) return period;
    const preview = await getPeriodPreview(periodId, caller.supabase);
    if (preview.kind === "needs-migration") return fail("needs_migration", "Invoicing is not enabled on this environment yet.");
    if (preview.kind === "error") return fail("unavailable", "The period evidence could not be read.");
    const rows = preview.value;
    const summary = summarizePreview(rows);
    const group = (pred: (r: PeriodPreviewRow) => boolean) =>
      rows
        .filter(pred)
        .slice(0, 100)
        .map((r) => ({
          workDay: r.workDay,
          unit: r.unit,
          hours: r.hours,
          quantity: r.quantity,
          evidence: r.evidenceClass,
          selectionKey: selectionKey(r),
        }));
    const changes = period.status === "invoiced" ? await getPeriodChanges(periodId, caller.supabase) : null;
    const unattributed = await countUnattributedEntries(period.organizationId, caller.supabase);
    return {
      ok: true,
      data: {
        period: { id: period.id, start: period.start, end: period.end, status: period.status, locked: period.status === "invoiced" },
        summary,
        billable: { reason: REASONS.billable, rows: group((r) => r.eligibility === "billable" && Boolean(r.termId)) },
        unpriced: { reason: REASONS.unpriced, rows: group((r) => r.eligibility === "billable" && !r.termId) },
        notConfirmed: { reason: REASONS.not_confirmed, rows: group((r) => r.eligibility === "not_confirmed") },
        clientDisputed: { reason: REASONS.client_disputed, rows: group((r) => r.eligibility === "client_disputed") },
        alreadyInvoiced: { reason: REASONS.billed, rows: group((r) => r.eligibility === "billed") },
        outsideThePeriod: "Work days outside the period's dates are not part of this period; create another period for them.",
        lockedPeriodChanges: changes && changes.kind === "ok" ? changes.value.map((c) => ({ kind: c.kind, workDay: c.workDay })) : null,
        workReportsWithoutProject: unattributed,
        destination: page(period.projectId),
      },
    };
  },
};

// ── CORRECTION: prepared here, performed by the issuer in the app ─────────────────────────────────

const correctionInput = z
  .object({
    invoiceId: Id,
    reason: z.string().trim().min(1).max(500).optional(),
    lines: z
      .array(z.object({ lineId: Id, quantity: z.number().positive().optional(), netCents: z.number().int().positive().optional() }).strict())
      .max(500)
      .optional(),
  })
  .strict();

const projectInvoiceCorrectionPrepare: CapabilityDescriptor = {
  id: "project_invoice.correction_prepare",
  kind: "read",
  title: "Prepare a correction of an issued invoice (creates nothing)",
  description:
    "Computes what a correction (credit note) of an issued invoice would credit - the whole remainder, or the given lines - against what has already been credited, " +
    "and refuses an over-credit with the remaining amounts. NO credit note is created and nothing is numbered: the correction is an explicit action of the " +
    "authorized issuer in the app, and the response names the link. A caller who may not see the invoice (a plain project manager) gets a refusal.",
  exposed: true,
  annotations: readAnnotations,
  inputSchema: correctionInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = correctionInput.parse(input);
    const read = await getInvoiceView(parsed.invoiceId, caller.supabase);
    if (read.kind === "needs-migration") return fail("needs_migration", "Invoicing is not enabled on this environment yet.");
    if (read.kind === "error") return fail("unavailable", "The invoice could not be read.");
    if (!read.value) return fail("not_found", "No such invoice the caller can see. Corrections are the issuer's: a project manager without the issuer's authority cannot prepare one.");
    const { header, lines } = read.value;
    if (header.kind !== "invoice") return fail("invalid", "Only an issued invoice can be corrected, not a credit note.");
    if (header.status !== "issued" && header.status !== "paid" && header.status !== "partially_paid") {
      return fail("invalid", "Only an ISSUED invoice can be corrected. A draft is edited or discarded, not credited.");
    }
    if (header.creditedAt) return fail("conflict", "This invoice is already fully credited.");

    // what earlier credit notes of this invoice already took, per original line (cumulative limit)
    const ids = lines.map((l) => l.id);
    const credited = new Map<string, { quantity: number; netCents: number }>();
    if (ids.length) {
      const cr = await asAny(caller.supabase).from("finance_record_lines").select("credits_line_id, quantity, net_cents").in("credits_line_id", ids).limit(2000);
      if (cr.error) return fail("unavailable", "The earlier credit lines could not be read.");
      for (const r of (cr.data ?? []) as { credits_line_id: string; quantity: number | string; net_cents: number | string }[]) {
        const cur = credited.get(r.credits_line_id) ?? { quantity: 0, netCents: 0 };
        cur.quantity += Math.abs(Number(r.quantity));
        cur.netCents += Math.abs(Number(r.net_cents));
        credited.set(r.credits_line_id, cur);
      }
    }
    const remaining = (l: InvoiceLine) => {
      const c = credited.get(l.id) ?? { quantity: 0, netCents: 0 };
      return { quantity: Math.max(0, l.quantity - c.quantity), netCents: Math.max(0, l.netCents - c.netCents) };
    };
    const byId = new Map(lines.map((l) => [l.id, l] as const));
    const plan = parsed.lines
      ? parsed.lines.map((p) => ({ line: byId.get(p.lineId) ?? null, ask: p }))
      : lines.map((l) => ({ line: l, ask: { lineId: l.id } as { lineId: string; quantity?: number; netCents?: number } }));
    const out: Record<string, unknown>[] = [];
    for (const { line, ask } of plan) {
      if (!line) return fail("invalid_line", "A requested line does not belong to this invoice.");
      const rem = remaining(line);
      if ((ask.quantity ?? 0) > rem.quantity + 1e-9 || (ask.netCents ?? 0) > rem.netCents) {
        return {
          ok: false,
          code: "over_credit",
          message: `Over-credit: line ${line.lineNo} has only ${rem.quantity} units / ${money(rem.netCents, line.currency)} left to credit. Nothing was prepared.`,
        };
      }
      if (rem.netCents === 0 && rem.quantity === 0) continue;
      out.push({
        lineId: line.id,
        lineNo: line.lineNo,
        wouldCredit: { quantity: ask.quantity ?? rem.quantity, net: money(ask.netCents ?? rem.netCents, line.currency) },
        remainingBefore: { quantity: rem.quantity, net: money(rem.netCents, line.currency) },
      });
    }
    if (out.length === 0) return fail("conflict", "Nothing is left to credit on this invoice.");
    return {
      ok: true,
      data: {
        prepared: true,
        created: false,
        invoice: { id: header.id, number: header.invoiceNumber, currency: header.currency },
        reason: parsed.reason ?? null,
        mode: parsed.lines ? "partial" : "full remainder",
        lines: out,
        explicitAction: {
          where: header.projectId ? page(header.projectId, header.id) : null,
          who: "the authorized issuer (organization owner/admin)",
          note: "No credit note exists yet. The issuer creates it in the app; the database re-checks authority and the cumulative credit limit there.",
        },
      },
    };
  },
};

// ── WRITES: draft -> confirm over the SAME RPCs the web actions call ──────────────────────────────

type Prepared = {
  readonly projectId: string;
  /** NORMALIZED input both sides of the token hash (null-vs-absent decided). */
  readonly normalized: Record<string, unknown>;
  /** The state the token binds to; a change in between invalidates a replayed token. */
  readonly state: string;
  readonly preview: Record<string, unknown>;
  readonly destination: string;
};

type WriteSpec<S extends z.ZodType<Record<string, unknown>>> = {
  readonly key: string;
  readonly title: string;
  readonly summary: string;
  readonly schema: S;
  readonly prepare: (caller: CapabilityCaller, input: z.infer<S>) => Promise<Prepared | ExecResult>;
  readonly execute: (caller: CapabilityCaller, input: z.infer<S>) => Promise<RpcOut>;
  readonly okStatus: string;
  readonly readback: (out: RpcOut) => Record<string, unknown>;
};

const isPrepared = (v: Prepared | ExecResult): v is Prepared => "normalized" in v;
const rejected = (reason: string) => fail("confirmation_rejected", `Confirmation token rejected (${reason}). Draft again.`);

function makeWritePair<S extends z.ZodType<Record<string, unknown>>>(spec: WriteSpec<S>): [CapabilityDescriptor, CapabilityDescriptor] {
  const draftId = `project_invoice.${spec.key}_draft`;
  const confirmId = `project_invoice.${spec.key}_confirm`;
  const confirmSchema = (spec.schema as unknown as z.ZodObject<z.ZodRawShape>).extend({ confirmationToken: z.string().min(10) }).strict();
  const draft: CapabilityDescriptor = {
    id: draftId,
    kind: "draft",
    title: `Draft: ${spec.title}`,
    description:
      `${spec.summary} Checks the values with the same validation as the web page, shows exactly what would be written and returns a one-time token bound to the CURRENT state. ` +
      "NOTHING is written. The database still decides authority at confirm; this never issues an invoice or confirms tax.",
    exposed: true,
    annotations: readAnnotations,
    inputSchema: spec.schema,
    run: async (caller, input): Promise<ExecResult> => {
      const parsed = spec.schema.parse(input);
      const p = await spec.prepare(caller, parsed);
      if (!isPrepared(p)) return p;
      const token = mintCapabilityConfirmation({
        actionId: confirmId,
        input: p.normalized,
        userId: caller.userId,
        stateFingerprint: `${spec.key}:${p.state}`,
      });
      return {
        ok: true,
        data: {
          preview: p.preview,
          confirmationToken: token,
          note: `Nothing was written. Confirming requires ${confirmId} with this exact input and token.`,
          destination: p.destination,
        },
      };
    },
  };
  const confirm: CapabilityDescriptor = {
    id: confirmId,
    kind: "confirm",
    title: `Confirm: ${spec.title}`,
    description:
      `Verifies the token against the exact input, the caller and the CURRENT state, then calls the same database command the web page calls (${spec.key.replace(/_/g, " ")}) as the caller. ` +
      "A refusal by the database is returned as a refusal, never as success.",
    exposed: true,
    annotations: confirmAnnotations,
    inputSchema: confirmSchema,
    run: async (caller, input): Promise<ExecResult> => {
      const { confirmationToken, ...rest } = confirmSchema.parse(input);
      const parsed = spec.schema.parse(rest);
      const p = await spec.prepare(caller, parsed);
      if (!isPrepared(p)) return p;
      const verdict = verifyCapabilityConfirmation({
        actionId: confirmId,
        token: confirmationToken as string,
        input: p.normalized,
        userId: caller.userId,
        currentStateFingerprint: `${spec.key}:${p.state}`,
      });
      if (!verdict.ok) return rejected(verdict.reason);
      const out = await spec.execute(caller, parsed);
      if (out.status !== spec.okStatus) return refusalFor(out.status);
      return { ok: true, data: { status: spec.okStatus, ...spec.readback(out), destination: p.destination } };
    },
  };
  return [draft, confirm];
}

const optText = (max: number) => z.string().trim().max(max).optional();

// 1. agreed basis (rate term) -----------------------------------------------------------------------

const rateTermSchema = z
  .object({
    projectId: Id,
    basisType: z.enum(BASIS_TYPES),
    unit: optText(60),
    rate: z.string().trim().min(1).max(24),
    currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "ISO 4217 code, e.g. EUR."),
    label: optText(160),
    roleLabel: optText(120),
    validFrom: IsoDate,
    validTo: IsoDate.optional(),
    note: optText(1000),
  })
  .strict();

const rateTerm = makeWritePair({
  key: "rate_term_add",
  title: "add an agreed commercial basis (rate term)",
  summary: "Records one agreed rate (hours, quantity per unit, milestone or fixed) for a project and a currency.",
  schema: rateTermSchema,
  okStatus: "created",
  readback: (o) => ({ termId: typeof o.data.id === "string" ? o.data.id : null }),
  prepare: async (caller, i) => {
    const currency = i.currency.toUpperCase();
    if (!isKnownCurrency(currency)) return fail("invalid", "Currency must be an ISO 4217 code.");
    const minor = parseMajorToMinor(i.rate, currency);
    if (minor == null) return fail("invalid", `The rate is not a valid amount in ${currency}.`);
    if (i.validTo && i.validTo < i.validFrom) return fail("invalid", "validTo is before validFrom.");
    const project = await readProject(caller, i.projectId);
    if (!isRef(project)) return project;
    const n = await countRows(caller, "project_rate_terms", "project_id", i.projectId);
    if (n === null) return fail("unavailable", "The rate-term read failed.");
    return {
      projectId: i.projectId,
      normalized: { ...i, unit: i.unit ?? null, label: i.label ?? null, roleLabel: i.roleLabel ?? null, validTo: i.validTo ?? null, note: i.note ?? null },
      state: `${i.projectId}:${n}`,
      preview: { project: project.title, basis: i.basisType, unit: i.unit ?? null, rate: money(minor, currency), currency, validFrom: i.validFrom, validTo: i.validTo ?? null, change: "add one agreed basis; it is never edited, only ended" },
      destination: page(i.projectId),
    };
  },
  execute: async (caller, i) =>
    callRpc(caller, "add_project_rate_term_v1", {
      p_project_id: i.projectId,
      p_basis_type: i.basisType,
      p_unit: i.unit ?? null,
      p_rate_cents: parseMajorToMinor(i.rate, i.currency.toUpperCase()),
      p_currency: i.currency.toUpperCase(),
      p_label: i.label ?? null,
      p_role_label: i.roleLabel ?? null,
      p_valid_from: i.validFrom,
      p_valid_to: i.validTo ?? null,
      p_org_document_id: null,
      p_note: i.note ?? null,
      p_issuer_org: null,
    }),
});

// 2. billing period ---------------------------------------------------------------------------------

const periodSchema = z.object({ projectId: Id, periodStart: IsoDate, periodEnd: IsoDate }).strict();

const period = makeWritePair({
  key: "period_create",
  title: "open a billing period",
  summary: "Opens one billing period (at most 400 days, never overlapping another) for a project.",
  schema: periodSchema,
  okStatus: "created",
  readback: (o) => ({ periodId: typeof o.data.id === "string" ? o.data.id : null }),
  prepare: async (caller, i) => {
    if (i.periodEnd < i.periodStart) return fail("invalid", "periodEnd is before periodStart.");
    const project = await readProject(caller, i.projectId);
    if (!isRef(project)) return project;
    const n = await countRows(caller, "billing_periods", "project_id", i.projectId);
    if (n === null) return fail("unavailable", "The billing-period read failed.");
    return {
      projectId: i.projectId,
      normalized: { ...i },
      state: `${i.projectId}:${n}`,
      preview: { project: project.title, start: i.periodStart, end: i.periodEnd, change: "open a billing period; it locks only when an invoice is issued from it" },
      destination: page(i.projectId),
    };
  },
  execute: async (caller, i) =>
    callRpc(caller, "create_billing_period_v1", { p_project_id: i.projectId, p_start: i.periodStart, p_end: i.periodEnd, p_issuer_org: null }),
});

// 3. invoice DRAFT from explicitly selected billable work -------------------------------------------

const draftSchema = z
  .object({
    periodId: Id,
    selection: z.array(z.object({ entryId: Id, sourceKey: z.string().trim().min(1).max(200) }).strict()).min(1).max(2000),
    recipientId: Id.optional(),
    dueDate: IsoDate.optional(),
    note: optText(1000),
  })
  .strict();

const draftCreate = makeWritePair({
  key: "draft_create",
  title: "create an invoice DRAFT from selected billable work",
  summary:
    "Creates a DRAFT (not an issued invoice) from the work rows the caller EXPLICITLY lists (selectionKey values from project_invoice.billable_explain). " +
    "Rows that are not billable are refused here and again by the database.",
  schema: draftSchema,
  okStatus: "created",
  readback: (o) => ({ invoiceId: typeof o.data.invoice_id === "string" ? o.data.invoice_id : null }),
  prepare: async (caller, i) => {
    const p = await readPeriod(caller, i.periodId);
    if (!isPeriod(p)) return p;
    if (p.status === "invoiced") return fail("conflict", "That period is already invoiced and locked; a locked period is never reopened.");
    const preview = await getPeriodPreview(i.periodId, caller.supabase);
    if (preview.kind === "needs-migration") return fail("needs_migration", "Invoicing is not enabled on this environment yet.");
    if (preview.kind === "error") return fail("unavailable", "The period evidence could not be read.");
    const byKey = new Map(preview.value.map((r) => [selectionKey(r), r] as const));
    const held: { selectionKey: string; why: string }[] = [];
    for (const s of i.selection) {
      const k = `${s.entryId}|${s.sourceKey}`;
      const r = byKey.get(k);
      if (!r) held.push({ selectionKey: k, why: "not part of this period's evidence" });
      else if (r.eligibility !== "billable") held.push({ selectionKey: k, why: r.eligibility });
      else if (!r.termId) held.push({ selectionKey: k, why: "unpriced" });
    }
    if (held.length) {
      return { ok: false, code: "selection_not_billable", message: `${held.length} selected row(s) are not billable: ${JSON.stringify(held.slice(0, 20))}. Nothing was prepared.` };
    }
    const n = await countRows(caller, "finance_records", "billing_period_id", i.periodId);
    if (n === null) return fail("unavailable", "The invoice read failed.");
    return {
      projectId: p.projectId,
      normalized: { ...i, recipientId: i.recipientId ?? null, dueDate: i.dueDate ?? null, note: i.note ?? null },
      state: `${i.periodId}:${p.status}:${n}`,
      preview: {
        period: { id: p.id, start: p.start, end: p.end },
        rows: i.selection.length,
        change: "create a DRAFT invoice; nothing is issued, numbered or sent. Tax and recipient are completed on the draft and confirmed by the authorized owner/admin in the app.",
      },
      destination: page(p.projectId),
    };
  },
  execute: async (caller, i) =>
    callRpc(caller, "create_invoice_draft_from_period_v1", {
      p_period_id: i.periodId,
      p_customer_name: null,
      p_client_org_id: null,
      p_customer_vat_id: null,
      p_customer_address: null,
      p_due_date: i.dueDate ?? null,
      p_note: i.note ?? null,
      p_replaces_id: null,
      p_recipient_id: i.recipientId ?? null,
      p_selection: parseSelectionKeys(i.selection.map((s) => `${s.entryId}|${s.sourceKey}`)),
    }),
});

// 4. recipient (the issuer's contact book), optionally attached to a draft --------------------------

const recipientSchema = z
  .object({
    projectId: Id,
    legalName: z.string().trim().min(2).max(160),
    address: optText(400),
    country: z.string().trim().regex(/^[A-Za-z]{2}$/, "ISO 3166 alpha-2, e.g. LT.").optional(),
    taxId: optText(60),
    contactName: optText(160),
    contactEmail: optText(200),
    reference: optText(200),
    invoiceId: Id.optional(),
  })
  .strict();

const recipient = makeWritePair({
  key: "recipient_save",
  title: "save an invoice recipient (and attach it to a draft)",
  summary: "Adds a contact to the ISSUER's own contact book (no LabourMarket account is created, nobody is contacted) and optionally attaches it to a draft.",
  schema: recipientSchema,
  okStatus: "saved",
  readback: (o) => ({ recipientId: typeof o.data.id === "string" ? o.data.id : null }),
  prepare: async (caller, i) => {
    const project = await readProject(caller, i.projectId);
    if (!isRef(project)) return project;
    if (!project.organizationId) return fail("conflict", "The project belongs to no organization, so there is no issuer.");
    const n = await countRows(caller, "invoice_recipients", "issuer_org_id", project.organizationId);
    if (n === null) return fail("unavailable", "The recipient read failed.");
    return {
      projectId: i.projectId,
      normalized: {
        ...i,
        address: i.address ?? null, country: i.country ?? null, taxId: i.taxId ?? null, contactName: i.contactName ?? null,
        contactEmail: i.contactEmail ?? null, reference: i.reference ?? null, invoiceId: i.invoiceId ?? null,
      },
      state: `${project.organizationId}:${n}:${i.invoiceId ?? "-"}`,
      preview: { issuerOrganizationId: project.organizationId, legalName: i.legalName, country: i.country?.toUpperCase() ?? null, attachToDraft: i.invoiceId ?? null, change: "add a contact to the issuer's contact book; issue later refuses while the minimum (legal name, address, country) is missing" },
      destination: page(i.projectId, i.invoiceId),
    };
  },
  execute: async (caller, i) => {
    const project = await readProject(caller, i.projectId);
    if (!isRef(project) || !project.organizationId) return { status: "not_found", data: {} };
    const saved = await callRpc(caller, "save_invoice_recipient_v1", {
      p_issuer_org: project.organizationId,
      p_recipient_id: null,
      p_legal_name: i.legalName,
      p_address: i.address ?? null,
      p_country: i.country?.toUpperCase() ?? null,
      p_tax_id: i.taxId ?? null,
      p_contact_name: i.contactName ?? null,
      p_contact_email: i.contactEmail ?? null,
      p_reference: i.reference ?? null,
      p_linked_org: null,
      p_linked_profile: null,
    });
    if (saved.status !== "saved" || !i.invoiceId || typeof saved.data.id !== "string") return saved;
    const attach = await callRpc(caller, "set_invoice_recipient_v1", { p_invoice_id: i.invoiceId, p_recipient_id: saved.data.id });
    return attach.status === "updated" ? saved : attach;
  },
});

// 5. a line from an agreed milestone / fixed basis on a DRAFT ---------------------------------------

const lineSchema = z.object({ invoiceId: Id, rateTermId: Id, quantity: z.number().positive().max(1_000_000).default(1), description: optText(300) }).strict();

async function readDraft(caller: CapabilityCaller, invoiceId: string) {
  const read = await getInvoiceView(invoiceId, caller.supabase);
  if (read.kind === "needs-migration") return fail("needs_migration", "Invoicing is not enabled on this environment yet.");
  if (read.kind === "error") return fail("unavailable", "The invoice could not be read.");
  if (!read.value) return fail("not_found", "No such invoice the caller can see. Editing a draft is the issuer's: without the issuer's authority it is not visible.");
  if (read.value.header.status !== "draft") return fail("conflict", "Only a draft can be edited; an issued invoice is immutable.");
  return read.value;
}
const isDraftView = (v: Awaited<ReturnType<typeof readDraft>>): v is Extract<Awaited<ReturnType<typeof readDraft>>, { header: unknown }> => "header" in v;

const lineAdd = makeWritePair({
  key: "draft_line_add",
  title: "add a milestone/fixed line to a draft",
  summary: "Adds one line from an agreed milestone or fixed basis to a DRAFT.",
  schema: lineSchema,
  okStatus: "added",
  readback: (o) => ({ lineNo: typeof o.data.line_no === "number" ? o.data.line_no : null }),
  prepare: async (caller, i) => {
    const d = await readDraft(caller, i.invoiceId);
    if (!isDraftView(d)) return d;
    return {
      projectId: d.header.projectId ?? "",
      normalized: { ...i, description: i.description ?? null },
      state: `${i.invoiceId}:${d.lines.length}`,
      preview: { invoiceId: i.invoiceId, rateTermId: i.rateTermId, quantity: i.quantity, change: "add one line at the agreed rate; the database re-checks currency and that the basis is milestone/fixed" },
      destination: d.header.projectId ? page(d.header.projectId, i.invoiceId) : "/dashboard",
    };
  },
  execute: async (caller, i) =>
    callRpc(caller, "add_invoice_basis_line_v1", { p_invoice_id: i.invoiceId, p_rate_term_id: i.rateTermId, p_quantity: i.quantity, p_description: i.description ?? null }),
});

// 6. tax TREATMENT on a draft (the treatment only; confirmation stays explicit in the app) -----------

const taxSchema = z
  .object({
    invoiceId: Id,
    lineId: Id.optional(),
    treatment: z.enum(TAX_TREATMENTS),
    ratePercent: z.number().min(0).max(100).optional(),
    taxNote: optText(500),
    scope: z.enum(["unset", "all"]).default("unset"),
  })
  .strict();

const taxSet = makeWritePair({
  key: "draft_tax_set",
  title: "set the tax treatment on a draft",
  summary:
    "Sets the tax treatment (and rate where the treatment carries one) on one line, or on the unset/all lines of a DRAFT. This is NOT tax confirmation: the authorized owner/admin still confirms tax explicitly when issuing in the app.",
  schema: taxSchema,
  okStatus: "updated",
  readback: () => ({}),
  prepare: async (caller, i) => {
    if (!isTaxTreatment(i.treatment)) return fail("invalid", "Unknown tax treatment.");
    const check = validateTax({ treatment: i.treatment, ratePercent: i.ratePercent ?? null });
    if (!check.ok) return fail("invalid", "That tax treatment/rate combination is invalid.");
    const d = await readDraft(caller, i.invoiceId);
    if (!isDraftView(d)) return d;
    return {
      projectId: d.header.projectId ?? "",
      normalized: { ...i, lineId: i.lineId ?? null, ratePercent: i.ratePercent ?? null, taxNote: i.taxNote ?? null },
      state: `${i.invoiceId}:${d.lines.map((l) => `${l.id}=${l.taxTreatment ?? "-"}`).join(",")}`,
      preview: { invoiceId: i.invoiceId, treatment: i.treatment, ratePercent: check.ratePercent, scope: i.lineId ? "one line" : i.scope, change: "set the treatment on the draft; tax is never defaulted and is confirmed by the authorized owner/admin at issue time" },
      destination: d.header.projectId ? page(d.header.projectId, i.invoiceId) : "/dashboard",
    };
  },
  execute: async (caller, i) => {
    const check = validateTax({ treatment: i.treatment, ratePercent: i.ratePercent ?? null });
    const rate = check.ok ? check.ratePercent : null;
    return i.lineId
      ? callRpc(caller, "set_invoice_line_tax_v1", { p_line_id: i.lineId, p_treatment: i.treatment, p_rate_percent: rate, p_note: i.taxNote ?? null })
      : callRpc(caller, "set_invoice_tax_v1", { p_invoice_id: i.invoiceId, p_treatment: i.treatment, p_rate_percent: rate, p_note: i.taxNote ?? null, p_only_unset: i.scope !== "all" });
  },
});

export const PROJECT_INVOICE_CAPABILITIES: readonly CapabilityDescriptor[] = [
  projectInvoiceOverview,
  projectInvoiceGet,
  projectInvoiceExplain,
  projectInvoiceCorrectionPrepare,
  ...rateTerm,
  ...period,
  ...draftCreate,
  ...recipient,
  ...lineAdd,
  ...taxSet,
];
