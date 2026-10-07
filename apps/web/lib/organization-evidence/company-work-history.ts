import type { EvidenceRecordView } from "./import-core";

/**
 * THE COMPANY'S IMPORTED WORK HISTORY, SEEN FROM THE PLACE (pure read model).
 *
 * `organization_evidence_records` held a company's real historical timesheet
 * (one record per person-day, plus period aggregates) and the only human
 * surface was a flat, session-bound record list inside the import door. This
 * folds the SAME records into the shape a person thinks in: WHERE the work
 * was, WHEN, WHO worked there, WHAT was done, HOW MANY hours.
 *
 * Nothing here is written, invented or inferred beyond the records:
 *   · a record's place is its resolved work object, else its own source label,
 *     else "no place stated" — never a guess;
 *   · hours are the records' stated hours, summed once; a PERIOD record
 *     (start–end, no single day) is counted apart and never painted onto days;
 *   · customer / address / project are reported as PRESENT or ABSENT from the
 *     data (`PlaceScope`), so the surface can say exactly what the import did
 *     and did not carry — no fixture fills the gap.
 */

export interface PlaceObjectFacts {
  readonly id: string;
  readonly name: string;
  readonly addressLine: string | null;
  readonly city: string | null;
  readonly projectId: string | null;
  readonly archived: boolean;
}

export interface PlaceScope {
  /** A project is linked to the work object. */
  readonly hasProject: boolean;
  /** A street/city address is stored on the work object. */
  readonly hasAddress: boolean;
  /** That address as text ("street number, city"), or null. */
  readonly addressText: string | null;
}

export interface PlaceGroup {
  /** `o:<workObjectId>`, `l:<label>` or `none`. Stable, URL-safe after encode. */
  readonly key: string;
  readonly kind: "object" | "label" | "none";
  /** Display name: the object's name, else the source label. */
  readonly name: string | null;
  readonly objectId: string | null;
  readonly scope: PlaceScope;
  readonly records: readonly EvidenceRecordView[];
  /** Hours of dated (day) records. */
  readonly dayHours: number;
  /** Hours of period aggregates, kept apart. */
  readonly periodHours: number;
  readonly dayCount: number;
  readonly periodCount: number;
  readonly firstDate: string | null;
  readonly lastDate: string | null;
  readonly people: readonly { readonly id: string; readonly name: string | null; readonly hours: number }[];
}

export interface CompanyWorkHistory {
  readonly places: readonly PlaceGroup[];
  readonly totalRecords: number;
  readonly totalHours: number;
  readonly periodHours: number;
  readonly peopleCount: number;
  readonly firstDate: string | null;
  readonly lastDate: string | null;
  /** Records placed on a resolved work object / only on a source label / on neither. */
  readonly byPlacement: { readonly object: number; readonly label: number; readonly none: number };
}

export function placeKeyOf(r: Pick<EvidenceRecordView, "workObjectId" | "contextLabel">): string {
  if (r.workObjectId) return `o:${r.workObjectId}`;
  const label = r.contextLabel?.trim();
  return label ? `l:${label}` : "none";
}

const isPeriod = (r: EvidenceRecordView) =>
  r.activityDate === null && r.periodStart !== null && r.periodEnd !== null;

function minMax(dates: readonly (string | null)[]): [string | null, string | null] {
  const ds = dates.filter((d): d is string => !!d).sort();
  return ds.length ? [ds[0]!, ds[ds.length - 1]!] : [null, null];
}

export function buildCompanyWorkHistory(
  records: readonly EvidenceRecordView[],
  objects: readonly PlaceObjectFacts[],
): CompanyWorkHistory {
  const live = records.filter((r) => !r.withdrawn);
  const objById = new Map(objects.map((o) => [o.id, o]));
  const buckets = new Map<string, EvidenceRecordView[]>();
  for (const r of live) {
    const k = placeKeyOf(r);
    const arr = buckets.get(k);
    if (arr) arr.push(r);
    else buckets.set(k, [r]);
  }

  const places: PlaceGroup[] = [...buckets.entries()].map(([key, recs]) => {
    const kind = key.startsWith("o:") ? "object" : key.startsWith("l:") ? "label" : "none";
    const objectId = kind === "object" ? key.slice(2) : null;
    const obj = objectId ? objById.get(objectId) : undefined;
    const name =
      kind === "object"
        ? (obj?.name ?? recs.find((r) => r.contextLabel)?.contextLabel ?? null)
        : kind === "label"
          ? key.slice(2)
          : null;
    const day = recs.filter((r) => !isPeriod(r));
    const per = recs.filter(isPeriod);
    const [first, last] = minMax(
      recs.flatMap((r) => [r.activityDate, r.periodStart, r.periodEnd]),
    );
    const byPerson = new Map<string, { id: string; name: string | null; hours: number }>();
    for (const r of recs) {
      const p = byPerson.get(r.personId) ?? { id: r.personId, name: r.personName, hours: 0 };
      p.hours += r.hours ?? 0;
      byPerson.set(r.personId, p);
    }
    return {
      key,
      kind,
      name,
      objectId,
      scope: {
        hasProject: !!obj?.projectId,
        hasAddress: !!(obj?.addressLine || obj?.city),
        addressText: obj ? [obj.addressLine, obj.city].filter(Boolean).join(", ") || null : null,
      },
      records: [...recs].sort((a, b) =>
        (b.activityDate ?? b.periodStart ?? "").localeCompare(a.activityDate ?? a.periodStart ?? ""),
      ),
      dayHours: day.reduce((s, r) => s + (r.hours ?? 0), 0),
      periodHours: per.reduce((s, r) => s + (r.hours ?? 0), 0),
      dayCount: day.length,
      periodCount: per.length,
      firstDate: first,
      lastDate: last,
      people: [...byPerson.values()].sort((a, b) => b.hours - a.hours),
    } satisfies PlaceGroup;
  });

  // Placed places first (most hours first); "no place stated" always last.
  places.sort((a, b) => {
    if ((a.kind === "none") !== (b.kind === "none")) return a.kind === "none" ? 1 : -1;
    return b.dayHours + b.periodHours - (a.dayHours + a.periodHours);
  });

  const [first, last] = minMax(live.flatMap((r) => [r.activityDate, r.periodStart, r.periodEnd]));
  return {
    places,
    totalRecords: live.length,
    totalHours: live.reduce((s, r) => s + (r.hours ?? 0), 0),
    periodHours: live.filter(isPeriod).reduce((s, r) => s + (r.hours ?? 0), 0),
    peopleCount: new Set(live.map((r) => r.personId)).size,
    firstDate: first,
    lastDate: last,
    byPlacement: {
      object: live.filter((r) => r.workObjectId).length,
      label: live.filter((r) => !r.workObjectId && r.contextLabel?.trim()).length,
      none: live.filter((r) => !r.workObjectId && !r.contextLabel?.trim()).length,
    },
  };
}
