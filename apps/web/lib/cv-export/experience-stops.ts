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
    /** The role's OWN dates (null = not documented) — never a work span. */
    readonly startedAt: string | null;
    readonly endedAt: string | null;
    /** `membership` = a governing membership; `engagement` = an engagement row. */
    readonly source: string;
    /** The engagement row behind an engagement role (null for a membership) —
     *  what ties the role to the journal work recorded in that context. */
    readonly engagementContextId: string | null;
  }[];
  readonly from: string | null;
  readonly to: string | null;
  readonly current: boolean;
  /** Earlier-entity stops only: the counted hours of work under that entity.
   *  Leadership stops carry none — the organization's work hours are not
   *  hours performed in a leadership role. */
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
    // is never filled with a start date. A LEADERSHIP stop is dated by its
    // roles alone: the organization's work-record span is not when someone
    // led it. An earlier entity keeps its stated period, roles as fallback.
    const starts = roles.map((r) => r.startedAt).filter((d): d is string => !!d).sort();
    const ends = roles.map((r) => r.endedAt).filter((d): d is string => !!d).sort();
    const roleFrom = starts[0] ?? null;
    const roleTo = roles.some((r) => r.current) ? null : (ends[ends.length - 1] ?? null);
    const from = isEarlier ? (o.from ?? roleFrom) : roleFrom;
    const to = isEarlier ? (o.to ?? roleTo) : roleTo;
    out.push({
      key: `stop:${o.key}`,
      kind: isEarlier ? "earlier_legal_entity" : "organization",
      name: o.organizationName ?? o.legalEntityLabel,
      administeredByName: isEarlier ? (o.administeredBy?.organizationName ?? null) : null,
      legalEntityRelation: o.legalEntityRelation,
      roles: roles.map((r) => ({
        relationship: r.relationship,
        derived: r.derived === true,
        current: r.current,
        startedAt: r.startedAt ?? null,
        endedAt: r.endedAt ?? null,
        source: r.source,
        engagementContextId: r.engagementContextId ?? null,
      })),
      from,
      to,
      current: !isEarlier && roles.some((r) => r.current),
      hours: isEarlier && o.totalHours > 0 ? o.totalHours : null,
    });
  }
  // Current first, then the most recent end; undated rows last.
  return out.sort(
    (a, b) =>
      Number(b.current) - Number(a.current) || (b.to ?? b.from ?? "").localeCompare(a.to ?? a.from ?? ""),
  );
}
