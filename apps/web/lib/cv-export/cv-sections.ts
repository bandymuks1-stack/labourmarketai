/**
 * Verified CV — pure section helpers (Full CV System v1).
 *
 * PURE + DETERMINISTIC (no IO, no server-only) so the honesty rules are
 * guard-testable with fixtures:
 *
 *   - a CV section renders ONLY when real data exists — `cvSectionVisibility`
 *     is the single decision the page uses, pinned by
 *     lib/cv-export/cv-sections.test.ts (empty data → no section header on
 *     the export);
 *   - certificates split honestly: worker_documents rows (worker-entered
 *     document inventory — still self-stated, shown with their validity
 *     window) vs `declared_certificate` achievements (text-declared on CV
 *     import — labelled "declared"), plus driving licence categories from the
 *     workers row;
 *   - projects are DERIVED from the confirmed-proof rows the CV already
 *     carries — never a second query, never a second truth source;
 *   - tailored ordering is a pure reorder + §19 basis — matched skills first,
 *     nothing added, nothing hidden.
 */

import type { FitBasis } from "@/lib/market/fit";

// ── Certificate / licence document types ─────────────────────────────────────

/** worker_documents document_type_slug values that ARE certificates/licences
 *  (registry seed 20260610170000). `cv` / `id_document` / contract slugs are
 *  deliberately NOT CV certificate material. */
export const CERTIFICATE_DOC_TYPE_SLUGS: readonly string[] = [
  "professional_certificate",
  "a1_certificate",
];

export interface CvCertificateDocInput {
  documentTypeSlug: string;
  country: string | null;
  storedStatus: string;
  /**
   * `worker_documents.verification` — a SEPARATE axis from `status`
   * (`unverified | pending | verified | rejected`). `status` is where the
   * WORKER put the file; this is what a REVIEWER decided about it. They are
   * two different questions and the CHECK constraints keep them apart.
   */
  verification: string;
  validUntil: string | null; // ISO date
}

export interface CvCertificateDoc {
  typeSlug: string;
  country: string | null;
  validUntil: string | null;
  /**
   * TRUE only for `verification === "verified"`. Everything else — including
   * the `unverified` default — is false, so the CV can say what it knows
   * instead of letting a document row imply a review that never happened.
   */
  reviewerVerified: boolean;
}

/**
 * Keep only certificate/licence-type rows the worker marked READY, whose
 * validity has not passed at `now`, and which a reviewer has NOT rejected.
 *
 * SEP-3, EVIDENCE != VERIFICATION. `worker_documents` carries two independent
 * columns and this section used to read only the first: `status`
 * (`missing | ready | blocked`) is the worker's own storage state, while
 * `verification` (`unverified | pending | verified | rejected`) is the
 * reviewer's judgement. Filtering on `status` alone meant a credential a
 * reviewer had REJECTED printed on the CV exactly like a verified one — and
 * it printed with no qualifier at all, directly beneath text-declared
 * certificates that ARE labelled "declared, never verified". The contrast
 * told the reader the document-backed rows were the trusted ones.
 *
 * A rejected credential is therefore dropped (a reviewer said it does not
 * hold, so it must not print as held), and every surviving row now carries
 * whether a reviewer actually verified it. `pending` and `unverified` still
 * print — the person genuinely has the document — but they no longer borrow
 * a verification that does not exist.
 */
export function certificateDocsForCv(
  rows: readonly CvCertificateDocInput[],
  now: Date,
): CvCertificateDoc[] {
  return rows
    .filter((r) => CERTIFICATE_DOC_TYPE_SLUGS.includes(r.documentTypeSlug))
    .filter((r) => r.storedStatus === "ready")
    .filter((r) => r.verification !== "rejected")
    .filter((r) => {
      if (!r.validUntil) return true;
      return new Date(`${r.validUntil}T23:59:59Z`).getTime() >= now.getTime();
    })
    .map((r) => ({
      typeSlug: r.documentTypeSlug,
      country: r.country,
      validUntil: r.validUntil,
      reviewerVerified: r.verification === "verified",
    }));
}

// ── Achievements split (declared certificates vs real achievements) ──────────

export interface CvAchievementInput {
  title: string;
  description: string | null;
  achievedAt: string | null;
  achievementTypeSlug: string;
  confirmedByManager: boolean;
}

export function splitAchievementsForCv(rows: readonly CvAchievementInput[]): {
  declaredCertificates: CvAchievementInput[];
  achievements: CvAchievementInput[];
} {
  const declaredCertificates: CvAchievementInput[] = [];
  const achievements: CvAchievementInput[] = [];
  for (const r of rows) {
    if (r.achievementTypeSlug === "declared_certificate") {
      declaredCertificates.push(r);
    } else {
      achievements.push(r);
    }
  }
  return { declaredCertificates, achievements };
}

// ── Projects derived from confirmed proof (single truth source) ──────────────

export interface CvProofRowInput {
  projectTitle: string | null;
  confirmedAt: string;
}

export interface CvProject {
  title: string;
  lastConfirmedAt: string;
}

/** Distinct project titles the worker's CONFIRMED proof rows link to, newest
 *  confirmation first. Untitled projects are omitted (never an invented
 *  name); no proof → no projects section. */
export function projectsFromProof(
  proof: readonly CvProofRowInput[],
): CvProject[] {
  const byTitle = new Map<string, string>();
  for (const row of proof) {
    const title = row.projectTitle?.trim();
    if (!title) continue;
    const prev = byTitle.get(title);
    if (!prev || row.confirmedAt > prev) byTitle.set(title, row.confirmedAt);
  }
  return [...byTitle.entries()]
    .map(([title, lastConfirmedAt]) => ({ title, lastConfirmedAt }))
    .sort((a, b) => (a.lastConfirmedAt < b.lastConfirmedAt ? 1 : -1));
}

// ── Section visibility (the guard-pinned honest-empty contract) ──────────────

export interface CvSectionData {
  professionalSummary: string | null;
  workHistoryCount: number;
  languagesCount: number;
  /** Study placements / volunteering — counted apart from employment so the
   *  two never share a heading (§7: a placement is not a job). */
  practiceHistoryCount: number;
  certificateDocsCount: number;
  drivingLicenceCategoriesCount: number;
  declaredCertificatesCount: number;
  educationCount: number;
  achievementsCount: number;
  projectsCount: number;
  /** Whether the worker row carries any salary / availability fact. */
  hasSalary: boolean;
  hasAvailability: boolean;
  /** The per-export privacy toggle (default OFF, never persisted). */
  includePrivateDetails: boolean;
}

export interface CvSectionVisibility {
  summary: boolean;
  workHistory: boolean;
  practiceHistory: boolean;
  languages: boolean;
  certificates: boolean;
  education: boolean;
  achievements: boolean;
  projects: boolean;
  privateDetails: boolean;
}

/** ONE rule: a section exists on the export ONLY when it has real data —
 *  honest empty = omitted (no empty headers on a printed CV). Salary /
 *  availability additionally require the explicit per-export opt-in. */
export function cvSectionVisibility(d: CvSectionData): CvSectionVisibility {
  return {
    summary: (d.professionalSummary ?? "").trim().length > 0,
    workHistory: d.workHistoryCount > 0,
    practiceHistory: d.practiceHistoryCount > 0,
    languages: d.languagesCount > 0,
    certificates:
      d.certificateDocsCount > 0 ||
      d.drivingLicenceCategoriesCount > 0 ||
      d.declaredCertificatesCount > 0,
    education: d.educationCount > 0,
    achievements: d.achievementsCount > 0,
    projects: d.projectsCount > 0,
    privateDetails:
      d.includePrivateDetails && (d.hasSalary || d.hasAvailability),
  };
}

// ── Tailored ordering (§19 — reorder + visible basis, nothing else) ──────────

export interface TailoredSkillOrder<T> {
  ordered: T[];
  matchedCount: number;
}

/** Matched-to-the-need skills first (stable within each group). PURE reorder:
 *  every input item stays present exactly once — tailoring never hides or
 *  adds a skill, it only changes emphasis. */
export function orderSkillsForNeed<T>(
  items: readonly T[],
  slugOf: (item: T) => string,
  matchedSlugs: ReadonlySet<string>,
): TailoredSkillOrder<T> {
  const matched: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    (matchedSlugs.has(slugOf(item)) ? matched : rest).push(item);
  }
  return { ordered: [...matched, ...rest], matchedCount: matched.length };
}

/** §19 sentence inputs: "atitinka N iš M įgūdžių, K patvirtinti" — a
 *  highlight may NEVER render without this basis. */
export function tailoredBasisLine(fit: FitBasis): {
  matched: number;
  needTotal: number;
  confirmed: number;
} {
  return {
    matched: fit.matchedTotal,
    needTotal: fit.needTotal,
    confirmed: fit.matchedConfirmed,
  };
}
