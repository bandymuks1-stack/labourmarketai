import { COMPANY_NEED_INTAKE_STATUSES } from "@/lib/admin/company-need-intake-shared";
import { defaultLocale } from "@/lib/i18n/config";
import { isSyntheticFixtureLabel } from "@/lib/qa/synthetic-fixture";

import { requestDoorFromSourcePath } from "./request-doors";

/**
 * COMMERCIAL REQUESTS FEED (owner decision 2026-11-07). PURE.
 *
 * What Agentai OS may learn about a commercial request: its id, door, creation
 * time, status and where it sits in the admin queue. The names, e-mail, phone,
 * company and free text are read only to recognise a test row, and `toFeedItem`
 * is the one place an item is built, so they have no way out.
 *
 * THE CURSOR KEEPS THE DATABASE'S OWN TIME STRING. `created_at` has microseconds
 * and a JavaScript Date has milliseconds: a cursor rounded through Date would skip
 * or repeat every row inside that millisecond.
 */
export const COMMERCIAL_REQUESTS_FEED_SCHEMA = "labourmarket-commercial-requests/v1";
export const COMMERCIAL_REQUESTS_DEFAULT_LIMIT = 100;
export const COMMERCIAL_REQUESTS_MAX_LIMIT = 200;

/** Read by the reader, and no further than `toFeedItem`. */
export const COMMERCIAL_REQUEST_READ_COLUMNS =
  "id, created_at, source_path, status, company_name, contact_name, contact_email, description";

export interface CommercialRequestRow {
  readonly id: string;
  readonly created_at: string;
  readonly source_path: string | null;
  readonly status: string | null;
  readonly company_name: string | null;
  readonly contact_name: string | null;
  readonly contact_email: string | null;
  readonly description: string | null;
}

export type CommercialRequestType = "worker-search" | "b2b" | "project" | "company-need" | "other";

export interface CommercialRequestItem {
  readonly id: string;
  readonly type: CommercialRequestType;
  readonly createdAt: string;
  readonly status: string;
  readonly internalLink: string;
  /** Kept in the v1 shape for consumers that read it. `feedPage` drops every row
   *  for which this would be true, so the feed itself only ever sends `false`. */
  readonly synthetic: boolean;
}

export interface FeedCursor {
  readonly createdAt: string;
  readonly id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
/** `?review=no-js` marks a send that came without JavaScript (public-form-guard.ts). */
const COMPANY_NEED_PATH = /^\/[a-z]{2}\/company-need(?:\?review=no-js)?$/;
/** Mailboxes only our own walks use: `example.invalid` (RFC 2606) and the e2e proof
 *  domain `e2e-proof.local` (owner order 2026-11-09: such a contact is synthetic). */
const TEST_MAILBOX = /@(?:example\.invalid|e2e-proof\.local)$/i;

export function commercialRequestType(sourcePath: string | null): CommercialRequestType {
  const door = requestDoorFromSourcePath(sourcePath);
  if (door) return door;
  return COMPANY_NEED_PATH.test(sourcePath ?? "") ? "company-need" : "other";
}

export function toFeedItem(row: CommercialRequestRow): CommercialRequestItem {
  const status = row.status ?? "";
  return {
    id: row.id,
    type: commercialRequestType(row.source_path),
    createdAt: row.created_at,
    status: (COMPANY_NEED_INTAKE_STATUSES as readonly string[]).includes(status) ? status : "unknown",
    internalLink: `/${defaultLocale}/dashboard/admin/company-need-intakes#${row.id}`,
    synthetic: isSyntheticCommercialRequest(row),
  };
}

/**
 * Is this row one of OUR test requests (a production walk, an e2e proof), never a
 * real employer's? Owner decision 2026-11-14 (the `need-intake` walk, PR #3303):
 * EITHER signal is enough — a QA-SYNTHETIC / E2E marker in any text the sender
 * typed (`isSyntheticFixtureLabel`, the one product-wide marker rule) OR a contact
 * e-mail at a mailbox only our walks use (`TEST_MAILBOX`). A real employer cannot
 * be reached at `example.invalid` (RFC 2606: it never resolves) nor at the private
 * `e2e-proof.local` domain, and the markers are the documented QA prefixes, so the
 * OR rule drops nothing a real company could have sent.
 *
 * THE ONE RULE for every reader of `company_need_public_intakes` that must not count
 * or forward our test rows: this feed, the CRM pipeline (lib/crm/pipeline.ts), launch
 * readiness and the Agentai capability readback (lib/staffing/intake-test-rows.ts).
 */
export type SyntheticIntakeTexts = Pick<
  CommercialRequestRow,
  "company_name" | "contact_name" | "contact_email" | "description"
>;

export function isSyntheticCommercialRequest(row: SyntheticIntakeTexts): boolean {
  return (
    isSyntheticFixtureLabel(row.company_name, row.contact_name, row.contact_email, row.description) ||
    TEST_MAILBOX.test(row.contact_email ?? "")
  );
}

export function encodeFeedCursor(cursor: FeedCursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, "utf8").toString("base64url");
}

/** Null for anything that isn't exactly a cursor this feed issued, so nothing a
 *  caller writes can reach the query filter. */
export function decodeFeedCursor(raw: string): FeedCursor | null {
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  const parts = decoded.split("|");
  if (parts.length !== 2) return null;
  const [createdAt, id] = parts as [string, string];
  return TIMESTAMP.test(createdAt) && UUID.test(id) ? { createdAt, id } : null;
}

/** The (created_at, id) keyset as a PostgREST `or` filter. Time values are quoted
 *  because they hold `+` and `:`. */
export function feedCursorFilter(cursor: FeedCursor): string {
  const at = `"${cursor.createdAt}"`;
  return `created_at.gt.${at},and(created_at.eq.${at},id.gt.${cursor.id})`;
}

/** The requested page size, or null when it isn't a whole number in range. */
export function parseFeedLimit(raw: string | null): number | null {
  if (raw === null) return COMMERCIAL_REQUESTS_DEFAULT_LIMIT;
  if (!/^\d{1,4}$/.test(raw)) return null;
  const limit = Number(raw);
  return limit >= 1 && limit <= COMMERCIAL_REQUESTS_MAX_LIMIT ? limit : null;
}

/** The statuses that need no more handling. `?status=open` is everything else, written
 *  as an exclusion so a status nobody knows yet is still seen and not lost. */
export const CLOSED_REQUEST_STATUSES = ["converted", "rejected"] as const;

/** PostgREST's `not in` list for those statuses. */
export const CLOSED_REQUEST_STATUS_FILTER = `(${CLOSED_REQUEST_STATUSES.join(",")})`;

/** Rows read with one extra past `limit`: that extra row is how the feed knows more
 *  exist, and only then is there a next cursor.
 *
 *  OUR TEST REQUESTS NEVER LEAVE (`isSyntheticCommercialRequest`): they are dropped
 *  here, server-side, before any item is built, in both reads (the cursor read and
 *  `?status=open`), so no consumer can take one for a real commercial request
 *  whatever it does with the `synthetic` flag. The cursor is still taken from the
 *  last row READ, dropped or not: it moves past the dropped rows, so a real row
 *  after them is neither skipped nor repeated, and a page that held only test rows
 *  comes back with no items and a cursor to the next page. */
export function feedPage(
  rows: readonly CommercialRequestRow[],
  limit: number,
): { readonly items: readonly CommercialRequestItem[]; readonly nextCursor: string | null } {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.filter((row) => !isSyntheticCommercialRequest(row)).map(toFeedItem),
    nextCursor:
      rows.length > limit && last ? encodeFeedCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}
