/**
 * EU-format CV — the section model (education pilot P0, item 6).
 *
 * A person who needs the conservative European layout must be able to hand it
 * over WITHOUT their profile becoming a second, divergent copy of themselves.
 * So this is a VIEW: it reorders and relabels the SAME `VerifiedCvData` the
 * standard export already renders. It reads no table of its own, adds no
 * field, and can produce no fact the Living CV does not already hold.
 *
 * ── WHAT "EU-FORMAT" MEANS HERE, EXACTLY ───────────────────────────────────
 * The section order and headings follow the official Europass CV structure as
 * an INTEROPERABILITY REFERENCE — Personal information → Work experience →
 * Education and training → Personal skills → Additional information. That is
 * the shape a European employer, university or public body expects to read.
 *
 * It is NOT, and must never be presented as, a Europass document issued by the
 * European Union. The page says so on screen. Two consequences are baked in:
 *
 *   1. NOTHING IS INVENTED TO FILL A SLOT. Europass has fields this product
 *      does not hold — date of birth, address, nationality, mother tongue,
 *      the self-assessed CEFR grid, digital-skills self-assessment. A blank
 *      Europass field is normal; a guessed one is a lie about a person. Every
 *      one of those is simply absent here.
 *
 *      Languages are the sharpest case. Europass separates "mother tongue"
 *      from "other languages", and `worker_languages` records neither — it
 *      records a language and a stated level. Guessing which is the mother
 *      tongue from a name, a locale or a country would be exactly the kind of
 *      inference this codebase refuses. So all languages print under one
 *      heading, at the level the person stated.
 *
 *   2. EVIDENCE STRENGTH SURVIVES THE TRANSLATION. A skill confirmed by a
 *      manager and a skill the person typed themselves are different claims.
 *      Europass has no column for that distinction, so it is carried in the
 *      grouping rather than dropped — flattening them would quietly upgrade
 *      every self-declared skill.
 *
 * PURE + DETERMINISTIC: no IO, no server-only import, no translation. Callers
 * pass labels in; this decides only WHAT is in the document and in what order.
 */

import type { CvSkillTier } from "./skill-tiers";
import type { VerifiedCvData } from "./verified-cv";

/** The five top-level blocks, in the order a European reader expects them. */
export type EuSectionId =
  | "personal"
  | "workExperience"
  | "educationAndTraining"
  | "personalSkills"
  | "additionalInformation";

export const EU_SECTION_ORDER: readonly EuSectionId[] = [
  "personal",
  "workExperience",
  "educationAndTraining",
  "personalSkills",
  "additionalInformation",
];

/** One dated entry — a job, a placement or a course. */
export interface EuDatedEntry {
  /** What the person did: their own engagement title, else the relationship. */
  readonly title: string | null;
  /** Where: the organization as recorded, or null when none is stored. */
  readonly organization: string | null;
  /** Canonical relationship slug — the caller localizes it. */
  readonly relationship: string;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
}

export interface EuEducationEntry {
  readonly institution: string;
  readonly programOrField: string | null;
  /** education_types slug — the caller localizes it. */
  readonly educationTypeSlug: string;
  readonly startYear: number | null;
  readonly endYear: number | null;
  readonly isCurrent: boolean;
}

export interface EuLanguageEntry {
  readonly lang: string;
  /** The level the person stated. Never normalized into a CEFR claim. */
  readonly level: string;
}

/** Skills kept in their evidence groups — see rule 2 above. */
export interface EuSkillGroup {
  readonly tier: CvSkillTier;
  readonly slugs: readonly string[];
}

export interface EuAdditionalEntry {
  readonly title: string;
  readonly detail: string | null;
  /** ISO date or year when recorded; null when the person never dated it. */
  readonly date: string | null;
}

export interface EuFormatCv {
  readonly personName: string | null;
  readonly summary: string | null;
  /** Profession slugs — the caller localizes them. */
  readonly professions: readonly string[];
  readonly workExperience: readonly EuDatedEntry[];
  readonly education: readonly EuEducationEntry[];
  readonly languages: readonly EuLanguageEntry[];
  readonly skillGroups: readonly EuSkillGroup[];
  readonly drivingLicences: readonly string[];
  readonly certifications: readonly EuAdditionalEntry[];
  readonly projects: readonly EuAdditionalEntry[];
  readonly achievements: readonly EuAdditionalEntry[];
  /** Which blocks have real content. A block with nothing in it is omitted
   *  entirely — an empty heading on a printed CV reads as a gap in the
   *  person, not as a gap in the data. */
  readonly present: Readonly<Record<EuSectionId, boolean>>;
}

// ── Display resolution ───────────────────────────────────────────────────────

/** Everything the renderer needs that this module cannot know: how to say a
 *  slug in the reader's language, and how to write a date in their locale. */
export interface EuFormatResolvers {
  readonly relationship: (slug: string) => string;
  readonly educationType: (slug: string) => string;
  readonly skill: (slug: string) => string;
  readonly profession: (slug: string) => string;
  readonly language: (code: string) => string;
  readonly certificateType: (slug: string) => string;
  /** ISO date → the reader's format, or null when the date is absent. */
  readonly date: (iso: string | null) => string | null;
  /** "2019 – 2022", "2019 – present", "2019" — never an invented endpoint. */
  readonly present: string;
}

export interface EuDisplayEntry {
  readonly heading: string;
  readonly subheading: string | null;
  readonly period: string | null;
  readonly note: string | null;
}

export interface EuDisplayDocument {
  readonly personName: string | null;
  readonly professions: string | null;
  readonly summary: string | null;
  readonly workExperience: readonly EuDisplayEntry[];
  readonly education: readonly EuDisplayEntry[];
  readonly languages: readonly { name: string; level: string }[];
  readonly skillGroups: readonly { tier: CvSkillTier; names: readonly string[] }[];
  readonly drivingLicences: readonly string[];
  readonly additional: readonly EuDisplayEntry[];
  readonly present: Readonly<Record<EuSectionId, boolean>>;
}

/** Join two real endpoints. A missing end on a finished record stays missing —
 *  only an explicitly ongoing record says "present". */
function period(
  start: string | null,
  end: string | null,
  presentWord: string,
  ongoing: boolean,
): string | null {
  if (start && end) return `${start} – ${end}`;
  if (start) return ongoing ? `${start} – ${presentWord}` : start;
  if (end) return end;
  return null;
}

export function resolveEuFormatDocument(
  cv: EuFormatCv,
  r: EuFormatResolvers,
): EuDisplayDocument {
  const workExperience = cv.workExperience.map((e) => ({
    // Europass leads a work entry with the position held; the organization is
    // the line under it. When the person recorded only one of the two, the
    // one they recorded leads — nothing is substituted for the other.
    heading: e.title ?? r.relationship(e.relationship),
    subheading: e.organization,
    period: period(
      r.date(e.startedAt),
      r.date(e.endedAt),
      r.present,
      e.endedAt === null,
    ),
    note: e.title ? r.relationship(e.relationship) : null,
  }));

  const education = cv.education.map((e) => ({
    heading: e.programOrField ?? r.educationType(e.educationTypeSlug),
    subheading: e.institution,
    period: period(
      e.startYear != null ? String(e.startYear) : null,
      e.endYear != null ? String(e.endYear) : null,
      r.present,
      e.isCurrent,
    ),
    note: e.programOrField ? r.educationType(e.educationTypeSlug) : null,
  }));

  const additional: EuDisplayEntry[] = [
    ...cv.certifications.map((c) => ({
      heading: r.certificateType(c.title),
      subheading: c.detail,
      period: r.date(c.date),
      note: null,
    })),
    ...cv.projects.map((p) => ({
      heading: p.title,
      subheading: null,
      period: r.date(p.date),
      note: null,
    })),
    ...cv.achievements.map((a) => ({
      heading: a.title,
      subheading: a.detail,
      period: r.date(a.date),
      note: null,
    })),
  ];

  return {
    personName: cv.personName,
    professions:
      cv.professions.length > 0
        ? cv.professions.map((s) => r.profession(s)).join(" · ")
        : null,
    summary: cv.summary,
    workExperience,
    education,
    languages: cv.languages.map((l) => ({
      name: r.language(l.lang),
      level: l.level,
    })),
    skillGroups: cv.skillGroups.map((g) => ({
      tier: g.tier,
      names: g.slugs.map((s) => r.skill(s)),
    })),
    drivingLicences: cv.drivingLicences,
    additional,
    present: cv.present,
  };
}

const trimOrNull = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

/** Build the EU-format view. Pure projection of the Living CV — no new facts. */
export function buildEuFormatCv(cv: VerifiedCvData): EuFormatCv {
  const workExperience: EuDatedEntry[] = cv.workHistory.map((e) => ({
    title: trimOrNull(e.title),
    organization: trimOrNull(e.orgName),
    relationship: e.relationship,
    startedAt: e.startedAt,
    endedAt: e.endedAt,
  }));

  const education: EuEducationEntry[] = cv.education.map((e) => ({
    institution: e.institutionName,
    programOrField: trimOrNull(e.programOrField),
    educationTypeSlug: e.educationTypeSlug,
    startYear: e.startYear,
    endYear: e.endYear,
    isCurrent: e.isCurrent,
  }));

  const languages: EuLanguageEntry[] = cv.languages.map((l) => ({
    lang: l.lang,
    level: l.level,
  }));

  // Order is strongest evidence first. Empty groups are dropped rather than
  // printed as an empty row.
  const skillGroups: EuSkillGroup[] = (
    ["confirmed", "evidence", "declared"] as const
  )
    .map((tier) => ({ tier, slugs: cv.tiers[tier] }))
    .filter((g) => g.slugs.length > 0);

  // Certifications: the document inventory the person keeps, plus the ones
  // declared as text on import. Both are self-entered, and the renderer keeps
  // the declared ones labelled as declared — the distinction is not dropped
  // just because Europass has one "certifications" line.
  const certifications: EuAdditionalEntry[] = [
    ...cv.certificateDocs.map((d) => ({
      title: d.typeSlug,
      detail: d.country,
      date: d.validUntil,
    })),
    ...cv.declaredCertificates.map((a) => ({
      title: a.title,
      detail: trimOrNull(a.description),
      date: a.achievedAt,
    })),
  ];

  const projects: EuAdditionalEntry[] = cv.projects.map((p) => ({
    title: p.title,
    detail: null,
    date: p.lastConfirmedAt,
  }));

  const achievements: EuAdditionalEntry[] = cv.achievements.map((a) => ({
    title: a.title,
    detail: trimOrNull(a.description),
    date: a.achievedAt,
  }));

  const personalSkills =
    languages.length > 0 ||
    skillGroups.length > 0 ||
    cv.drivingLicenceCategories.length > 0;

  return {
    personName: trimOrNull(cv.personName) === "—" ? null : trimOrNull(cv.personName),
    summary: trimOrNull(cv.professionalSummary),
    professions: cv.professionSlugs.map((p) => p.slug),
    workExperience,
    education,
    languages,
    skillGroups,
    drivingLicences: cv.drivingLicenceCategories,
    certifications,
    projects,
    achievements,
    present: {
      // The person's own name is enough to warrant the block; when even that
      // is missing the renderer shows its honest "name not provided" state.
      personal: true,
      workExperience: workExperience.length > 0,
      educationAndTraining: education.length > 0,
      personalSkills,
      additionalInformation:
        certifications.length > 0 ||
        projects.length > 0 ||
        achievements.length > 0,
    },
  };
}
