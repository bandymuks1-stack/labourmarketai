import type {
  JournalAllTimeLine,
  WorkIntelligence,
  WorkIntelligenceOrganizationPeriodRecord,
  WorkIntelligenceOrganizationRecord,
} from "@/lib/journal/work-intelligence";

/**
 * ONE PERSON = ONE CONTINUOUS PROFESSIONAL HISTORY (owner decision 0025,
 * 2026-10-17). Pure: no IO, no clock, no i18n.
 *
 * Until this module the product kept three readings of a person's work apart
 * and refused to add them: the journal (their own entries), the organization
 * ledger (day records and imported period records about them) and the
 * organizations they lead (ownership / management, no hours). The owner saw
 * "25.6 h in the journal" and "800 h in organization history" and no
 * figure that said what their professional experience adds up to.
 *
 * This reading answers that with ONE total and keeps every provenance apart
 * inside it. Rules, pinned by professional-experience.test.ts:
 *
 *  1. EVERY WORK HOUR ONCE. A journal entry counts once (the canonical
 *     work-time rule). An organization day record that describes a live
 *     journal entry (`journalEntryId`) is the SAME work — listed, not added.
 *     A period record whose span holds a same-organization day record may be
 *     a summary of those days — listed, not added (the pinned all-time rule
 *     of organization-all-time.ts). Journal hours on days inside a counted
 *     same-organization period are listed as "within the organization's
 *     period" and not added: the organization's figure stands, the person's
 *     entries stay the detail. Nothing is hidden: every line says whether it
 *     was counted and why not.
 *  2. NO INVENTED DAYS. A period record keeps its span and its one figure;
 *     it is never spread over days, weeks or months.
 *  3. PROVENANCE STAYS VISIBLE. Every line names its source (journal /
 *     organization day records / organization period record) and its
 *     evidence level (own record / manager-confirmed / organization-reported).
 *     A confirmation state never hides experience: recorded work counts, and
 *     the confirmed part is a sub-figure of it.
 *  4. ROLES ARE EXPERIENCE WITHOUT HOURS. Ownership, management and every
 *     other relationship to an organization is part of the person's history
 *     (a director without a roster row still led the company). A role carries
 *     the organization's stated business periods (an earlier trading name of
 *     the same business) but NEVER hours: the organization's project hours
 *     are its people's work, never the leader's personal hours (owner rule
 *     2026-10-17 §5).
 *  5. UNKNOWN ≠ ZERO. A journal that could not be read makes `hours` null;
 *     an organization ledger that could not be read sets
 *     `organizationUnknown` and adds nothing. Neither renders as "no work".
 *  6. NO SCORE, NO RANK. Hours and spans, as recorded.
 */

/** An earlier business period the organization states about itself
 *  (`organization_history_periods`): continuity of the SAME business history
 *  under another name. Not a legal-identity claim. */
export type ExperienceBusinessPeriod = {
  readonly id: string;
  readonly label: string;
  /** ISO day or null = not documented (never open-ended). */
  readonly from: string | null;
  readonly to: string | null;
  readonly basis: string;
  readonly legalEntityRelation: string;
};

/**
 * One relationship the person has or had with an organization: a job, a
 * placement, ownership, management. The membership spine as the profile and
 * the Living CV already read it (`engagement_contexts`, and for leadership
 * the governing membership). Carries NO hours of its own.
 */
export type ExperienceRelationship = {
  /** `engagement_contexts.id` when the relationship is an engagement row;
   *  null for a governing membership that has no engagement row. */
  readonly engagementContextId: string | null;
  readonly organizationId: string | null;
  readonly organizationName: string | null;
  /** Canonical relationship slug: employee / owner / manager / freelancer … */
  readonly relationship: string;
  readonly title: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly current: boolean;
  readonly source: "engagement" | "membership";
  readonly businessPeriods: readonly ExperienceBusinessPeriod[];
};

export type ExperienceHourSource = "journal" | "organization_day" | "organization_period";

export type ExperienceEvidence = "own_record" | "manager_confirmed" | "organization_reported";

export type ExperienceNotCountedReason =
  | "describes_journal_entry"
  | "period_spans_day_records"
  | "journal_within_organization_period";

/** One line of the person's experience: a figure, where it came from, and
 *  whether the total holds it. */
export type ExperienceHourLine = {
  readonly key: string;
  readonly source: ExperienceHourSource;
  readonly evidence: ExperienceEvidence;
  readonly organizationId: string | null;
  readonly organizationName: string | null;
  readonly engagementContextId: string | null;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly place: string | null;
  /** Free text the source gave for the work (a context cell, a title). */
  readonly label: string | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly hours: number;
  /** Of `hours`, confirmed by a manager (journal lines only; 0 elsewhere). */
  readonly confirmedHours: number;
  readonly records: number;
  readonly counted: boolean;
  readonly notCountedReason: ExperienceNotCountedReason | null;
  /** Period lines: how the span came to be (`source` | `human_choice` | `derived`). */
  readonly spanProvenance: "source" | "human_choice" | "derived" | null;
};

export type ExperienceRole = Pick<
  ExperienceRelationship,
  "relationship" | "title" | "startedAt" | "endedAt" | "current" | "source" | "engagementContextId"
>;

export type ExperienceOrganization = {
  readonly key: string;
  /** null = the person's own, organization-less records. */
  readonly organizationId: string | null;
  readonly organizationName: string | null;
  readonly roles: readonly ExperienceRole[];
  readonly businessPeriods: readonly ExperienceBusinessPeriod[];
  readonly journalHours: number;
  readonly journalConfirmedHours: number;
  readonly organizationHours: number;
  readonly notCountedHours: number;
  /** journalHours + organizationHours — counted lines only. */
  readonly totalHours: number;
  readonly entries: number;
  readonly records: number;
  readonly from: string | null;
  readonly to: string | null;
};

export type ExperienceProject = {
  readonly key: string;
  readonly projectId: string;
  readonly projectName: string | null;
  readonly organizationId: string | null;
  readonly organizationName: string | null;
  readonly journalHours: number;
  readonly organizationHours: number;
  readonly totalHours: number;
  readonly from: string | null;
  readonly to: string | null;
};

export type ProfessionalExperienceHours = {
  /** Every counted line, once. */
  readonly total: number;
  readonly journal: number;
  readonly journalConfirmed: number;
  readonly organizationDays: number;
  readonly organizationPeriods: number;
  /** Hours listed but not added (overlaps, same work described twice). */
  readonly notCounted: number;
  /** The organization ledger could not be read: the total holds the journal
   *  only and says so. */
  readonly organizationUnknown: boolean;
};

export type ProfessionalExperience = {
  /** null = the journal could not be read (UNKNOWN, never zero). */
  readonly hours: ProfessionalExperienceHours | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly lines: readonly ExperienceHourLine[];
  readonly organizations: readonly ExperienceOrganization[];
  readonly projects: readonly ExperienceProject[];
  /** Every relationship, with or without hours — leadership included. */
  readonly roles: readonly ExperienceRelationship[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const PERSONAL_KEY = "personal";

type OrgRef = { readonly organizationId: string | null; readonly organizationName: string | null };

function minDay(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a < b ? a : b;
}
function maxDay(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

function recordLabel(r: WorkIntelligenceOrganizationRecord | WorkIntelligenceOrganizationPeriodRecord): string | null {
  const c = r.context;
  if (!c) return null;
  return c.project?.name ?? c.place?.name ?? null;
}

export function deriveProfessionalExperience(input: {
  readonly wi: WorkIntelligence | null;
  readonly relationships?: readonly ExperienceRelationship[] | null;
  /** Project id → name, for journal lines (the records carry their own). */
  readonly projectNames?: ReadonlyMap<string, string> | null;
}): ProfessionalExperience {
  const relationships = input.relationships ?? [];
  const projectNames = input.projectNames ?? new Map<string, string>();

  // ── who the person's contexts belong to ──────────────────────────────
  const orgByContext = new Map<string, OrgRef>();
  const orgNameById = new Map<string, string>();
  const periodsByOrg = new Map<string, ExperienceBusinessPeriod[]>();
  for (const r of relationships) {
    if (r.engagementContextId) {
      orgByContext.set(r.engagementContextId, {
        organizationId: r.organizationId,
        organizationName: r.organizationName,
      });
    }
    if (r.organizationId) {
      if (r.organizationName && !orgNameById.has(r.organizationId)) {
        orgNameById.set(r.organizationId, r.organizationName);
      }
      const list = periodsByOrg.get(r.organizationId) ?? [];
      for (const p of r.businessPeriods) if (!list.some((x) => x.id === p.id)) list.push(p);
      periodsByOrg.set(r.organizationId, list);
    }
  }
  const nameOf = (organizationId: string | null, fallback: string | null): string | null =>
    (organizationId ? orgNameById.get(organizationId) : null) ?? fallback ?? null;

  const wi = input.wi;
  const lines: ExperienceHourLine[] = [];

  if (wi) {
    const liveEntryIds = new Set(wi.entryIds);
    const organizationUnknown = wi.organizationRecords === null;
    const dayRecords = organizationUnknown
      ? []
      : (wi.organizationDayRecords ?? wi.organizationContextRecords ?? []).filter(
          (r) => r.status !== "rejected" && Number.isFinite(r.hours) && r.hours > 0,
        );
    const periodRecords = organizationUnknown ? [] : (wi.organizationPeriodRecords ?? []);

    // ── organization day records, grouped by what they describe ──────────
    type DayAcc = {
      organizationId: string;
      projectId: string | null;
      projectName: string | null;
      place: string | null;
      describesJournal: boolean;
      supplierName: string | null;
      hours: number;
      records: number;
      from: string | null;
      to: string | null;
    };
    const dayAcc = new Map<string, DayAcc>();
    for (const r of dayRecords) {
      const describesJournal = r.journalEntryId !== null && liveEntryIds.has(r.journalEntryId);
      const projectId = r.context?.project?.id ?? null;
      const place = r.context?.place?.name ?? null;
      const key = [r.organizationId, projectId ?? "", place ?? "", describesJournal ? "j" : "o"].join("|");
      let a = dayAcc.get(key);
      if (!a) {
        a = {
          organizationId: r.organizationId,
          projectId,
          projectName: r.context?.project?.name ?? null,
          place,
          describesJournal,
          supplierName: r.context?.source.supplierName ?? null,
          hours: 0,
          records: 0,
          from: null,
          to: null,
        };
        dayAcc.set(key, a);
      }
      a.hours += r.hours;
      a.records += 1;
      a.from = minDay(a.from, r.workDate);
      a.to = maxDay(a.to, r.workDate);
    }
    for (const [key, a] of dayAcc) {
      lines.push({
        key: `day:${key}`,
        source: "organization_day",
        evidence: "organization_reported",
        organizationId: a.organizationId,
        organizationName: nameOf(a.organizationId, a.supplierName),
        engagementContextId: null,
        projectId: a.projectId,
        projectName: a.projectName,
        place: a.place,
        label: null,
        from: a.from,
        to: a.to,
        hours: round2(a.hours),
        confirmedHours: 0,
        records: a.records,
        counted: !a.describesJournal,
        notCountedReason: a.describesJournal ? "describes_journal_entry" : null,
        spanProvenance: null,
      });
    }

    // ── period records: one figure over a span, never spread ─────────────
    const countedPeriods: WorkIntelligenceOrganizationPeriodRecord[] = [];
    for (const p of periodRecords) {
      const spansDayRecords = dayRecords.some(
        (d) => d.organizationId === p.organizationId && d.workDate >= p.periodStart && d.workDate <= p.periodEnd,
      );
      if (!spansDayRecords) countedPeriods.push(p);
      lines.push({
        key: `period:${p.id}`,
        source: "organization_period",
        evidence: "organization_reported",
        organizationId: p.organizationId,
        organizationName: nameOf(p.organizationId, p.context?.source.supplierName ?? null),
        engagementContextId: null,
        projectId: p.context?.project?.id ?? null,
        projectName: p.context?.project?.name ?? null,
        place: p.context?.place?.name ?? null,
        label: recordLabel(p),
        from: p.periodStart,
        to: p.periodEnd,
        hours: round2(p.hours),
        confirmedHours: 0,
        records: 1,
        counted: !spansDayRecords,
        notCountedReason: spansDayRecords ? "period_spans_day_records" : null,
        spanProvenance: p.provenance,
      });
    }

    // ── journal lines: the person's own record, once per entry ───────────
    const insideCountedPeriod = (organizationId: string | null, day: string): boolean =>
      organizationId !== null &&
      countedPeriods.some(
        (p) => p.organizationId === organizationId && day >= p.periodStart && day <= p.periodEnd,
      );
    const journalLine = (
      l: JournalAllTimeLine,
      org: OrgRef,
      days: JournalAllTimeLine["hoursByDay"],
      counted: boolean,
      entries: number,
    ): ExperienceHourLine => {
      const hours = round2(days.reduce((s, d) => s + d.hours, 0));
      const confirmed = round2(days.reduce((s, d) => s + d.confirmedHours, 0));
      return {
        key: `journal:${l.engagementContextId ?? ""}|${l.projectId ?? ""}|${counted ? "c" : "p"}`,
        source: "journal",
        evidence: confirmed > 0 ? "manager_confirmed" : "own_record",
        organizationId: org.organizationId,
        organizationName: org.organizationName,
        engagementContextId: l.engagementContextId,
        projectId: l.projectId,
        projectName: l.projectId ? (projectNames.get(l.projectId) ?? null) : null,
        place: null,
        label: null,
        from: days[0]?.day ?? null,
        to: days[days.length - 1]?.day ?? null,
        hours,
        confirmedHours: confirmed,
        records: entries,
        counted,
        notCountedReason: counted ? null : "journal_within_organization_period",
        spanProvenance: null,
      };
    };
    for (const l of wi.journalAllTime) {
      const org: OrgRef = (l.engagementContextId ? orgByContext.get(l.engagementContextId) : null) ?? {
        organizationId: null,
        organizationName: null,
      };
      const outside = l.hoursByDay.filter((d) => !insideCountedPeriod(org.organizationId, d.day));
      const inside = l.hoursByDay.filter((d) => insideCountedPeriod(org.organizationId, d.day));
      // Entries without a duration still belong to the counted line: they
      // are the person's record even when no hour can be summed.
      if (outside.length > 0 || inside.length === 0) {
        lines.push(journalLine(l, org, outside, true, l.entries));
      }
      if (inside.length > 0) lines.push(journalLine(l, org, inside, false, outside.length === 0 ? l.entries : 0));
    }
  }

  // ── totals ───────────────────────────────────────────────────────────
  let hours: ProfessionalExperienceHours | null = null;
  if (wi) {
    let journal = 0;
    let journalConfirmed = 0;
    let organizationDays = 0;
    let organizationPeriods = 0;
    let notCounted = 0;
    for (const l of lines) {
      if (!l.counted) {
        notCounted += l.hours;
        continue;
      }
      if (l.source === "journal") {
        journal += l.hours;
        journalConfirmed += l.confirmedHours;
      } else if (l.source === "organization_day") organizationDays += l.hours;
      else organizationPeriods += l.hours;
    }
    hours = {
      total: round2(journal + organizationDays + organizationPeriods),
      journal: round2(journal),
      journalConfirmed: round2(journalConfirmed),
      organizationDays: round2(organizationDays),
      organizationPeriods: round2(organizationPeriods),
      notCounted: round2(notCounted),
      organizationUnknown: wi.organizationRecords === null,
    };
  }

  let from: string | null = null;
  let to: string | null = null;
  for (const l of lines) {
    if (!l.counted) continue;
    from = minDay(from, l.from);
    to = maxDay(to, l.to);
  }

  // ── per organization: hours by source + roles + business periods ─────
  const orgAcc = new Map<string, ExperienceOrganization>();
  const orgKey = (id: string | null) => id ?? PERSONAL_KEY;
  const ensureOrg = (id: string | null, name: string | null): ExperienceOrganization => {
    const key = orgKey(id);
    let o = orgAcc.get(key);
    if (!o) {
      o = {
        key,
        organizationId: id,
        organizationName: nameOf(id, name),
        roles: [],
        businessPeriods: id ? (periodsByOrg.get(id) ?? []) : [],
        journalHours: 0,
        journalConfirmedHours: 0,
        organizationHours: 0,
        notCountedHours: 0,
        totalHours: 0,
        entries: 0,
        records: 0,
        from: null,
        to: null,
      };
      orgAcc.set(key, o);
    } else if (o.organizationName === null && name) {
      o = { ...o, organizationName: name };
      orgAcc.set(key, o);
    }
    return o;
  };
  for (const r of relationships) {
    const o = ensureOrg(r.organizationId, r.organizationName);
    orgAcc.set(o.key, {
      ...o,
      roles: [
        ...o.roles,
        {
          relationship: r.relationship,
          title: r.title,
          startedAt: r.startedAt,
          endedAt: r.endedAt,
          current: r.current,
          source: r.source,
          engagementContextId: r.engagementContextId,
        },
      ],
    });
  }
  for (const l of lines) {
    const o = ensureOrg(l.organizationId, l.organizationName);
    const next: ExperienceOrganization = {
      ...o,
      journalHours: o.journalHours + (l.counted && l.source === "journal" ? l.hours : 0),
      journalConfirmedHours: o.journalConfirmedHours + (l.counted && l.source === "journal" ? l.confirmedHours : 0),
      organizationHours: o.organizationHours + (l.counted && l.source !== "journal" ? l.hours : 0),
      notCountedHours: o.notCountedHours + (l.counted ? 0 : l.hours),
      totalHours: 0,
      entries: o.entries + (l.source === "journal" ? l.records : 0),
      records: o.records + (l.source === "journal" ? 0 : l.records),
      from: l.counted ? minDay(o.from, l.from) : o.from,
      to: l.counted ? maxDay(o.to, l.to) : o.to,
    };
    orgAcc.set(o.key, next);
  }
  const organizations = [...orgAcc.values()]
    .map((o) => ({
      ...o,
      journalHours: round2(o.journalHours),
      journalConfirmedHours: round2(o.journalConfirmedHours),
      organizationHours: round2(o.organizationHours),
      notCountedHours: round2(o.notCountedHours),
      totalHours: round2(o.journalHours + o.organizationHours),
    }))
    .sort(
      (x, y) =>
        y.totalHours - x.totalHours ||
        y.roles.length - x.roles.length ||
        (x.organizationName ?? "").localeCompare(y.organizationName ?? "") ||
        x.key.localeCompare(y.key),
    );

  // ── per project: counted hours only; a project the records name ──────
  const projAcc = new Map<string, ExperienceProject>();
  for (const l of lines) {
    if (!l.counted || !l.projectId) continue;
    const key = `${l.organizationId ?? ""}|${l.projectId}`;
    const p = projAcc.get(key) ?? {
      key,
      projectId: l.projectId,
      projectName: l.projectName,
      organizationId: l.organizationId,
      organizationName: l.organizationName,
      journalHours: 0,
      organizationHours: 0,
      totalHours: 0,
      from: null,
      to: null,
    };
    projAcc.set(key, {
      ...p,
      projectName: p.projectName ?? l.projectName,
      journalHours: p.journalHours + (l.source === "journal" ? l.hours : 0),
      organizationHours: p.organizationHours + (l.source === "journal" ? 0 : l.hours),
      totalHours: 0,
      from: minDay(p.from, l.from),
      to: maxDay(p.to, l.to),
    });
  }
  const projects = [...projAcc.values()]
    .map((p) => ({
      ...p,
      journalHours: round2(p.journalHours),
      organizationHours: round2(p.organizationHours),
      totalHours: round2(p.journalHours + p.organizationHours),
    }))
    .sort((x, y) => y.totalHours - x.totalHours || (x.projectName ?? "").localeCompare(y.projectName ?? ""));

  const sortedLines = lines
    .slice()
    .sort(
      (x, y) =>
        Number(y.counted) - Number(x.counted) ||
        y.hours - x.hours ||
        (y.to ?? "").localeCompare(x.to ?? "") ||
        x.key.localeCompare(y.key),
    );

  return {
    hours,
    from,
    to,
    lines: sortedLines,
    organizations,
    projects,
    roles: relationships,
  };
}
