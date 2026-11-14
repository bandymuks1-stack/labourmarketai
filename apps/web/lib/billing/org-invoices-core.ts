/**
 * Organization invoices — PURE core (registry 7.20, 2026-10-23). No IO.
 *
 * The organization's billing managers see the organization's OWN Stripe
 * invoices inside LabourMarket.ai, read live from Stripe at request time
 * (lib/billing/org-invoices.ts wires the IO around this file). Nothing is
 * stored: the invoice lives in Stripe, this core only decides who may see
 * what and projects Stripe's object into a display view.
 *
 * WHO (authorization). The workspace proposes the billing subject and the
 * `manage-billing` capability decides the authority (billing-subject.ts —
 * the same check checkout, the portal and the pilot pass use). Only an
 * ORGANIZATION subject with billing authority gets a list; a member, a
 * manager without billing authority or a personal workspace gets nothing.
 *
 * WHICH invoices. A Stripe customer belongs to the PAYER (one per profile,
 * customer-store.ts), so one customer can also carry invoices for another
 * organization the same person pays for. An invoice is therefore shown only
 * when it is ATTRIBUTED to this organization:
 *   - its own metadata or its subscription's metadata snapshot names this
 *     organization (`organization_id`, stamped by metadata-core /
 *     pilot-pass-core on every object this platform creates); or
 *   - it carries no organization at all but was issued for one of this
 *     organization's own stored subscriptions.
 * An invoice naming ANOTHER organization is never shown, whatever else
 * matches. An invoice that cannot be attributed is left out (never guessed).
 *
 * HONEST STATES (SEP-7, unknown ≠ zero): billing off, no provider customer
 * yet, a failed read (UNKNOWN — never "no invoices"), an empty list, and a
 * list that may be incomplete (one of several reads failed, or Stripe has
 * more pages than one read returns).
 */

export type OrgInvoiceStatus = "paid" | "open" | "void" | "uncollectible";

export interface OrgInvoiceView {
  readonly id: string;
  /** Stripe's invoice number (finalized invoices always carry one). */
  readonly number: string | null;
  /** Unix seconds. */
  readonly created: number;
  /** Service period (unix seconds); null when the invoice is a one-off charge. */
  readonly periodStart: number | null;
  readonly periodEnd: number | null;
  /** Minor units (cents). Null = Stripe did not report it (shown as unknown). */
  readonly amountExcludingTax: number | null;
  readonly tax: number | null;
  readonly total: number;
  /** ISO 4217, lower case as Stripe reports it. */
  readonly currency: string;
  readonly status: OrgInvoiceStatus;
  /** Stripe-hosted pages only (https, stripe.com); null otherwise. */
  readonly hostedInvoiceUrl: string | null;
  readonly invoicePdfUrl: string | null;
}

export type OrgInvoicesResult =
  /** Payments are not on for this workspace's organization. */
  | { readonly state: "billing_off" }
  /** Personal workspace, unauthenticated, or no billing authority: nothing. */
  | { readonly state: "not_authorized" }
  /** The organization has never been linked to a provider customer. */
  | { readonly state: "no_customer" }
  /** A read failed — the invoices are UNKNOWN, not absent. */
  | { readonly state: "unknown" }
  | {
      readonly state: "list";
      readonly invoices: readonly OrgInvoiceView[];
      /** Some invoices may be missing (a partial read, or more pages exist). */
      readonly incomplete: boolean;
    };

export type OrgInvoiceAccess =
  | { readonly ok: true; readonly organizationId: string }
  | { readonly ok: false; readonly result: OrgInvoicesResult };

/**
 * The gate. Authorization FIRST (a non-manager never learns whether billing
 * is on for the organization), then the billing state.
 */
export function evaluateOrgInvoiceAccess(input: {
  readonly subject: { readonly type: "profile" | "organization"; readonly id: string } | null;
  readonly billingAuthority: boolean;
  /** getBillingConfigFor(organizationId).state */
  readonly billingState: string;
}): OrgInvoiceAccess {
  if (!input.subject || input.subject.type !== "organization" || !input.billingAuthority) {
    return { ok: false, result: { state: "not_authorized" } };
  }
  if (input.billingState !== "stripe_test" && input.billingState !== "stripe_live") {
    return { ok: false, result: { state: "billing_off" } };
  }
  return { ok: true, organizationId: input.subject.id };
}

const STATUSES: ReadonlySet<string> = new Set(["paid", "open", "void", "uncollectible"]);

const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
const idOf = (v: unknown): string | null => str(v) ?? str(rec(v)?.id);

/** Only Stripe's own hosted pages are linked — never an arbitrary URL. */
export function stripeHostedUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    return host === "stripe.com" || host.endsWith(".stripe.com") ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The subscription the invoice was issued for (post-Basil `parent`, or the legacy field). */
function subscriptionDetailsOf(raw: Record<string, unknown>): {
  subscriptionId: string | null;
  metadata: Record<string, unknown> | null;
} {
  const details = rec(rec(raw.parent)?.subscription_details) ?? rec(raw.subscription_details);
  return {
    subscriptionId: idOf(details?.subscription) ?? idOf(raw.subscription),
    metadata: rec(details?.metadata),
  };
}

/**
 * Is this raw Stripe invoice attributed to the organization? See the file
 * header: a named organization decides; otherwise only the organization's
 * own stored subscription does.
 */
export function invoiceBelongsToOrganization(
  raw: Record<string, unknown>,
  scope: { readonly organizationId: string; readonly subscriptionIds: ReadonlySet<string> },
): boolean {
  const sub = subscriptionDetailsOf(raw);
  const named = str(rec(raw.metadata)?.organization_id) ?? str(sub.metadata?.organization_id);
  if (named) return named === scope.organizationId;
  return sub.subscriptionId !== null && scope.subscriptionIds.has(sub.subscriptionId);
}

/** The service period from the line items (Stripe's invoice-level period is the PREVIOUS cycle). */
function servicePeriod(raw: Record<string, unknown>): { start: number | null; end: number | null } {
  const lines = rec(raw.lines)?.data;
  let start: number | null = null;
  let end: number | null = null;
  if (Array.isArray(lines)) {
    for (const line of lines) {
      const p = rec(rec(line)?.period);
      const s = int(p?.start);
      const e = int(p?.end);
      if (s !== null && (start === null || s < start)) start = s;
      if (e !== null && (end === null || e > end)) end = e;
    }
  }
  if (start === null || end === null) {
    start = int(raw.period_start);
    end = int(raw.period_end);
  }
  // A one-off charge (the 1 € organization pass) has a zero-length period:
  // there is no service period to state, so none is invented.
  if (start === null || end === null || end <= start) return { start: null, end: null };
  return { start, end };
}

/**
 * Stripe invoice → display view. Null for a draft (no number, not issued), an
 * unknown status, a missing amount/currency, or an object from the other
 * Stripe mode than the one being read.
 */
export function normalizeInvoice(
  raw: Record<string, unknown> | null | undefined,
  expected: { readonly livemode: boolean },
): OrgInvoiceView | null {
  if (!raw) return null;
  const id = str(raw.id);
  const status = str(raw.status);
  const total = int(raw.total);
  const currency = str(raw.currency);
  const created = int(raw.created);
  if (!id || !status || !STATUSES.has(status) || total === null || !currency || created === null) return null;
  if (typeof raw.livemode === "boolean" && raw.livemode !== expected.livemode) return null;

  // VAT: Stripe Tax / tax rates report `total_taxes` (post-Basil) — an empty
  // array is a real 0. When neither it nor `total_excluding_tax` is reported,
  // the VAT is UNKNOWN (null), never 0.
  const taxes = Array.isArray(raw.total_taxes) ? raw.total_taxes : null;
  let tax: number | null = null;
  if (taxes) {
    tax = 0;
    for (const t of taxes) {
      const a = int(rec(t)?.amount);
      if (a === null) {
        tax = null;
        break;
      }
      tax += a;
    }
  }
  const excl = int(raw.total_excluding_tax);
  if (tax === null && excl !== null) tax = total - excl;
  const amountExcludingTax = excl ?? (tax !== null ? total - tax : null);
  const period = servicePeriod(raw);

  return {
    id,
    number: str(raw.number),
    created,
    periodStart: period.start,
    periodEnd: period.end,
    amountExcludingTax,
    tax,
    total,
    currency,
    status: status as OrgInvoiceStatus,
    hostedInvoiceUrl: stripeHostedUrl(raw.hosted_invoice_url),
    invoicePdfUrl: stripeHostedUrl(raw.invoice_pdf),
  };
}

export type CustomerInvoiceRead =
  | { readonly ok: true; readonly invoices: readonly Record<string, unknown>[]; readonly hasMore: boolean }
  | { readonly ok: false };

/**
 * The organization's list from the per-customer reads. Every read failed →
 * UNKNOWN (never "no invoices"). Some failed, or a customer has more pages →
 * the list is shown and marked incomplete. Newest first, each invoice once.
 */
export function buildOrgInvoiceList(input: {
  readonly organizationId: string;
  readonly subscriptionIds: readonly string[];
  readonly livemode: boolean;
  readonly reads: readonly CustomerInvoiceRead[];
}): OrgInvoicesResult {
  if (input.reads.length === 0) return { state: "no_customer" };
  const ok = input.reads.filter((r): r is Extract<CustomerInvoiceRead, { ok: true }> => r.ok);
  if (ok.length === 0) return { state: "unknown" };
  const scope = { organizationId: input.organizationId, subscriptionIds: new Set(input.subscriptionIds) };
  const byId = new Map<string, OrgInvoiceView>();
  for (const read of ok) {
    for (const raw of read.invoices) {
      if (!invoiceBelongsToOrganization(raw, scope)) continue;
      const view = normalizeInvoice(raw, { livemode: input.livemode });
      if (view && !byId.has(view.id)) byId.set(view.id, view);
    }
  }
  const invoices = [...byId.values()].sort((a, b) => b.created - a.created || a.id.localeCompare(b.id));
  const incomplete = ok.length < input.reads.length || ok.some((r) => r.hasMore);
  return { state: "list", invoices, incomplete };
}

/** Stripe's zero-decimal currencies: the minor unit IS the major unit. */
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/** Minor units → a localized money string; null amount stays null (shown as unknown). */
export function formatInvoiceAmount(minor: number | null, currency: string, locale: string): string | null {
  if (minor === null) return null;
  const cur = currency.toLowerCase();
  const major = ZERO_DECIMAL.has(cur) ? minor : minor / 100;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: cur.toUpperCase() }).format(major);
  } catch {
    return `${major.toFixed(ZERO_DECIMAL.has(cur) ? 0 : 2)} ${cur.toUpperCase()}`;
  }
}

/** Unix seconds → a calendar date in the page's language (UTC, like the plan's end date). */
export function formatInvoiceDate(unixSeconds: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(unixSeconds * 1000),
  );
}
