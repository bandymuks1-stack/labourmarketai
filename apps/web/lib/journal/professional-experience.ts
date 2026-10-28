import {
  deriveHoursLedger,
  type ConfidenceWeights,
  type HoursLedger,
  type HoursState,
  type LineStateSplit,
  type SkillLink,
} from "@/lib/journal/hours-ledger";
import type {
  JournalAllTimeLine,
  WorkIntelligence,
  WorkIntelligenceOrganizationPeriodRecord,
  WorkIntelligenceOrganizationRecord,
} from "@/lib/journal/work-intelligence";
import { innerPeriodBound } from "@/lib/organization-evidence/business-history";
import type { HistoryContext } from "@/lib/organization-evidence/professional-history-context";

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
 *  7. ONE HOURS LEDGER (owner order 2026-10-24). The total is the ledger's
 *     total (`hours-ledger.ts`): states (actual / reported / estimated /
 *     confirmed), confidence, the overlap-capacity check and the skill split
 *     are read over these same lines, never over a second ledger.
 *  8. PERFORMER AT THE TIME BY DATE. A record no source label places is
 *     placed in a stated EARLIER LEGAL ENTITY (sold / succeeded — never a
 *     former name) when its whole span lies inside that entity's DATED
 *     period (the bounds' precision respected: only a record certainly
 *     inside is placed). An undated period places nothing by date — UNKNOWN
 *     is never guessed.
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
  /** The legal entity as then named (null = the period label stands for it). */
  readonly legalEntityLabel: string | null;
  /** The source labels (sheet names) that place a record in this period. */
  readonly sourceLabels: readonly string[];
  /** How precisely each bound is known (absent = to the day, as stated). */
  readonly fromPrecision?: "day" | "month" | "year" | null;
  readonly toPrecision?: "day" | "month" | "year" | null;
};

/** The legal-entity relations under which an earlier period's label is a
 *  FORMER NAME of the same organization — the organization then carries ONE
 *  identity with a name history ("X, formerly Y"). `not_asserted`,
 *  `successor` and `sold_and_continued_by_new_entity` are continuity of the
 *  business history, not of the legal person, and never rename anything. */
export const FORMER_NAME_RELATIONS: ReadonlySet<string> = new Set(["renamed", "same_entity"]);

/** The former names an organization's live period statements establish. */
export function formerNamesOf(periods: readonly ExperienceBusinessPeriod[]): string[] {
  const out: string[] = [];
  for (const p of periods) {
    if (!FORMER_NAME_RELATIONS.has(p.legalEntityRelation)) continue;
    const name = p.label.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

const normLabel = (s: string | null | undefined) => (s ?? "").normalize("NFKC").trim().toLocaleLowerCase();

/** The stated period a record's source label belongs to, or null. */
export function periodFor(
  sourceLabel: string | null | undefined,
  periods: readonly ExperienceBusinessPeriod[],
): ExperienceBusinessPeriod | null {
  const key = normLabel(sourceLabel);
  if (!key) return null;
  return periods.find((p) => p.sourceLabels.some((l) => normLabel(l) === key)) ?? null;
}

/** The ONE stated dated period whose span certainly holds [from, to], or
 *  null. A period with an unknown bound places nothing by date; when two
 *  dated periods hold the span (overlapping statements) none is chosen — the
 *  record stays with the organization that administers it. */
export function periodForDates(
  from: string | null,
  to: string | null,
  periods: readonly ExperienceBusinessPeriod[],
): ExperienceBusinessPeriod | null {
  if (!from || !to) return null;
  const holding = periods.filter((p) => {
    if (!p.from || !p.to) return false;
    const a = innerPeriodBound(p.from, p.fromPrecision, "start");
    const b = innerPeriodBound(p.to, p.toPrecision, "end");
    return a <= b && from >= a && to <= b;
  });
  return holding.length === 1 ? holding[0] : null;
}

/** The stated period LABEL a record's source label belongs to, or null. */
export function periodLabelFor(
  sourceLabel: string | null | undefined,
  periods: readonly ExperienceBusinessPeriod[],
): string | null {
  const key = normLabel(sourceLabel);
  if (!key) return null;
  for (const p of periods) {
    if (p.sourceLabels.some((l) => normLabel(l) === key)) return p.label;
  }
  return null;
}

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

/** How a line was placed in a stated business period. */
export type ExperiencePeriodPlacement = "source_label" | "date_within_period";

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
  /** The stated business period the record belongs to (resolved from its
   *  source label against the organization's period statements the viewer
   *  can read); null = not placed / no statements readable. */
  readonly periodLabel: string | null;
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
  /** How `periodLabel` was resolved (absent / null = not placed). */
  readonly periodPlacement?: ExperiencePeriodPlacement | null;
  /** Organization lines: of `hours`, attested by someone other than the
   *  person (employer, client, verifier) — the confirmed part. */
  readonly attestedHours?: number;
  /** Organization lines: of `hours`, attested by the person themselves —
   *  recorded as such, never a confirmation. */
  readonly selfAttestedHours?: number;
  /** Organization period lines: the figure's stated basis
   *  (`derived.hoursBasis`, written by a correction); absent = not stated. */
  readonly hoursBasis?: { readonly value: string; readonly method: string | null; readonly note: string | null } | null;
  /** Somebody with standing contests (part of) the line right now. */
  readonly contested?: boolean;
};

export type ExperienceRole = Pick<
  ExperienceRelationship,
  "relationship" | "title" | "startedAt" | "endedAt" | "current" | "source" | "engagementContextId"
> & {
  /** True when the role is PROJECTED onto an earlier legal entity from the
   *  owner's role in the continuing organization, by the organization's own
   *  period statement — said as such, dated by the period. */
  readonly derived?: boolean;
};

export type ExperienceOrganization = {
  readonly key: string;
  /** `organization` = an organization on the platform; `earlier_legal_entity`
   *  = a separate legal entity the continuing organization states a period
   *  for (sold / succeeded / not asserted), with the work done under it and
   *  the leadership stated for it; `personal` = organization-less records. */
  readonly kind: "organization" | "earlier_legal_entity" | "personal";
  /** The organization that holds (administers) the records: for an earlier
   *  legal entity this is the CONTINUING organization's id — the records
   *  never move. null = the person's own, organization-less records. */
  readonly organizationId: string | null;
  /** The name shown for the row: the organization, or the earlier legal
   *  entity as then named. */
  readonly organizationName: string | null;
  readonly legalEntityLabel: string | null;
  readonly legalEntityRelation: string | null;
  readonly basis: string | null;
  readonly periodId: string | null;
  /** Earlier-entity rows: who administers the records today. */
  readonly administeredBy: { readonly organizationId: string; readonly organizationName: string | null } | null;
  /** Organization rows: the earlier legal entities it continues. */
  readonly earlierEntities: readonly { readonly periodId: string; readonly label: string }[];
  readonly roles: readonly ExperienceRole[];
  readonly businessPeriods: readonly ExperienceBusinessPeriod[];
  /** Earlier names of the SAME legal entity (`FORMER_NAME_RELATIONS`). */
  readonly formerNames: readonly string[];
  /** Counted organization hours per stated business period (by the records'
   *  source labels); records no statement places are under `null`. */
  readonly byPeriod: readonly { readonly periodLabel: string | null; readonly hours: number; readonly records: number }[];
  readonly journalHours: number;
  readonly journalConfirmedHours: number;
  readonly organizationHours: number;
  readonly notCountedHours: number;
  /** Hours of this row the overlap-capacity check took from estimates. */
  readonly capacityExcessHours: number;
  /** journalHours + organizationHours − capacityExcessHours — counted lines only. */
  readonly totalHours: number;
  /** `totalHours` by ledger state (actual / reported / estimated / confirmed). */
  readonly byState: Readonly<Record<HoursState, number>>;
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
  /** Hours of this project the overlap-capacity check took from estimates. */
  readonly capacityExcessHours: number;
  /** journalHours + organizationHours − capacityExcessHours. */
  readonly totalHours: number;
  /** Counted hours by ledger state. */
  readonly byState: Readonly<Record<HoursState, number>>;
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
  /** Hours the overlap-capacity check took from estimated / reported lines
   *  (`hours-ledger.ts`); already out of `total`, itemised in `ledger`. */
  readonly capacityExcess: number;
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
  /** The ONE hours ledger over these lines: states, confidence, capacity,
   *  skill split. `ledger.total === hours.total` whenever `hours` is known. */
  readonly ledger: HoursLedger;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const zeroStates = (): Record<HoursState, number> => ({ actual: 0, reported: 0, estimated: 0, confirmed: 0 });
const roundStates = (s: Readonly<Record<HoursState, number>>): Record<HoursState, number> => ({
  actual: round2(s.actual),
  reported: round2(s.reported),
  estimated: round2(s.estimated),
  confirmed: round2(s.confirmed),
});

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

/** Confirmation facts of one organization record, from its own proof. */
function attestationOf(context: HistoryContext | undefined): { independent: boolean; self: boolean; contested: boolean } {
  const proof = context?.proof;
  if (!proof) return { independent: false, self: false, contested: false };
  const independent =
    proof.attestedByRole !== null ||
    proof.concepts.includes("INDEPENDENTLY_VERIFIED") ||
    proof.concepts.includes("EMPLOYER_CONFIRMED") ||
    proof.concepts.includes("CLIENT_ACCEPTED");
  return { independent, self: !independent && proof.concepts.includes("SELF_DECLARED"), contested: proof.contested };
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
  /** Skill links per line key (P_ij), for the ledger's skill split. */
  readonly skillLinks?: readonly SkillLink[] | null;
  /** Private confidence weights, injected by the server-side caller from
   *  configuration outside this repository; absent = bands unrated. */
  readonly confidenceWeights?: ConfidenceWeights | null;
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
  const periodOf = (
    organizationId: string | null,
    sourceLabel: string | null | undefined,
    from: string | null,
    to: string | null,
  ): { label: string | null; placement: ExperiencePeriodPlacement | null } => {
    if (!organizationId) return { label: null, placement: null };
    const periods = periodsByOrg.get(organizationId) ?? [];
    const byLabel = periodLabelFor(sourceLabel, periods);
    if (byLabel) return { label: byLabel, placement: "source_label" };
    // By date only into an EARLIER LEGAL ENTITY: work dated inside the
    // predecessor's stated span was performed by the predecessor (the
    // continuing company did not perform it). A former NAME of the same
    // entity stays label-only — a name band is not a performer.
    const byDate = periodForDates(
      from,
      to,
      periods.filter((p) => !FORMER_NAME_RELATIONS.has(p.legalEntityRelation)),
    );
    return byDate ? { label: byDate.label, placement: "date_within_period" } : { label: null, placement: null };
  };

  const wi = input.wi;
  const lines: ExperienceHourLine[] = [];
  // The ACTUAL work days behind each day-made line (journal, organization
  // day records), for the ledger's capacity check only — never on a line.
  const daysByKey = new Map<string, { day: string; hours: number }[]>();

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
      periodLabel: string | null;
      placement: ExperiencePeriodPlacement | null;
      hours: number;
      attested: number;
      selfAttested: number;
      contested: boolean;
      records: number;
      days: Map<string, number>;
      from: string | null;
      to: string | null;
    };
    const dayAcc = new Map<string, DayAcc>();
    for (const r of dayRecords) {
      const describesJournal = r.journalEntryId !== null && liveEntryIds.has(r.journalEntryId);
      const projectId = r.context?.project?.id ?? null;
      const place = r.context?.place?.name ?? null;
      const { label: periodLabel, placement } = periodOf(r.organizationId, r.context?.source.label, r.workDate, r.workDate);
      const key = [r.organizationId, projectId ?? "", place ?? "", periodLabel ?? "", describesJournal ? "j" : "o"].join("|");
      let a = dayAcc.get(key);
      if (!a) {
        a = {
          organizationId: r.organizationId,
          projectId,
          projectName: r.context?.project?.name ?? null,
          place,
          describesJournal,
          supplierName: r.context?.source.supplierName ?? null,
          periodLabel,
          placement,
          hours: 0,
          attested: 0,
          selfAttested: 0,
          contested: false,
          records: 0,
          days: new Map<string, number>(),
          from: null,
          to: null,
        };
        dayAcc.set(key, a);
      }
      a.hours += r.hours;
      const att = attestationOf(r.context);
      if (att.independent) a.attested += r.hours;
      else if (att.self) a.selfAttested += r.hours;
      if (att.contested) a.contested = true;
      a.records += 1;
      a.days.set(r.workDate, (a.days.get(r.workDate) ?? 0) + r.hours);
      a.from = minDay(a.from, r.workDate);
      a.to = maxDay(a.to, r.workDate);
    }
    for (const [key, a] of dayAcc) {
      daysByKey.set(`day:${key}`, [...a.days].map(([day, h]) => ({ day, hours: h })));
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
        periodLabel: a.periodLabel,
        from: a.from,
        to: a.to,
        hours: round2(a.hours),
        confirmedHours: 0,
        records: a.records,
        counted: !a.describesJournal,
        notCountedReason: a.describesJournal ? "describes_journal_entry" : null,
        spanProvenance: null,
        periodPlacement: a.placement,
        attestedHours: round2(a.attested),
        selfAttestedHours: round2(a.selfAttested),
        contested: a.contested,
      });
    }

    // ── period records: one figure over a span, never spread ─────────────
    const countedPeriods: WorkIntelligenceOrganizationPeriodRecord[] = [];
    for (const p of periodRecords) {
      const spansDayRecords = dayRecords.some(
        (d) => d.organizationId === p.organizationId && d.workDate >= p.periodStart && d.workDate <= p.periodEnd,
      );
      if (!spansDayRecords) countedPeriods.push(p);
      const placed = periodOf(p.organizationId, p.context?.source.label, p.periodStart, p.periodEnd);
      const att = attestationOf(p.context);
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
        periodLabel: placed.label,
        from: p.periodStart,
        to: p.periodEnd,
        hours: round2(p.hours),
        confirmedHours: 0,
        records: 1,
        counted: !spansDayRecords,
        notCountedReason: spansDayRecords ? "period_spans_day_records" : null,
        spanProvenance: p.provenance,
        periodPlacement: placed.placement,
        attestedHours: att.independent ? round2(p.hours) : 0,
        selfAttestedHours: att.self ? round2(p.hours) : 0,
        hoursBasis: p.hoursBasis ?? null,
        contested: att.contested,
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
      const key = `journal:${l.engagementContextId ?? ""}|${l.projectId ?? ""}|${counted ? "c" : "p"}`;
      daysByKey.set(key, days.map((d) => ({ day: d.day, hours: d.hours })));
      return {
        key,
        source: "journal",
        evidence: confirmed > 0 ? "manager_confirmed" : "own_record",
        organizationId: org.organizationId,
        organizationName: org.organizationName,
        engagementContextId: l.engagementContextId,
        projectId: l.projectId,
        projectName: l.projectId ? (projectNames.get(l.projectId) ?? null) : null,
        place: null,
        label: null,
        periodLabel: null,
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

  // ── the one hours ledger over the same lines ─────────────────────────
  const ledger = deriveHoursLedger({
    lines: lines.map((l) => (daysByKey.has(l.key) ? { ...l, days: daysByKey.get(l.key) } : l)),
    skillLinks: input.skillLinks ?? null,
    confidenceWeights: input.confidenceWeights ?? null,
  });

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
      // The ledger's total: every counted line once, minus what the overlap
      // capacity check took from estimates (0 when nothing overlaps).
      total: round2(journal + organizationDays + organizationPeriods - ledger.capacity.excessHours),
      journal: round2(journal),
      journalConfirmed: round2(journalConfirmed),
      organizationDays: round2(organizationDays),
      organizationPeriods: round2(organizationPeriods),
      notCounted: round2(notCounted),
      capacityExcess: ledger.capacity.excessHours,
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

  // ── per organization AND per earlier legal entity ───────────────────
  // SEPARATE LEGAL ENTITIES, ONE PERSON HISTORY (owner 2026-10-17, final):
  // a stated period whose legal relation is NOT a former name (sold and
  // continued by a new entity, successor, not asserted, other) is an EARLIER
  // LEGAL ENTITY of its own — its own row in the person's history, named by
  // the entity label, holding the work done under it (the records whose
  // source label places them in that period) and the leadership stated for
  // it. The records stay where they are, administered by the continuing
  // organization; the row says both. A period that IS a former name
  // (renamed / same_entity) stays inside the continuing organization's row
  // with the name history.
  const orgAcc = new Map<string, ExperienceOrganization>();
  const stateOfLine = new Map<string, LineStateSplit>(ledger.lines.map((x) => [x.key, x]));
  const cutOfLine = new Map<string, number>(ledger.capacity.reductions.map((r) => [r.key, r.hours]));
  const addStates = (
    acc: Readonly<Record<HoursState, number>>,
    l: ExperienceHourLine,
  ): Readonly<Record<HoursState, number>> => {
    const split = l.counted ? stateOfLine.get(l.key) : undefined;
    if (!split) return acc;
    return {
      actual: acc.actual + split.byState.actual,
      reported: acc.reported + split.byState.reported,
      estimated: acc.estimated + split.byState.estimated,
      confirmed: acc.confirmed + split.byState.confirmed,
    };
  };
  const orgKey = (id: string | null) => id ?? PERSONAL_KEY;
  const entityKey = (periodId: string) => `entity:${periodId}`;
  const earlierEntitiesOf = (id: string | null): ExperienceBusinessPeriod[] =>
    id ? (periodsByOrg.get(id) ?? []).filter((p) => !FORMER_NAME_RELATIONS.has(p.legalEntityRelation)) : [];
  const emptyRow = (
    key: string,
    kind: ExperienceOrganization["kind"],
    id: string | null,
    name: string | null,
  ): ExperienceOrganization => ({
    key,
    kind,
    organizationId: id,
    organizationName: name,
    legalEntityLabel: null,
    legalEntityRelation: null,
    basis: null,
    periodId: null,
    administeredBy: null,
    earlierEntities: [],
    roles: [],
    businessPeriods: [],
    formerNames: [],
    byPeriod: [],
    journalHours: 0,
    journalConfirmedHours: 0,
    organizationHours: 0,
    notCountedHours: 0,
    capacityExcessHours: 0,
    totalHours: 0,
    byState: zeroStates(),
    entries: 0,
    records: 0,
    from: null,
    to: null,
  });
  const ensureOrg = (id: string | null, name: string | null): ExperienceOrganization => {
    const key = orgKey(id);
    let o = orgAcc.get(key);
    if (!o) {
      const periods = id ? (periodsByOrg.get(id) ?? []) : [];
      o = {
        ...emptyRow(key, id ? "organization" : "personal", id, nameOf(id, name)),
        businessPeriods: periods,
        formerNames: formerNamesOf(periods),
        earlierEntities: earlierEntitiesOf(id).map((p) => ({ periodId: p.id, label: p.legalEntityLabel ?? p.label })),
      };
      orgAcc.set(key, o);
    } else if (o.organizationName === null && name) {
      o = { ...o, organizationName: name };
      orgAcc.set(key, o);
    }
    return o;
  };
  const ensureEntity = (org: ExperienceOrganization, p: ExperienceBusinessPeriod): ExperienceOrganization => {
    const key = entityKey(p.id);
    let e = orgAcc.get(key);
    if (!e) {
      e = {
        ...emptyRow(key, "earlier_legal_entity", org.organizationId, p.legalEntityLabel ?? p.label),
        legalEntityLabel: p.legalEntityLabel ?? p.label,
        legalEntityRelation: p.legalEntityRelation,
        basis: p.basis,
        periodId: p.id,
        administeredBy: org.organizationId
          ? { organizationId: org.organizationId, organizationName: org.organizationName }
          : null,
        businessPeriods: [p],
        from: p.from,
        to: p.to,
      };
      orgAcc.set(key, e);
    }
    return e;
  };
  for (const r of relationships) {
    const o = ensureOrg(r.organizationId, r.organizationName);
    const role: ExperienceRole = {
      relationship: r.relationship,
      title: r.title,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      current: r.current,
      source: r.source,
      engagementContextId: r.engagementContextId,
    };
    orgAcc.set(o.key, { ...o, roles: [...o.roles, role] });
    // The OWNER of the continuing organization led the earlier entity too —
    // that is what the period statement (its basis is named on the row)
    // says; the role is marked DERIVED and dated by the period, never by the
    // engagement. A manager appointed to the continuing organization is NOT
    // projected: the statement says nothing about them.
    if (r.relationship === "owner") {
      for (const p of earlierEntitiesOf(r.organizationId)) {
        const e = ensureEntity(orgAcc.get(o.key)!, p);
        if (e.roles.some((x) => x.relationship === "owner" && x.derived)) continue;
        orgAcc.set(e.key, {
          ...e,
          roles: [
            ...e.roles,
            { ...role, startedAt: p.from, endedAt: p.to, current: false, derived: true, engagementContextId: null },
          ],
        });
      }
    }
  }
  const rowFor = (l: ExperienceHourLine): ExperienceOrganization => {
    const org = ensureOrg(l.organizationId, l.organizationName);
    if (l.periodLabel && l.source !== "journal") {
      const p = earlierEntitiesOf(l.organizationId).find((x) => x.label === l.periodLabel);
      if (p) return ensureEntity(org, p);
    }
    return org;
  };
  for (const l of lines) {
    const o = rowFor(l);
    const byPeriod =
      l.counted && l.source !== "journal"
        ? (() => {
            const existing = o.byPeriod.find((b) => b.periodLabel === l.periodLabel);
            return existing
              ? o.byPeriod.map((b) =>
                  b === existing ? { ...b, hours: b.hours + l.hours, records: b.records + l.records } : b,
                )
              : [...o.byPeriod, { periodLabel: l.periodLabel, hours: l.hours, records: l.records }];
          })()
        : o.byPeriod;
    const next: ExperienceOrganization = {
      ...o,
      byPeriod,
      journalHours: o.journalHours + (l.counted && l.source === "journal" ? l.hours : 0),
      journalConfirmedHours: o.journalConfirmedHours + (l.counted && l.source === "journal" ? l.confirmedHours : 0),
      organizationHours: o.organizationHours + (l.counted && l.source !== "journal" ? l.hours : 0),
      notCountedHours: o.notCountedHours + (l.counted ? 0 : l.hours),
      capacityExcessHours: o.capacityExcessHours + (l.counted ? (cutOfLine.get(l.key) ?? 0) : 0),
      totalHours: 0,
      byState: addStates(o.byState, l),
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
      byPeriod: o.byPeriod
        .map((b) => ({ ...b, hours: round2(b.hours) }))
        .sort((x, y) => y.hours - x.hours || (x.periodLabel ?? "").localeCompare(y.periodLabel ?? "")),
      journalHours: round2(o.journalHours),
      journalConfirmedHours: round2(o.journalConfirmedHours),
      organizationHours: round2(o.organizationHours),
      notCountedHours: round2(o.notCountedHours),
      capacityExcessHours: round2(o.capacityExcessHours),
      totalHours: round2(o.journalHours + o.organizationHours - o.capacityExcessHours),
      byState: roundStates(o.byState),
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
      capacityExcessHours: 0,
      totalHours: 0,
      byState: zeroStates(),
      from: null,
      to: null,
    };
    projAcc.set(key, {
      ...p,
      projectName: p.projectName ?? l.projectName,
      journalHours: p.journalHours + (l.source === "journal" ? l.hours : 0),
      organizationHours: p.organizationHours + (l.source === "journal" ? 0 : l.hours),
      capacityExcessHours: p.capacityExcessHours + (cutOfLine.get(l.key) ?? 0),
      totalHours: 0,
      byState: addStates(p.byState, l),
      from: minDay(p.from, l.from),
      to: maxDay(p.to, l.to),
    });
  }
  const projects = [...projAcc.values()]
    .map((p) => ({
      ...p,
      journalHours: round2(p.journalHours),
      organizationHours: round2(p.organizationHours),
      capacityExcessHours: round2(p.capacityExcessHours),
      totalHours: round2(p.journalHours + p.organizationHours - p.capacityExcessHours),
      byState: roundStates(p.byState),
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
    ledger,
  };
}
