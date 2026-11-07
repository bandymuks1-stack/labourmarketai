/**
 * THE LIVING CV IN THE FORM OF A TOP-LEAGUE ATHLETE'S PROFILE (owner order
 * 2026-11-07): who, the numbers and who stands behind each, the career by
 * seasons, what the person can do and what shows it, the next move.
 *
 * A pure projection of the CV the page already read (`buildVerifiedCv`): no IO,
 * no clock, no locale, no second CV system. Names come through `names`, so this
 * module returns facts and states and the view words them.
 *
 * HONESTY (each rule pinned by athlete-profile.test.ts):
 *  - No figure of the person. No overall score, rating or percent exists here
 *    (doctrine §19). A stat is one real number with the party behind it.
 *  - UNKNOWN is never zero (SEP-7). An unread source is `unknown`; a source read
 *    and empty is `none`; a source that does not exist is no stat at all.
 *  - Evidence states stay apart (decisions 0023, 0025). A second party's
 *    confirmation, an organization's record, the person's own record and a
 *    statement never read as one another, and a person's confirmation of their
 *    own work is said, never counted as somebody else's (EVID-2).
 *  - A season's hours are what its own records state. The all-time total comes
 *    only from the ONE professional-experience reading, every hour once.
 *  - Availability and the next move are the person's own. They exist only when
 *    `readerIsThePerson` says so.
 */

import { deriveCareerJourney } from "@/lib/cv-export/career-journey";
import { experienceStopsOf } from "@/lib/cv-export/experience-stops";
import { ownEngagementHeading } from "@/lib/cv-export/own-engagement-heading";
import { presentSkills, skillTimeReading, type SkillTimeReading } from "@/lib/cv-export/skill-presentation";
import type { VerifiedCvData } from "@/lib/cv-export/verified-cv";
import { FORMER_NAME_RELATIONS, periodFor } from "@/lib/journal/professional-experience";
import { derivePotentialSkills } from "@/lib/skills/potential-skills";
import { formatUtcDate } from "@/lib/time/display";
import { professionDisplayName } from "@/lib/worker/self-declared-profession";

import { statedDateLabel } from "./period-dates";

export type AthleteCvInput = Pick<
  VerifiedCvData,
  | "personName"
  | "professionSlugs"
  | "tiers"
  | "declaredClaims"
  | "skillPractice"
  | "growthAdjacent"
  | "journalCoverage"
  | "workHistory"
  | "languages"
  | "certificateDocs"
  | "declaredCertificates"
  | "recordedHoursTotal"
  | "recordedHoursConfirmed"
  | "organizationRecordedHours"
  | "organizationHistory"
  | "professionalExperience"
  | "privateDetails"
  | "proof"
>;

/** The reader's words for catalogue values; a resolver answers its own fallback. */
export type AthleteNames = {
  readonly skill: (slug: string) => string;
  readonly profession: (slug: string) => string | null;
  readonly relationship: (slug: string) => string;
  readonly documentType: (slug: string) => string;
  readonly language: (code: string) => string;
};

export type AthleteAvailability = {
  readonly status: "available" | "busy" | "unavailable";
  /** A date still ahead of the reader's today; a passed one says nothing. */
  readonly from: string | null;
};

export type AthleteHero = {
  /** null = the person has not given a name (the view says so; never invented). */
  readonly name: string | null;
  readonly roles: readonly string[];
  /** Country name in the reader's language, or null when none is saved. */
  readonly place: string | null;
  /** Signed URL of the person's own photo; null = initials, never a stand-in. */
  readonly portraitUrl: string | null;
  readonly availability: AthleteAvailability | null;
};

export type AthleteStatKey = "confirmed" | "total" | "journal" | "organization" | "projects";

/** Who stands behind a confirmed figure. Confirmers are roles, never people. */
export type AthleteConfirmedBehind = {
  readonly organizations: readonly string[];
  readonly roles: readonly string[];
  /** At least one confirmation was the person confirming their own work. */
  readonly selfConfirmed: boolean;
  /** At least one confirmation was written by a preset rule. */
  readonly automatic: boolean;
  /** Every confirmation we can see is the person's own. */
  readonly selfOnly: boolean;
};

export type AthleteStat =
  | { readonly key: AthleteStatKey; readonly state: "unknown" | "none" }
  | {
      readonly key: AthleteStatKey;
      readonly state: "value";
      readonly value: number;
      readonly behind: AthleteConfirmedBehind | null;
      /** Organizations whose records hold the figure ("organization" only). */
      readonly organizations: readonly string[];
    };

export type AthleteSeasonEvidence =
  | "confirmed"
  | "client_accepted"
  | "organization_record"
  | "own_record"
  | "stated";

export type AthleteSeasonPeriod = {
  readonly from: string | null;
  readonly to: string | null;
  readonly current: boolean;
  /** `stated`: a date the person wrote about themselves, kept at the precision
   *  they gave. `recorded`: an organization's date, a real date as it stands. */
  readonly precision: "stated" | "recorded";
};

export type AthleteSeasonHours =
  | {
      readonly kind: "journal";
      readonly recorded: number;
      /** Hours a second party confirmed; null when none did. */
      readonly confirmed: number | null;
    }
  | {
      readonly kind: "organization";
      readonly dayHours: number | null;
      readonly dayRecords: number;
      readonly periodHours: number | null;
    }
  | { readonly kind: "entity"; readonly hours: number };

export type AthleteSeasonBand =
  | { readonly kind: "former_name"; readonly label: string }
  | { readonly kind: "legal_entity"; readonly label: string; readonly administeredBy: string | null };

export type AthleteSeason = {
  readonly key: string;
  readonly source: "engagement" | "organization_record" | "leadership" | "earlier_entity";
  readonly period: AthleteSeasonPeriod;
  /** null = the source names nothing (the view says so). */
  readonly title: string | null;
  readonly subtitle: string | null;
  readonly role: string | null;
  readonly band: AthleteSeasonBand | null;
  readonly project: string | null;
  readonly description: string | null;
  /** A study placement or volunteering: never presented as a job. */
  readonly placement: boolean;
  readonly evidence: AthleteSeasonEvidence;
  readonly confirmedByRoles: readonly string[];
  readonly selfConfirmed: boolean;
  readonly contested: boolean;
  readonly reconstructed: boolean;
  readonly hours: AthleteSeasonHours | null;
  /** An organization record that states no duration: unknown, never zero. */
  readonly hoursNotStated: boolean;
  /** The project this season's journal entries belong to, when known. */
  readonly projectId: string | null;
  readonly photoUrl: string | null;
};

export type AthleteSkillState = "confirmed" | "certified" | "recorded" | "declared" | "potential";

export type AthleteSkill = {
  readonly key: string;
  readonly name: string;
  readonly state: AthleteSkillState;
  /** The journal's own reading of the time; `none` for what no journal holds. */
  readonly time: SkillTimeReading;
  /** The evidenced skills a potential capability is read from. */
  readonly from: readonly string[];
  /** Language level as stated. */
  readonly level: string | null;
  readonly validUntil: string | null;
  /** A document the person added that no reviewer has checked. */
  readonly unverifiedDocument: boolean;
};

export type AthleteNextMoveItem = {
  readonly key: string;
  readonly name: string;
  /** Shared skills a second party confirmed. */
  readonly confirmed: readonly string[];
  /** Shared skills only the person's own records show: never "you have". */
  readonly inRecords: readonly string[];
  readonly missing: readonly string[];
};

export type AthleteNextMove =
  | { readonly state: "unknown" | "none" }
  | { readonly state: "items"; readonly items: readonly AthleteNextMoveItem[] };

export type AthleteProfile = {
  readonly hero: AthleteHero;
  readonly stats: readonly AthleteStat[];
  /** Older journal entries may lie outside every figure. */
  readonly journalTruncated: boolean;
  readonly seasons: readonly AthleteSeason[];
  readonly skills: readonly AthleteSkill[];
  /** The journal could not be read, so no skill carries a time figure. */
  readonly skillTimeUnknown: boolean;
  /** null when this reader is not the person. */
  readonly nextMove: AthleteNextMove | null;
};

const unique = (values: readonly (string | null | undefined)[]): string[] => {
  const out: string[] = [];
  for (const v of values) {
    const s = (v ?? "").trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
};

const DAY = /^\d{4}-\d{2}-\d{2}/;
const AVAILABILITY = new Set(["available", "busy", "unavailable"]);

function heroOf(input: {
  cv: AthleteCvInput;
  names: AthleteNames;
  place: string | null;
  portraitUrl: string | null;
  todayIso: string;
  readerIsThePerson: boolean;
}): AthleteHero {
  const { cv, names } = input;
  const name = cv.personName.trim();
  const status = cv.privateDetails.availabilityStatus;
  const from = cv.privateDetails.availableFrom;
  return {
    name: name && name !== "—" ? name : null,
    roles: unique(cv.professionSlugs.map((p) => professionDisplayName(p, names.profession))),
    place: input.place,
    portraitUrl: input.portraitUrl,
    availability:
      input.readerIsThePerson && status && AVAILABILITY.has(status)
        ? {
            status: status as AthleteAvailability["status"],
            from: from && DAY.test(from) && from.slice(0, 10) > input.todayIso ? from.slice(0, 10) : null,
          }
        : null,
  };
}

function confirmedBehind(cv: AthleteCvInput, names: AthleteNames): AthleteConfirmedBehind {
  const lines = cv.professionalExperience?.lines ?? [];
  const confirmingLines = lines.filter((l) => l.counted && (l.confirmedHours > 0 || (l.attestedHours ?? 0) > 0));
  const attestedLine = confirmingLines.some((l) => (l.attestedHours ?? 0) > 0);
  const others = cv.proof.filter((p) => !p.selfConfirmed);
  const selfConfirmed = cv.proof.some((p) => p.selfConfirmed);
  return {
    organizations: unique(confirmingLines.map((l) => l.organizationName)),
    roles: unique(others.map((p) => names.relationship(p.confirmerRole))),
    selfConfirmed,
    automatic: others.some((p) => p.automatic),
    selfOnly: selfConfirmed && others.length === 0 && !attestedLine,
  };
}

function statsOf(cv: AthleteCvInput, names: AthleteNames): AthleteStat[] {
  const pe = cv.professionalExperience;
  const hours = pe?.hours ?? null;
  const out: AthleteStat[] = [];

  // CONFIRMED: the ledger's own state over the counted lines; the journal's
  // figure when the one reading is absent.
  const confirmed = hours && pe ? pe.ledger.byState.confirmed : cv.recordedHoursConfirmed;
  out.push(
    confirmed === null
      ? { key: "confirmed", state: "unknown" }
      : confirmed > 0
        ? { key: "confirmed", state: "value", value: confirmed, behind: confirmedBehind(cv, names), organizations: [] }
        : { key: "confirmed", state: "none" },
  );

  // THE TOTAL exists as its own figure only when an organization's records add
  // to the journal; otherwise it is the journal's figure said twice.
  if (hours && hours.total > 0 && hours.organizationDays + hours.organizationPeriods > 0) {
    out.push({ key: "total", state: "value", value: hours.total, behind: null, organizations: [] });
  }

  const journal = cv.recordedHoursTotal;
  out.push(
    journal === null
      ? { key: "journal", state: "unknown" }
      : journal > 0
        ? { key: "journal", state: "value", value: journal, behind: null, organizations: [] }
        : { key: "journal", state: "none" },
  );

  // A person no organization has records about has no such stat at all.
  const organization = cv.organizationRecordedHours;
  if (organization === null) {
    out.push({ key: "organization", state: "unknown" });
  } else if (organization.totalHours > 0) {
    out.push({
      key: "organization",
      state: "value",
      value: organization.totalHours,
      behind: null,
      organizations: unique((cv.organizationHistory ?? []).map((h) => h.organizationName)),
    });
  }

  const projects = pe?.projects.length ?? 0;
  if (projects > 0) out.push({ key: "projects", state: "value", value: projects, behind: null, organizations: [] });

  return out;
}

type Sortable = AthleteSeason & { readonly sortKey: string };

const BLANK: Pick<
  AthleteSeason,
  | "subtitle"
  | "role"
  | "band"
  | "project"
  | "description"
  | "placement"
  | "confirmedByRoles"
  | "selfConfirmed"
  | "contested"
  | "reconstructed"
  | "hours"
  | "hoursNotStated"
  | "projectId"
  | "photoUrl"
> = {
  subtitle: null,
  role: null,
  band: null,
  project: null,
  description: null,
  placement: false,
  confirmedByRoles: [],
  selfConfirmed: false,
  contested: false,
  reconstructed: false,
  hours: null,
  hoursNotStated: false,
  projectId: null,
  photoUrl: null,
};

function seasonsOf(cv: AthleteCvInput, names: AthleteNames): AthleteSeason[] {
  const pe = cv.professionalExperience;
  const periods = (pe?.roles ?? []).flatMap((r) => r.businessPeriods);
  const orgNameOfPeriod = new Map<string, string | null>();
  for (const r of pe?.roles ?? []) {
    for (const p of r.businessPeriods) if (!orgNameOfPeriod.has(p.id)) orgNameOfPeriod.set(p.id, r.organizationName);
  }

  // An organization's work grouped by the entity it was done under: when those
  // records have their own seasons, the entity's season carries no hours, or
  // the same work would read twice.
  const entitiesWithRecords = new Set<string>();
  const orgSeasons = (cv.organizationHistory ?? []).map((h): Sortable => {
    const stated = h.sourceLabel ? periodFor(h.sourceLabel, periods) : null;
    const entity = stated ? (stated.legalEntityLabel ?? stated.label) : null;
    if (entity) entitiesWithRecords.add(entity);
    const title = h.project ?? h.place ?? h.organizationName;
    const independent =
      h.proof.includes("INDEPENDENTLY_VERIFIED") ||
      h.proof.includes("EMPLOYER_CONFIRMED") ||
      h.proof.includes("SUPERVISOR_CONFIRMED");
    return {
      ...BLANK,
      key: `org:${h.key}`,
      source: "organization_record",
      period: { from: h.from, to: h.to, current: false, precision: "recorded" },
      title,
      subtitle: h.organizationName && h.organizationName !== title ? h.organizationName : null,
      role: h.relationshipKind ? names.relationship(h.relationshipKind) : null,
      band: stated
        ? FORMER_NAME_RELATIONS.has(stated.legalEntityRelation)
          ? { kind: "former_name", label: stated.label }
          : {
              kind: "legal_entity",
              label: stated.legalEntityLabel ?? stated.label,
              administeredBy: orgNameOfPeriod.get(stated.id) ?? null,
            }
        : null,
      evidence: independent
        ? "confirmed"
        : h.proof.includes("CLIENT_ACCEPTED")
          ? "client_accepted"
          : h.proof.includes("SELF_DECLARED")
            ? "own_record"
            : "organization_record",
      confirmedByRoles: independent && h.attestedByRole ? [names.relationship(h.attestedByRole)] : [],
      contested: h.contested,
      reconstructed: h.reconstructed,
      hours:
        h.dayHours !== null || h.periodHours !== null
          ? { kind: "organization", dayHours: h.dayHours, dayRecords: h.dayRecords, periodHours: h.periodHours }
          : null,
      hoursNotStated: h.dayHours === null && h.periodHours === null,
      sortKey: h.to ?? h.from ?? "",
    };
  });

  const stopSeasons = experienceStopsOf(pe).flatMap((stop): Sortable[] => {
    if (stop.kind === "earlier_legal_entity") {
      const rolesText = unique(stop.roles.map((r) => names.relationship(r.relationship))).join(", ");
      return [
        {
          ...BLANK,
          key: stop.key,
          source: "earlier_entity",
          period: { from: stop.from, to: stop.to, current: stop.current, precision: "recorded" },
          title: stop.name,
          role: rolesText || null,
          band: { kind: "legal_entity", label: stop.name ?? "", administeredBy: stop.administeredByName },
          evidence: "organization_record",
          hours:
            stop.hours !== null && !(stop.name && entitiesWithRecords.has(stop.name))
              ? { kind: "entity", hours: stop.hours }
              : null,
          sortKey: stop.current ? "9999-12-31" : (stop.to ?? stop.from ?? ""),
        },
      ];
    }
    // One season per role, with that role's own dates. A role carries no hours:
    // an organization's work is not hours performed in a leadership role.
    return stop.roles.map((role, i): Sortable => ({
      ...BLANK,
      key: `${stop.key}:${role.relationship}:${i}`,
      source: "leadership",
      period: { from: role.startedAt, to: role.endedAt, current: role.current, precision: "recorded" },
      title: stop.name,
      role: names.relationship(role.relationship),
      evidence: role.source === "membership" ? "organization_record" : "stated",
      sortKey: role.current ? "9999-12-31" : (role.endedAt ?? role.startedAt ?? ""),
    }));
  });

  const engagementSeasons = cv.workHistory.map((e, i): Sortable => {
    const heading = ownEngagementHeading({
      orgName: e.orgName,
      title: e.title,
      relationshipLabel: names.relationship(e.relationship),
    });
    const proof = e.id ? cv.proof.filter((p) => p.engagementId === e.id) : [];
    const others = proof.filter((p) => !p.selfConfirmed);
    const recorded = e.recorded && e.recorded.entries > 0 ? e.recorded : null;
    const confirmed = others.length > 0;
    const line = e.id
      ? (pe?.lines ?? []).find((l) => l.engagementContextId === e.id && l.projectId !== null)
      : undefined;
    const current = !!e.startedAt && !e.endedAt;
    return {
      ...BLANK,
      key: `own:${e.id ?? i}`,
      source: "engagement",
      // A job with no organization carries only what the person stated.
      period: { from: e.startedAt, to: e.endedAt, current, precision: e.orgName ? "recorded" : "stated" },
      title: heading.title,
      subtitle: heading.subtitle,
      project: e.projectName,
      description: e.description,
      placement: e.kind === "practice",
      evidence: confirmed ? "confirmed" : recorded ? "own_record" : "stated",
      confirmedByRoles: unique(others.map((p) => names.relationship(p.confirmerRole))),
      selfConfirmed: proof.some((p) => p.selfConfirmed),
      hours: recorded
        ? {
            kind: "journal",
            recorded: recorded.hours,
            confirmed: confirmed && recorded.confirmedHours > 0 ? recorded.confirmedHours : null,
          }
        : null,
      projectId: line?.projectId ?? null,
      sortKey: current ? "9999-12-31" : (e.endedAt ?? e.startedAt ?? ""),
    };
  });

  return [...engagementSeasons, ...orgSeasons, ...stopSeasons]
    .sort(
      (a, b) =>
        Number(b.period.current) - Number(a.period.current) ||
        b.sortKey.localeCompare(a.sortKey) ||
        a.key.localeCompare(b.key),
    )
    .map(({ sortKey: _sortKey, ...season }) => season);
}

function skillsOf(cv: AthleteCvInput, names: AthleteNames): AthleteSkill[] {
  const readable = cv.skillPractice !== null;
  const plain = (key: string, name: string, state: AthleteSkillState): AthleteSkill => ({
    key,
    name,
    state,
    time: { kind: "none" },
    from: [],
    level: null,
    validUntil: null,
    unverifiedDocument: false,
  });

  const presented = presentSkills({
    tiers: cv.tiers,
    claims: cv.declaredClaims,
    practice: cv.skillPractice,
    nameOf: names.skill,
  });
  const STATE = { confirmed: "confirmed", evidence: "recorded", declared: "declared", self_stated: "declared" } as const;
  const catalogued = presented.groups.flatMap((g) =>
    g.items.map(
      (item): AthleteSkill => ({
        ...plain(item.key, item.name, STATE[g.tier]),
        time: skillTimeReading(item.practice, readable),
      }),
    ),
  );

  const documents = cv.certificateDocs.map(
    (d, i): AthleteSkill => ({
      ...plain(`doc:${d.typeSlug}:${i}`, names.documentType(d.typeSlug), d.reviewerVerified ? "certified" : "declared"),
      validUntil: d.validUntil,
      unverifiedDocument: !d.reviewerVerified,
    }),
  );
  const declaredCertificates = cv.declaredCertificates.map((c, i) => plain(`cert:${i}`, c.title, "declared"));
  const languages = cv.languages.map((l): AthleteSkill => ({
    ...plain(`lang:${l.lang}`, names.language(l.lang), "declared"),
    level: l.level,
  }));

  // Potential: the same reading the default CV uses (decision 0023). Unreadable
  // practice leaves confirmed skills only, never the raw links.
  const live = Object.keys(cv.skillPractice ?? {});
  const potential = derivePotentialSkills(
    [...cv.tiers.confirmed, ...live],
    [
      ...cv.tiers.confirmed,
      ...cv.tiers.evidence,
      ...cv.tiers.declared,
      ...live,
      ...cv.declaredClaims.flatMap((c) => c.mappedSlugs ?? []),
    ],
  ).map((p): AthleteSkill => ({
    ...plain(`potential:${p.slug}`, names.skill(p.slug), "potential"),
    from: p.fromSlugs.map(names.skill),
  }));

  const rank: Record<AthleteSkillState, number> = { confirmed: 0, certified: 1, recorded: 2, declared: 3, potential: 4 };
  // A stable sort: inside one state the evidence order above stands.
  return [...catalogued, ...documents, ...declaredCertificates, ...languages, ...potential].sort(
    (a, b) => rank[a.state] - rank[b.state],
  );
}

function nextMoveOf(cv: AthleteCvInput, names: AthleteNames, todayIso: string): AthleteNextMove {
  if (cv.growthAdjacent === null || cv.growthAdjacent === undefined || cv.skillPractice === null) {
    return { state: "unknown" };
  }
  // The horizon of the career journey: same derivation, same cap. It needs no
  // stations, because a direction rests on skills.
  const practice = Object.fromEntries(
    Object.entries(cv.skillPractice).map(([slug, f]) => [slug, { contextIds: f.contextIds ?? [] }]),
  );
  const journey = deriveCareerJourney({
    todayIso,
    stations: [],
    practice,
    horizon: cv.growthAdjacent,
    skills: (["confirmed", "evidence", "declared"] as const).flatMap((tier) =>
      cv.tiers[tier].map((slug) => ({
        slug,
        tier,
        attributedHours: cv.skillPractice?.[slug]?.attributedHours ?? 0,
        confirmedHours: cv.skillPractice?.[slug]?.confirmedHours ?? 0,
      })),
    ),
  });
  if (journey.horizon.length === 0) return { state: "none" };
  const held = new Set(cv.tiers.confirmed);
  return {
    state: "items",
    items: journey.horizon.map((h) => ({
      key: h.professionId,
      name: names.profession(h.professionId) ?? h.professionId,
      confirmed: h.sharedSkills.filter((s) => held.has(s)).map(names.skill),
      inRecords: h.sharedSkills.filter((s) => !held.has(s)).map(names.skill),
      missing: h.missingSkills.map(names.skill),
    })),
  };
}

export function buildAthleteProfile(input: {
  readonly cv: AthleteCvInput;
  readonly names: AthleteNames;
  readonly place: string | null;
  readonly portraitUrl: string | null;
  /** The reader's working day. */
  readonly todayIso: string;
  /** Whether the reader is the person this CV is about. */
  readonly readerIsThePerson: boolean;
}): AthleteProfile {
  const { cv, names } = input;
  return {
    hero: heroOf(input),
    stats: statsOf(cv, names),
    journalTruncated: cv.journalCoverage?.truncated === true,
    seasons: seasonsOf(cv, names),
    skills: skillsOf(cv, names),
    skillTimeUnknown: cv.skillPractice === null,
    nextMove: input.readerIsThePerson ? nextMoveOf(cv, names, input.todayIso) : null,
  };
}

/** A photo the gallery may give for a project, as this module needs it. */
export type AthleteSeasonPhoto = {
  readonly workerId: string;
  readonly signedUrl: string | null;
};

/**
 * The projects whose photos could stand on a season, newest season first. A
 * bounded list: each one is a read and a batch of signed URLs.
 */
export const ATHLETE_PHOTO_PROJECTS_MAX = 4;

export function seasonPhotoProjects(profile: AthleteProfile): string[] {
  return unique(profile.seasons.map((s) => s.projectId)).slice(0, ATHLETE_PHOTO_PROJECTS_MAX);
}

/**
 * One real photo per season, only the person's own. The project gallery returns
 * every photo the session may read, and for someone who also manages the project
 * that includes other people's work, which never belongs on this person's CV.
 * A photo with no preview URL is no photo.
 */
export function withSeasonPhotos(
  profile: AthleteProfile,
  photosByProject: ReadonlyMap<string, readonly AthleteSeasonPhoto[]>,
  ownWorkerId: string | null,
): AthleteProfile {
  if (!ownWorkerId) return profile;
  const used = new Set<string>();
  return {
    ...profile,
    seasons: profile.seasons.map((season) => {
      if (!season.projectId || used.has(season.projectId)) return season;
      const photo = (photosByProject.get(season.projectId) ?? []).find(
        (p) => p.workerId === ownWorkerId && !!p.signedUrl,
      );
      if (!photo?.signedUrl) return season;
      used.add(season.projectId);
      return { ...season, photoUrl: photo.signedUrl };
    }),
  };
}

/**
 * A season's period in the reader's language. A stated year stays a year; an
 * organization's date is a real date, shown to the month. null = no date at all.
 */
export function seasonPeriodLabel(period: AthleteSeasonPeriod, locale: string, present: string): string | null {
  const month = (iso: string | null) =>
    iso ? (formatUtcDate(iso, locale, { month: "short", year: "numeric" }) ?? null) : null;
  const from = period.precision === "stated" ? statedDateLabel(period.from, "start", locale, "month") : month(period.from);
  const to = period.current
    ? present
    : period.precision === "stated"
      ? statedDateLabel(period.to, "end", locale, "month")
      : month(period.to);
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from ?? to;
}
