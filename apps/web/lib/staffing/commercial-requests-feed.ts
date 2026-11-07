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
  readonly synthetic: boolean;
}

export interface FeedCursor {
  readonly createdAt: string;
  readonly id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const COMPANY_NEED_PATH = /^\/[a-z]{2}\/company-need$/;
const TEST_MAILBOX = /@example\.invalid$/i;

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
    synthetic:
      isSyntheticFixtureLabel(row.company_name, row.contact_name, row.contact_email, row.description) ||
      TEST_MAILBOX.test(row.contact_email ?? ""),
  };
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

/** Rows read with one extra past `limit`: that extra row is how the feed knows more
 *  exist, and only then is there a next cursor. */
export function feedPage(
  rows: readonly CommercialRequestRow[],
  limit: number,
): { readonly items: readonly CommercialRequestItem[]; readonly nextCursor: string | null } {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toFeedItem),
    nextCursor:
      rows.length > limit && last ? encodeFeedCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}
