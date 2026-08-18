import { csvCell } from "@/lib/projects/operations-report";

/**
 * Pure operational-finance model (control room PR I, capability gap map §9) —
 * shared by the server read service, the server actions, the CSV export
 * route, the guard test and the finance page. No server-only imports, no IO.
 *
 * The model codes against the `public.finance_records` contract the
 * SEPARATE, human-gated migration PR (I2) will propose. Until the owner
 * applies that migration the read/action layers degrade honestly (the
 * established work-tasks / bookings pattern) — nothing here fakes a record,
 * a sum or a payment.
 *
 * HONEST scope: manual operational records only (invoices issued/received +
 * expenses). No bookkeeping, no tax, no payroll, no bank sync, no payment
 * processing — nothing in this layer moves money or talks to a payment
 * provider (guard-pinned in lib/guards/finance-records.test.ts).
 *
 * HONEST lifecycle only: draft / issued / partially_paid / paid / cancelled.
 * "Overdue" is DERIVED state (an unpaid record whose due day has passed) —
 * it is never stored, so it clears itself the moment the record is paid or
 * cancelled and needs no cron. All money math is integer cents — no floats,
 * no parseFloat, no toFixed (guard-pinned).
 */

export const FINANCE_RECORD_TYPES = [
  "invoice_issued",
  "invoice_received",
  "expense",
] as const;
export type FinanceRecordType = (typeof FINANCE_RECORD_TYPES)[number];

/** Stored statuses — EXACTLY these five. 'overdue' is deliberately NOT a
 *  stored status: it is derived from due_date + an unpaid status, so the
 *  flag is always current without any server-side recomputation. */
export const FINANCE_RECORD_STATUSES = [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "cancelled",
] as const;
export type FinanceRecordStatus = (typeof FINANCE_RECORD_STATUSES)[number];

/** Statuses that still await money — the only ones that can become overdue. */
export const UNPAID_FINANCE_STATUSES = [
  "draft",
  "issued",
  "partially_paid",
] as const;

/** Initial statuses the create form offers (a record entered after the fact
 *  may honestly start as issued or already paid). */
export const FINANCE_CREATE_STATUSES = ["draft", "issued", "paid"] as const;

/** Bounded lengths — mirrored by the I2 RPC validation (single contract). */
export const FINANCE_TITLE_MIN = 3;
export const FINANCE_TITLE_MAX = 160;
export const FINANCE_COUNTERPARTY_MIN = 2;
export const FINANCE_COUNTERPARTY_MAX = 160;
export const FINANCE_NOTE_MAX = 1000;
/** Invoice-upgrade bound (20260817220000_finance_invoice_upgrades_v1). */
export const FINANCE_INVOICE_NUMBER_MAX = 60;

/**
 * Engine-MIRROR approval states (finance invoice upgrades v1). The decision
 * itself lives in the Workflow & Approval Engine (context 'expense' /
 * 'invoice', context id = record id); this column only reflects it — written
 * by submit_finance_record_approval_v1 / sync_finance_record_approval_v1,
 * never decided app-side. `null` = approval was never requested.
 */
export const FINANCE_APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;
export type FinanceApprovalStatus = (typeof FINANCE_APPROVAL_STATUSES)[number];

export function isValidFinanceApprovalStatus(
  v: string,
): v is FinanceApprovalStatus {
  return (FINANCE_APPROVAL_STATUSES as readonly string[]).includes(v);
}

/** Engine context for a record type (single mapping, guard-pinned). */
export function financeApprovalContext(
  recordType: FinanceRecordType,
): "expense" | "invoice" {
  return recordType === "expense" ? "expense" : "invoice";
}

/** Amount bounds in integer cents (EUR-only v1): 0 .. €1,000,000,000.00. */
export const FINANCE_MAX_AMOUNT_CENTS = 100_000_000_000;

/** Bounded reads everywhere — the finance surfaces never stream unbounded
 *  rows and every sum is computed over this bounded, RLS-scoped set. */
export const FINANCE_READ_LIMIT = 500;

/**
 * Postgres/PostgREST error codes that mean "the finance_records migration is
 * not applied yet": missing relation, missing column, missing function, and
 * the PostgREST schema-cache miss for an RPC. The read layer and the actions
 * map ALL of these to the honest "not available yet" state — never a crash.
 */
export const MIGRATION_MISSING_ERROR_CODES = [
  "42P01",
  "42703",
  "42883",
  "PGRST202",
] as const;

export function isMigrationMissingCode(code: string | undefined): boolean {
  return (MIGRATION_MISSING_ERROR_CODES as readonly string[]).includes(
    code ?? "",
  );
}

export type FinanceRecord = {
  readonly id: string;
  readonly recordType: FinanceRecordType;
  readonly title: string;
  /** Manual counterparty text — no contact entity exists yet (honest v1). */
  readonly counterpartyName: string;
  /** Integer cents. Never a float anywhere in this layer. */
  readonly amountCents: number;
  readonly currency: string;
  readonly status: FinanceRecordStatus;
  /** Date-only ("YYYY-MM-DD") or null. */
  readonly dueDate: string | null;
  readonly paidAt: string | null;
  readonly projectId: string | null;
  readonly companyId: string | null;
  readonly note: string | null;
  /** Invoice upgrades v1 — additive nullable fields (honest null = absent). */
  readonly invoiceNumber: string | null;
  /** Integer cents or null. Never a float anywhere in this layer. */
  readonly vatAmountCents: number | null;
  /** Document-engine register row (org_documents) the receipt lives behind. */
  readonly orgDocumentId: string | null;
  /** Engine MIRROR — null when approval was never requested. */
  readonly approvalStatus: FinanceApprovalStatus | null;
  /** Business trip this record belongs to (business trips v1). */
  readonly tripId: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
};

/** Read results — the bookings-page discriminant style ("needs-migration"
 *  is a calm product state, never an error surface). */
export type MyFinanceRecordsResult =
  | { readonly status: "not-authed" }
  | { readonly status: "needs-migration" }
  | {
      readonly status: "ok";
      readonly records: readonly FinanceRecord[];
      readonly error: string | null;
    };

export function isValidFinanceRecordType(v: string): v is FinanceRecordType {
  return (FINANCE_RECORD_TYPES as readonly string[]).includes(v);
}

export function isValidFinanceRecordStatus(
  v: string,
): v is FinanceRecordStatus {
  return (FINANCE_RECORD_STATUSES as readonly string[]).includes(v);
}

export function isUnpaid(status: FinanceRecordStatus): boolean {
  return (UNPAID_FINANCE_STATUSES as readonly string[]).includes(status);
}

/** UTC day of an ISO date/timestamp — "YYYY-MM-DD", or null when unparseable. */
function utcDay(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Overdue = an UNPAID record (draft/issued/partially_paid) whose due
 * CALENDAR day (UTC) is before today (UTC). Due today is NOT overdue yet.
 * Paid and cancelled records are never overdue — the flag self-clears.
 */
export function isOverdueRecord(
  record: Pick<FinanceRecord, "status" | "dueDate">,
  now: Date,
): boolean {
  if (!isUnpaid(record.status)) return false;
  if (!record.dueDate) return false;
  const due = utcDay(record.dueDate);
  if (!due) return false;
  return due < now.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Cents math — pure integer, no floats                                */
/* ------------------------------------------------------------------ */

/**
 * Parse a manual EUR amount ("123.45" or "123,45") into integer cents with
 * PURE integer math — no parseFloat, no float rounding. Accepts at most two
 * decimals; rejects negatives, signs, exponents, thousands separators and
 * anything above the contract bound. Returns null on any invalid input.
 */
export function parseAmountInputToCents(input: string): number | null {
  const raw = input.trim().replace(",", ".");
  const m = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!m) return null;
  // Digit-only strings parse to exact integers (both far below 2^53).
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? "").padEnd(2, "0") || "0");
  const cents = whole * 100 + frac;
  if (!Number.isSafeInteger(cents) || cents > FINANCE_MAX_AMOUNT_CENTS) {
    return null;
  }
  return cents;
}

/** Integer cents → "123.45" (exact — the modulo split keeps the division on
 *  a multiple of 100, so no float precision is ever involved). */
export function formatCentsAsEur(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const rem = abs % 100;
  const euros = (abs - rem) / 100;
  return `${sign}${euros}.${String(rem).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Real-sum summary derivation (pure)                                  */
/* ------------------------------------------------------------------ */

export type FinanceStatusTotal = {
  readonly count: number;
  readonly amountCents: number;
};

export type FinanceProjectTotal = {
  readonly projectId: string;
  readonly count: number;
  readonly amountCents: number;
};

export type FinanceSummary = {
  readonly totalCount: number;
  /** Sum of non-cancelled invoice_issued amounts. */
  readonly issuedInvoiceCents: number;
  /** Sum of non-cancelled invoice_received amounts. */
  readonly receivedInvoiceCents: number;
  /** Sum of non-cancelled expense amounts. */
  readonly expenseCents: number;
  /** Sum of amounts whose status is 'paid' (all record types). */
  readonly paidCents: number;
  /** Derived-overdue records: full record amounts (a partially paid record
   *  counts its full recorded amount — v1 stores one amount per record). */
  readonly overdueCents: number;
  readonly overdueCount: number;
  readonly byStatus: Readonly<
    Record<FinanceRecordStatus, FinanceStatusTotal>
  >;
  /** Per-project real sums over non-cancelled, project-linked records. */
  readonly byProject: readonly FinanceProjectTotal[];
};

export const ZERO_FINANCE_SUMMARY: FinanceSummary = {
  totalCount: 0,
  issuedInvoiceCents: 0,
  receivedInvoiceCents: 0,
  expenseCents: 0,
  paidCents: 0,
  overdueCents: 0,
  overdueCount: 0,
  byStatus: {
    draft: { count: 0, amountCents: 0 },
    issued: { count: 0, amountCents: 0 },
    partially_paid: { count: 0, amountCents: 0 },
    paid: { count: 0, amountCents: 0 },
    cancelled: { count: 0, amountCents: 0 },
  },
  byProject: [],
};

/** Derive every summary total from a bounded record list (pure, cents-only).
 *  Sums are REAL — computed from the caller's own RLS rows, never estimated. */
export function deriveFinanceSummary(
  records: readonly Pick<
    FinanceRecord,
    "recordType" | "status" | "amountCents" | "dueDate" | "projectId"
  >[],
  now: Date,
): FinanceSummary {
  let issuedInvoiceCents = 0;
  let receivedInvoiceCents = 0;
  let expenseCents = 0;
  let paidCents = 0;
  let overdueCents = 0;
  let overdueCount = 0;
  const byStatus: Record<
    FinanceRecordStatus,
    { count: number; amountCents: number }
  > = {
    draft: { count: 0, amountCents: 0 },
    issued: { count: 0, amountCents: 0 },
    partially_paid: { count: 0, amountCents: 0 },
    paid: { count: 0, amountCents: 0 },
    cancelled: { count: 0, amountCents: 0 },
  };
  const projects = new Map<string, { count: number; amountCents: number }>();

  for (const r of records) {
    byStatus[r.status].count += 1;
    byStatus[r.status].amountCents += r.amountCents;
    if (r.status !== "cancelled") {
      if (r.recordType === "invoice_issued") issuedInvoiceCents += r.amountCents;
      if (r.recordType === "invoice_received") {
        receivedInvoiceCents += r.amountCents;
      }
      if (r.recordType === "expense") expenseCents += r.amountCents;
      if (r.projectId) {
        const p = projects.get(r.projectId) ?? { count: 0, amountCents: 0 };
        p.count += 1;
        p.amountCents += r.amountCents;
        projects.set(r.projectId, p);
      }
    }
    if (r.status === "paid") paidCents += r.amountCents;
    if (isOverdueRecord(r, now)) {
      overdueCents += r.amountCents;
      overdueCount += 1;
    }
  }

  return {
    totalCount: records.length,
    issuedInvoiceCents,
    receivedInvoiceCents,
    expenseCents,
    paidCents,
    overdueCents,
    overdueCount,
    byStatus,
    byProject: [...projects.entries()].map(([projectId, p]) => ({
      projectId,
      count: p.count,
      amountCents: p.amountCents,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* CSV export (pure builders — the route does the RLS-scoped reading)  */
/* ------------------------------------------------------------------ */

export const FINANCE_CSV_HEADER = [
  "record_type",
  "status",
  "overdue",
  "title",
  "counterparty",
  "amount_eur",
  "currency",
  "invoice_number",
  "vat_eur",
  "approval_status",
  "has_document",
  "trip_id",
  "due_date",
  "paid_at",
  "project_id",
  "company_id",
  "note",
  "created_at",
] as const;

/** One CSV row for one record (pure). Overdue is the same derivation the
 *  page shows — the export can never disagree with the screen. The document
 *  column is an honest INDICATOR (yes/empty): the file itself lives behind
 *  the document engine and is not exported here. */
export function buildFinanceCsvRow(record: FinanceRecord, now: Date): string[] {
  return [
    record.recordType,
    record.status,
    isOverdueRecord(record, now) ? "yes" : "no",
    record.title,
    record.counterpartyName,
    formatCentsAsEur(record.amountCents),
    record.currency,
    record.invoiceNumber ?? "",
    record.vatAmountCents === null ? "" : formatCentsAsEur(record.vatAmountCents),
    record.approvalStatus ?? "",
    record.orgDocumentId ? "yes" : "",
    record.tripId ?? "",
    record.dueDate ?? "",
    record.paidAt ?? "",
    record.projectId ?? "",
    record.companyId ?? "",
    record.note ?? "",
    record.createdAt,
  ];
}

function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(",");
}

/** Build the full CSV string for a finance export. No rows produce a
 *  header-only CSV — nothing is ever invented. */
export function buildFinanceCsv(
  records: readonly FinanceRecord[],
  now: Date,
): string {
  const lines: string[] = [csvRow([...FINANCE_CSV_HEADER])];
  for (const r of records) {
    lines.push(csvRow(buildFinanceCsvRow(r, now)));
  }
  return lines.join("\r\n") + "\r\n";
}

/** Filesystem-safe filename, stamped with the export day. */
export function financeCsvFilename(isoDay: string): string {
  return `finance-records-${isoDay}.csv`;
}

/** i18n leaf helpers — one naming source for every surface. */
export function financeStatusLabelKey(status: FinanceRecordStatus): string {
  return `finance.status.${status}`;
}

export function financeTypeLabelKey(type: FinanceRecordType): string {
  return `finance.type.${type}`;
}
