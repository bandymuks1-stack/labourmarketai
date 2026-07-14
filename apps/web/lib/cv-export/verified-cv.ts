import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  supportedSkillIds,
  type EntrySkillLinkRow,
} from "@/lib/journal/journal-entry-skills";
import { listProfileSkillClaims } from "@/lib/profile/profile-skill-claims";
import {
  getOwnTrustSignals,
  type OwnTrustSignals,
} from "@/lib/profile/trust-signals";
import { groupCvSkillTiers, type CvSkillTiers } from "./skill-tiers";
import {
  certificateDocsForCv,
  projectsFromProof,
  splitAchievementsForCv,
  type CvAchievementInput,
  type CvCertificateDoc,
  type CvProject,
} from "./cv-sections";

/**
 * Verified CV export (S3.5) — the worker's OWN portable, honest history.
 *
 * Every number/label is read under the worker's own RLS from canonical
 * tables; nothing is invented and nothing renders as confirmed without a
 * real manager confirmation (see skill-tiers.ts). Privacy is default-closed:
 * the confirmed-proof list carries the confirmer's ROLE only — never the
 * confirmer's name or id — and no employer data beyond the project title the
 * worker's own entry already links to.
 *
 * Taxonomy names stay the existing curated slug→JSON set; when the ESCO
 * canonical layer (#286) is applied, the page swaps to ESCO preferred labels
 * with no change here (slugs are returned, the page translates).
 */

/** Worker engagement relationships — the person-as-worker history rows.
 *  Mirrors the set the profile page renders, so the CV and profile agree. */
const WORKER_RELATIONSHIPS = [
  "employee",
  "freelancer",
  "consultant",
  "owner",
  "collaborator",
];

export type VerifiedCvEngagement = {
  /** Best display name for the org (display → legal); null when none stored
   *  (the page falls back to an org-type or relationship label). */
  orgName: string | null;
  /** organizations.organization_type (company / agency) — lets the page label
   *  an unnamed org honestly instead of a bare "—". */
  organizationType: string | null;
  /** engagement relationship slug (employee / freelancer / …). */
  relationship: string;
  /** Free-text engagement title, if the worker gave one. */
  title: string | null;
  startedAt: string | null;
  endedAt: string | null;
};

export type VerifiedCvProofRow = {
  /** Date of the confirmation (the legally meaningful act). */
  confirmedAt: string;
  /** Date of the underlying work entry. */
  entryDate: string;
  /** Project title the worker's own entry links to, if any. */
  projectTitle: string | null;
  /** Confirmer's relationship ROLE (manager / owner / external_manager) —
   *  deliberately never the person's name (default-closed, §4). */
  confirmerRole: string;
};

export type VerifiedCvLanguage = { lang: string; level: string };

export type VerifiedCvEducation = {
  institutionName: string;
  programOrField: string | null;
  educationTypeSlug: string;
  startYear: number | null;
  endYear: number | null;
  isCurrent: boolean;
};

/** Salary + availability facts from the worker's OWN workers row. Rendered
 *  on the export ONLY behind the per-export privacy toggle (default OFF,
 *  never persisted) — the worker chooses whether these print. */
export type VerifiedCvPrivateDetails = {
  salaryMinEur: number | null;
  salaryMaxEur: number | null;
  availabilityStatus: string | null;
  availableFrom: string | null;
  willingToRelocate: boolean | null;
  hasTransport: boolean | null;
};

export type VerifiedCvData = {
  personName: string;
  /** The worker's own self-written professional summary (`profiles.profile_text`).
   *  Self-declared, never verified; null/empty when not written. */
  professionalSummary: string | null;
  professionSlugs: { slug: string; isPrimary: boolean }[];
  /** Catalogued worker skills, grouped by honest tier (slugs). */
  tiers: CvSkillTiers;
  /** Flat catalogued skill facts (slug + real verified flag) — the tailored
   *  mode's fit subject; same rows the tiers are grouped from. */
  skillFacts: { slug: string; verified: boolean }[];
  /** Free-label self-declared claims — ALWAYS the declared tier. */
  declaredClaims: string[];
  /** Real work history from engagement_contexts (companies, role, dates) —
   *  the same source the profile renders; empty array when none. */
  workHistory: VerifiedCvEngagement[];
  /** Self-stated languages (worker_languages) — empty until the worker adds
   *  them (or until the draft table is applied). Never verified. */
  languages: VerifiedCvLanguage[];
  /** Certificate/licence rows from the worker's document inventory (READY +
   *  unexpired only — see cv-sections.ts). Worker-entered, not verified. */
  certificateDocs: CvCertificateDoc[];
  /** workers.driving_licence_categories (MP-2 column) — [] when unset. */
  drivingLicenceCategories: string[];
  /** Text-declared certificates from CV import (worker_achievements rows with
   *  slug declared_certificate) — always labelled declared-not-verified. */
  declaredCertificates: CvAchievementInput[];
  /** Self-declared education entries (worker_education). */
  education: VerifiedCvEducation[];
  /** Self-declared achievements (worker_achievements, non-certificate). */
  achievements: CvAchievementInput[];
  /** Projects DERIVED from the confirmed-proof rows below — same truth. */
  projects: CvProject[];
  privateDetails: VerifiedCvPrivateDetails;
  signals: OwnTrustSignals;
  proof: VerifiedCvProofRow[];
};

export type VerifiedCvResult =
  | { ok: true; cv: VerifiedCvData }
  | { ok: false; code: "not_authenticated" | "no_worker" };

export async function buildVerifiedCv(): Promise<VerifiedCvResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not_authenticated" };

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker?.id) return { ok: false, code: "no_worker" };
  const workerId = worker.id;

  const [
    profileRes,
    wpRes,
    wsRes,
    linkRes,
    claims,
    signals,
    entriesRes,
    ecRes,
  ] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, email, profile_text")
        .eq("id", user.id)
        .single(),
      supabase
        .from("worker_professions")
        .select("is_primary, professions(slug)")
        .eq("worker_id", workerId)
        .order("is_primary", { ascending: false }),
      supabase
        .from("worker_skills")
        .select("skill_id, verified, source, skills(slug)")
        .eq("worker_id", workerId)
        .order("created_at", { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("journal_entry_skills")
        .select("journal_entry_id, skill_id")
        .eq("worker_id", workerId),
      listProfileSkillClaims(),
      getOwnTrustSignals(workerId),
      supabase
        .from("journal_entries")
        .select("id, created_at, project_id")
        .eq("worker_id", workerId),
      supabase
        .from("engagement_contexts")
        .select(
          "relationship_slug, title, is_primary, started_at, ended_at, organizations(display_name, legal_name, organization_type)",
        )
        .eq("profile_id", user.id)
        .in("relationship_slug", WORKER_RELATIONSHIPS)
        .order("is_primary", { ascending: false })
        .order("started_at", { ascending: false, nullsFirst: false }),
    ]);

  // ── Full CV System v1 sections — ALL best-effort/graceful reads. A table
  // that is not applied yet (42P01) or an optional column that is missing
  // (42703) yields an EMPTY section (which the page then omits honestly) —
  // never an error surface, never fabricated data.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const tolerant = <T>(p: PromiseLike<{ data: T | null; error: unknown }>) =>
    Promise.resolve(p).then(
      (r) => (r.error ? { data: null } : r),
      () => ({ data: null as T | null }),
    );
  const [langsRes, docsRes, privBaseRes, privOptRes, eduRes, achRes] =
    await Promise.all([
      tolerant(
        sb
          .from("worker_languages")
          .select("lang, level")
          .eq("worker_id", workerId),
      ),
      tolerant(
        sb
          .from("worker_documents")
          .select("document_type_slug, country, status, valid_until")
          .eq("worker_id", workerId),
      ),
      tolerant(
        sb
          .from("workers")
          .select(
            "salary_min_eur, salary_max_eur, availability_status, available_from",
          )
          .eq("id", workerId)
          .maybeSingle(),
      ),
      tolerant(
        sb
          .from("workers")
          .select("willing_to_relocate, has_transport, driving_licence_categories")
          .eq("id", workerId)
          .maybeSingle(),
      ),
      tolerant(
        sb
          .from("worker_education")
          .select(
            "id, institution_name, program_or_field, education_type_slug, start_year, end_year, is_current",
          )
          .eq("profile_id", user.id)
          .order("end_year", { ascending: false, nullsFirst: true }),
      ),
      tolerant(
        sb
          .from("worker_achievements")
          .select(
            "title, description, achieved_at, achievement_type_slug, confirmed_by_manager",
          )
          .eq("profile_id", user.id)
          .order("achieved_at", { ascending: false, nullsFirst: false }),
      ),
    ]);

  // Real work history (same source the profile renders). Primary first, then
  // most-recent; org name prefers display → legal, else null so the page can
  // fall back to an org-type/relationship label (never an invented name).
  const workHistory: VerifiedCvEngagement[] = (ecRes.data ?? []).map((e) => {
    const org = e.organizations as
      | {
          display_name: string | null;
          legal_name: string | null;
          organization_type: string | null;
        }
      | null;
    return {
      orgName: org?.display_name ?? org?.legal_name ?? null,
      organizationType: org?.organization_type ?? null,
      relationship: e.relationship_slug,
      title: (e.title as string | null) ?? null,
      startedAt: e.started_at,
      endedAt: e.ended_at,
    };
  });

  const personName =
    profileRes.data?.full_name ??
    (profileRes.data?.email ? profileRes.data.email.split("@")[0] : "—");

  const professionalSummary =
    (
      (profileRes.data as { profile_text?: string | null } | null)
        ?.profile_text ?? ""
    ).trim() || null;

  const professionSlugs = (wpRes.data ?? [])
    .map((r) => {
      const slug = (r.professions as { slug: string | null } | null)?.slug;
      return slug ? { slug, isPrimary: r.is_primary === true } : null;
    })
    .filter((p): p is { slug: string; isPrimary: boolean } => p !== null);

  // Durable journal→skill links — graceful empty set if not readable.
  const durableSupported = linkRes.error
    ? new Set<string>()
    : supportedSkillIds((linkRes.data ?? []) as EntrySkillLinkRow[]);

  const tierInputs = (wsRes.data ?? [])
    .map((r) => {
      const slug = (r.skills as { slug: string | null } | null)?.slug;
      return slug
        ? {
            slug,
            verified: r.verified === true,
            source: (r.source as string | null) ?? "self_declared",
            journalSupported: r.skill_id
              ? durableSupported.has(r.skill_id)
              : false,
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const tiers = groupCvSkillTiers(tierInputs);
  const skillFacts = tierInputs.map((t) => ({
    slug: t.slug,
    verified: t.verified,
  }));

  const declaredClaims = claims.map((c) => c.normalized_label);

  // Confirmed Work Proof — REAL confirmations only (action 'confirm' or an
  // approved review), one row per entry (latest confirmation), role only.
  const entries = entriesRes.data ?? [];
  const entryById = new Map(
    entries.map((e) => [
      e.id,
      { createdAt: e.created_at, projectId: (e.project_id as string | null) ?? null },
    ]),
  );
  const proof: VerifiedCvProofRow[] = [];
  if (entries.length > 0) {
    const { data: confs } = await supabase
      .from("journal_entry_confirmations")
      .select("entry_id, confirmer_role, created_at, confirmation_scope")
      .in("entry_id", entries.map((e) => e.id))
      .order("created_at", { ascending: false });
    const seen = new Set<string>();
    const projectIds = new Set<string>();
    const confirmedRows: {
      entryId: string;
      confirmedAt: string;
      confirmerRole: string;
    }[] = [];
    for (const c of confs ?? []) {
      const scope = c.confirmation_scope as {
        action?: string;
        decision?: string;
      } | null;
      const isConfirm =
        scope?.action === "confirm" || scope?.decision === "approved";
      if (!isConfirm || seen.has(c.entry_id)) continue;
      seen.add(c.entry_id);
      confirmedRows.push({
        entryId: c.entry_id,
        confirmedAt: c.created_at,
        confirmerRole: c.confirmer_role,
      });
      const pid = entryById.get(c.entry_id)?.projectId;
      if (pid) projectIds.add(pid);
    }

    // Project titles the worker's own entries link to — graceful null when
    // not linked or not readable under the worker's RLS.
    const projectTitleById = new Map<string, string | null>();
    if (projectIds.size > 0) {
      const { data: projRows } = await supabase
        .from("projects")
        .select("id, title")
        .in("id", [...projectIds]);
      for (const p of projRows ?? []) {
        projectTitleById.set(p.id, (p.title as string | null) ?? null);
      }
    }

    for (const row of confirmedRows) {
      const entry = entryById.get(row.entryId);
      const pid = entry?.projectId ?? null;
      proof.push({
        confirmedAt: row.confirmedAt,
        entryDate: entry?.createdAt ?? row.confirmedAt,
        projectTitle: pid ? (projectTitleById.get(pid) ?? null) : null,
        confirmerRole: row.confirmerRole,
      });
    }
    proof.sort((a, b) => (a.confirmedAt < b.confirmedAt ? 1 : -1));
  }

  // ── Assemble the Full CV System sections from the graceful reads ──────────
  const languages: VerifiedCvLanguage[] = (
    (langsRes.data ?? []) as Array<{ lang: string | null; level: string | null }>
  )
    .filter((r): r is { lang: string; level: string } => !!r.lang && !!r.level)
    .map((r) => ({ lang: r.lang, level: r.level }));

  const certificateDocs = certificateDocsForCv(
    (
      (docsRes.data ?? []) as Array<{
        document_type_slug: string;
        country: string | null;
        status: string;
        valid_until: string | null;
      }>
    ).map((d) => ({
      documentTypeSlug: d.document_type_slug,
      country: d.country,
      storedStatus: d.status,
      validUntil: d.valid_until,
    })),
    new Date(),
  );

  const privBase = privBaseRes.data as {
    salary_min_eur: number | null;
    salary_max_eur: number | null;
    availability_status: string | null;
    available_from: string | null;
  } | null;
  const privOpt = privOptRes.data as {
    willing_to_relocate: boolean | null;
    has_transport: boolean | null;
    driving_licence_categories: string[] | null;
  } | null;

  const drivingLicenceCategories = Array.isArray(
    privOpt?.driving_licence_categories,
  )
    ? privOpt!.driving_licence_categories.filter(
        (c): c is string => typeof c === "string",
      )
    : [];

  const education: VerifiedCvEducation[] = (
    (eduRes.data ?? []) as Array<{
      institution_name: string;
      program_or_field: string | null;
      education_type_slug: string;
      start_year: number | null;
      end_year: number | null;
      is_current: boolean | null;
    }>
  ).map((e) => ({
    institutionName: e.institution_name,
    programOrField: e.program_or_field,
    educationTypeSlug: e.education_type_slug,
    startYear: e.start_year,
    endYear: e.end_year,
    isCurrent: e.is_current === true,
  }));

  const { declaredCertificates, achievements } = splitAchievementsForCv(
    (
      (achRes.data ?? []) as Array<{
        title: string;
        description: string | null;
        achieved_at: string | null;
        achievement_type_slug: string;
        confirmed_by_manager: boolean | null;
      }>
    ).map((a) => ({
      title: a.title,
      description: a.description,
      achievedAt: a.achieved_at,
      achievementTypeSlug: a.achievement_type_slug,
      confirmedByManager: a.confirmed_by_manager === true,
    })),
  );

  return {
    ok: true,
    cv: {
      personName,
      professionalSummary,
      professionSlugs,
      tiers,
      skillFacts,
      declaredClaims,
      workHistory,
      languages,
      certificateDocs,
      drivingLicenceCategories,
      declaredCertificates,
      education,
      achievements,
      projects: projectsFromProof(proof),
      privateDetails: {
        salaryMinEur: privBase?.salary_min_eur ?? null,
        salaryMaxEur: privBase?.salary_max_eur ?? null,
        availabilityStatus: privBase?.availability_status ?? null,
        availableFrom: privBase?.available_from ?? null,
        willingToRelocate: privOpt?.willing_to_relocate ?? null,
        hasTransport: privOpt?.has_transport ?? null,
      },
      signals,
      proof,
    },
  };
}
