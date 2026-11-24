import { mapHeaderRow } from "./parse-tabular";
import { SOURCE_ROW_FIELDS, type SourceRowField } from "./source-rows";

/**
 * FACT vs DERIVED for a COMMITTED record (owner P0 §18, 2026-09-23).
 *
 * `organization_evidence_records` has no `fact_fields` column, and the read
 * returned `factFields: []` for every record — so the FACT/DERIVED contract
 * the MCP `evidence.records.list` description promises was empty. The
 * record DOES carry what is needed to say it honestly: its source line,
 * verbatim (`source_fact`), and every derivation with its method
 * (`derived`). A canonical field is a SOURCE FACT of the record when all of:
 *
 *   · the source line has a column for it (the same header reading the
 *     parser uses — `mapHeaderRow`, never a second vocabulary);
 *   · the record actually holds a value for it;
 *   · no derivation is recorded for it — and for the PERIOD, the period did
 *     not come from a time-semantics decision. A row-level date the source
 *     stated never makes a span a person chose at import a source fact.
 *
 * Under-claiming is the safe direction: an unknown header, a missing value
 * or any derivation leaves the field out. Pure.
 */
export function committedFactFields(rec: {
  readonly sourceFact: Record<string, unknown> | null | undefined;
  readonly activityDate: string | null;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly hours: number | null;
  readonly text: string;
  readonly contextLabel: string | null;
  readonly derived: Record<string, unknown> | null | undefined;
}): SourceRowField[] {
  const source = rec.sourceFact && typeof rec.sourceFact === "object" ? rec.sourceFact : {};
  const columns = mapHeaderRow(Object.keys(source));
  const derived = rec.derived ?? {};
  const derivedFor = (field: string): boolean => {
    const d = derived[field] as { method?: unknown } | undefined;
    return !!d && typeof d === "object" && typeof d.method === "string";
  };
  const ts = derived.timeSemantics as { periodStart?: unknown } | undefined;
  const periodFromDecision = !!ts && typeof ts.periodStart === "string" && ts.periodStart !== "";
  const holds: Readonly<Record<SourceRowField, boolean>> = {
    personLabel: true,
    projectLabel: rec.contextLabel !== null && rec.contextLabel !== "",
    workDate: rec.activityDate !== null,
    periodStart: rec.periodStart !== null && !periodFromDecision,
    periodEnd: rec.periodEnd !== null && !periodFromDecision,
    hours: rec.hours !== null,
    workText: rec.text !== "",
    // The record view carries no external reference; nothing to vouch for.
    externalRef: false,
  };
  return SOURCE_ROW_FIELDS.filter((f) => columns[f] !== undefined && holds[f] && !derivedFor(f));
}
