/**
 * WHOSE WORK THE HEADER STATES (owner P0-B, 2026-10-30).
 *
 * An organization can hold records of work done under an EARLIER legal
 * entity (a continuing business: the period statements in
 * `organization_history_periods`, composed by `business-history.ts`). Those
 * records are the earlier entity's and its people's history. A transfer of
 * ownership must not attribute them to the new owner, so the overview header
 * never presents the all-period total as the holding organization's own
 * history. It reads the periods apart instead:
 *
 *   own        a period stated under THIS organization's legal entity (its
 *              label is the organization's name, or the statement says it is
 *              the same entity / the same entity renamed);
 *   earlier    a period stated under another legal entity;
 *   unstated   a period with no legal entity named — whose it is is not
 *              stated, so it is never counted as the organization's own;
 *   not placed records no period statement places.
 *
 * `split` is true when any record sits outside an `own` period: only then
 * does the header need to separate the figures. An organization whose every
 * record is its own keeps the one-total header.
 *
 * Pure: no IO, no i18n. Every figure is the composer's own (no re-count).
 */

import type { BusinessHistory, HistoryBucketTotals, HistoryPeriodStatement } from "./business-history";

export type HeaderPeriodOwnership = "own" | "earlier" | "unstated";

export type HeaderPeriodRow = {
  readonly statementId: string;
  readonly label: string;
  readonly legalEntityLabel: string | null;
  readonly ownership: HeaderPeriodOwnership;
  readonly legalEntityRelation: HistoryPeriodStatement["legalEntityRelation"];
  readonly continuity: HistoryPeriodStatement["continuity"];
  readonly totals: HistoryBucketTotals;
};

export type BusinessHistoryHeader = {
  readonly split: boolean;
  readonly rows: readonly HeaderPeriodRow[];
  /** Records no stated period places — a row of their own, never "own". */
  readonly notPlaced: HistoryBucketTotals;
};

/** Case-, accent-, quote- and punctuation-insensitive name key. */
export function entityNameKey(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function periodOwnership(
  p: Pick<HistoryPeriodStatement, "legalEntityLabel" | "legalEntityRelation">,
  organizationName: string,
): HeaderPeriodOwnership {
  if (p.legalEntityRelation === "same_entity" || p.legalEntityRelation === "renamed") return "own";
  const label = entityNameKey(p.legalEntityLabel);
  if (!label) return "unstated";
  const name = entityNameKey(organizationName);
  return name && label === name ? "own" : "earlier";
}

export function businessHistoryHeader(business: BusinessHistory, organizationName: string): BusinessHistoryHeader {
  const rows: HeaderPeriodRow[] = business.periods.map(({ statement, totals }) => ({
    statementId: statement.id,
    label: statement.periodLabel,
    legalEntityLabel: statement.legalEntityLabel,
    ownership: periodOwnership(statement, organizationName),
    legalEntityRelation: statement.legalEntityRelation,
    continuity: statement.continuity,
    totals,
  }));
  const outsideOwn =
    business.notPlaced.records > 0 || rows.some((r) => r.ownership !== "own" && r.totals.records > 0);
  return { split: outsideOwn, rows, notPlaced: business.notPlaced };
}
