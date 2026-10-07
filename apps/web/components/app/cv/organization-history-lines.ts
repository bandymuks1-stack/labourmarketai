import type { CvOrganizationHistoryEntry } from "@/lib/cv-export/organization-history";

/**
 * The words of one organization-provided CV history entry, composed from the
 * entry's own facts and a caller-supplied translator set. One composition for
 * the on-screen CV and the EU-format document, so they can never describe the
 * same entry differently. No data access, no honesty rule of its own: every
 * absent fact simply yields no line (never "unknown" filler, never a zero).
 */

export interface OrganizationHistoryWords {
  /** `cvOrganizationHistory` namespace translator. */
  readonly t: (key: string, values?: Record<string, string | number>) => string;
  /** `historyContext` namespace translator. */
  readonly h: (key: string, values?: Record<string, string | number>) => string;
  /** Role / source-kind / relationship words; null = no word for that slug. */
  readonly role: (slug: string) => string | null;
  readonly sourceKind: (slug: string) => string | null;
  readonly relationship: (slug: string) => string | null;
  readonly hours: (n: number) => string;
  readonly date: (iso: string) => string | null;
}

export interface OrganizationHistoryLines {
  readonly heading: string;
  readonly subheading: string | null;
  readonly period: string | null;
  /** Labelled detail lines in reading order (client, capacity, hours, source). */
  readonly details: readonly { readonly term: string; readonly value: string }[];
  /** One line per proof fact that holds for every record of the entry. */
  readonly proof: readonly { readonly concept: string; readonly text: string }[];
  readonly contested: boolean;
}

export function organizationHistoryLines(
  e: CvOrganizationHistoryEntry,
  w: OrganizationHistoryWords,
): OrganizationHistoryLines {
  const heading = e.project ?? e.place ?? e.organizationName ?? w.t("untitled");
  const subheading =
    [e.project ? (e.place ?? null) : null, e.project || e.place ? e.organizationName : null]
      .filter((x): x is string => !!x)
      .join(" · ") || null;

  const from = e.from ? w.date(e.from) : null;
  const to = e.to ? w.date(e.to) : null;
  const period = from && to ? (from === to ? from : `${from} – ${to}`) : (from ?? to);

  const details: { term: string; value: string }[] = [];
  if (e.clients.length > 0) {
    details.push({
      term: w.h("client"),
      value: e.clients
        .map((c) => {
          const r = w.role(c.role);
          return r ? `${c.label} (${r})` : c.label;
        })
        .join(" · "),
    });
  }
  const rel = e.relationshipKind ? w.relationship(e.relationshipKind) : null;
  if (rel) details.push({ term: w.h("capacity"), value: rel });
  // KNOWN hours only, each figure named for what it is. A day-record sum and a
  // period figure are separate lines; neither is a day count.
  if (e.dayHours !== null) {
    details.push({
      term: w.t("hoursTerm"),
      value: w.t("hoursRecorded", { hours: w.hours(e.dayHours), count: e.dayRecords }),
    });
  }
  if (e.periodHours !== null) {
    details.push({
      term: w.t("hoursTerm"),
      value: w.t("hoursPeriod", { hours: w.hours(e.periodHours), count: e.periodRecords }),
    });
  }
  const kind = e.sourceKind ? w.sourceKind(e.sourceKind) : null;
  const sourceBits = [kind, e.reconstructed ? w.h("reconstructed") : null].filter(
    (x): x is string => !!x,
  );
  if (sourceBits.length > 0) details.push({ term: w.h("source"), value: sourceBits.join(" · ") });

  const attestedAs = e.attestedByRole ? w.role(e.attestedByRole) : null;
  const proof = e.proof
    .filter((c) => c !== "SUPERVISOR_CONFIRMED")
    .map((c) => ({
      concept: c,
      text:
        c === "EVIDENCE_SUPPORTED" && attestedAs
          ? `${w.h(`proof.${c}`)} · ${w.h("attestedAs", { role: attestedAs })}`
          : w.h(`proof.${c}`),
    }));

  return { heading, subheading, period, details, proof, contested: e.contested };
}
