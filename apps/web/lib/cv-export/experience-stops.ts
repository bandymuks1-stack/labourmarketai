import type { ExperienceOrganization, ProfessionalExperience } from "@/lib/journal/professional-experience";
import { PROFESSIONAL_HISTORY_RELATIONSHIPS } from "@/lib/player-card/work-history-model";

/**
 * THE HISTORY ENTRIES THE ENGAGEMENT LIST CANNOT SHOW (decision 0025).
 *
 * The Living CV listed the person's engagements (`workHistory`, employment
 * relationships only) and the organization's record groups — but never the
 * ONE reading's organization rows. So two kinds of real history had no entry
 * of their own, for every user:
 *   · an EARLIER LEGAL ENTITY the continuing organization states a period for
 *     (owner 2026-10-17: a separate legal person of the time — e.g. a business
 *     later sold and continued under a new entity) — only a subtitle "band" on
 *     individual record rows;
 *   · LEADERSHIP held through ownership or a governing membership, or a
 *     manager/owner engagement — not an employment relationship, so absent
 *     from `workHistory`.
 *
 * This selects exactly those rows from `professionalExperience.organizations`
 * — never a second reading, never a row the engagement list already shows —
 * with what is known: roles (derived ones marked), dates (null = not
 * documented, never invented), and the counted hours of that row.
 */
export type ExperienceStop = {
  readonly key: string;
  readonly kind: "organization" | "earlier_legal_entity";
  readonly name: string | null;
  /** Earlier-entity stops: the organization that administers the records today. */
  readonly administeredByName: string | null;
  readonly legalEntityRelation: string | null;
  readonly roles: readonly {
    readonly relationship: string;
    readonly derived: boolean;
    readonly current: boolean;
  }[];
  readonly from: string | null;
  readonly to: string | null;
  readonly current: boolean;
  /** Counted hours of the row (journal + organization); null when none. */
  readonly hours: number | null;
};

const EMPLOYMENT = new Set<string>(PROFESSIONAL_HISTORY_RELATIONSHIPS as readonly string[]);

/** A role the engagement list does not carry: governing membership, a derived
 *  earlier-entity role, or a non-employment relationship (owner, manager…). */
function outsideEngagementList(role: ExperienceOrganization["roles"][number]): boolean {
  return role.source === "membership" || role.derived === true || !EMPLOYMENT.has(role.relationship);
}

export function experienceStopsOf(pe: ProfessionalExperience | null | undefined): ExperienceStop[] {
  if (!pe) return [];
  const out: ExperienceStop[] = [];
  for (const o of pe.organizations) {
    if (o.kind === "personal") continue;
    const roles = o.roles.filter(outsideEngagementList);
    const isEarlier = o.kind === "earlier_legal_entity";
    if (!isEarlier && roles.length === 0) continue;
    // A start comes only from starts, an end only from ends — an unknown end
    // is never filled with a start date.
    const starts = roles.map((r) => r.startedAt).filter((d): d is string => !!d).sort();
    const ends = roles.map((r) => r.endedAt).filter((d): d is string => !!d).sort();
    const from = o.from ?? starts[0] ?? null;
    const to = o.to ?? (roles.some((r) => r.current) ? null : (ends[ends.length - 1] ?? null));
    out.push({
      key: `stop:${o.key}`,
      kind: isEarlier ? "earlier_legal_entity" : "organization",
      name: o.organizationName ?? o.legalEntityLabel,
      administeredByName: isEarlier ? (o.administeredBy?.organizationName ?? null) : null,
      legalEntityRelation: o.legalEntityRelation,
      roles: roles.map((r) => ({ relationship: r.relationship, derived: r.derived === true, current: r.current })),
      from,
      to,
      current: !isEarlier && roles.some((r) => r.current),
      hours: o.totalHours > 0 ? o.totalHours : null,
    });
  }
  // Current first, then the most recent end; undated rows last.
  return out.sort(
    (a, b) =>
      Number(b.current) - Number(a.current) || (b.to ?? b.from ?? "").localeCompare(a.to ?? a.from ?? ""),
  );
}
