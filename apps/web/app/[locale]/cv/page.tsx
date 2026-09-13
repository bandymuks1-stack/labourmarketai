import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { PrintButton } from "@/components/app/print-button";
import { CvPrivateDetails } from "@/components/app/cv-private-details";
import { buildVerifiedCv } from "@/lib/cv-export/verified-cv";
import type { CvSkillTier } from "@/lib/cv-export/skill-tiers";
import { presentSkills, type SkillMagnitude } from "@/lib/cv-export/skill-presentation";
import {
  cvSectionVisibility,
  orderSkillsForNeed,
} from "@/lib/cv-export/cv-sections";
import { CV_TEMPLATES, parseCvTemplateId } from "@/lib/cv-export/templates";
import {
  loadTailoredNeed,
  type TailoredNeedResult,
} from "@/lib/cv-export/tailored";
import { formatUtcDate } from "@/lib/time/display";
import { EuFormatCv } from "@/components/app/cv/eu-format-cv";
import {
  buildEuFormatCv,
  resolveEuFormatDocument,
} from "@/lib/cv-export/eu-format";
import { WORKER_LANGUAGE_NATIVE_NAMES } from "@/lib/worker/worker-languages-model";

/**
 * Verified CV — PDF export (S3.5 + Full CV System v1). A print-clean sheet of
 * the worker's OWN data, rendered in the viewer's locale; "PDF" is the
 * browser's print-to-PDF (the platform's existing window.print pattern — no
 * PDF service, no new dependency). Lives OUTSIDE the dashboard shell so no
 * app chrome prints.
 *
 * Honesty contract:
 *  - tier labels come from skill-tiers.ts — nothing renders under the
 *    confirmed label without verified === true;
 *  - every section renders ONLY when real data exists (cv-sections.ts
 *    cvSectionVisibility — guard-pinned): honest empty = omitted on export;
 *  - confirmed proof rows show date / project / confirmer ROLE only — never
 *    a person's name (default-closed, no consent flow exists yet);
 *  - salary + availability print ONLY behind the per-export checkbox
 *    (default OFF, never persisted) — the worker chooses what goes out;
 *  - TAILORED mode (?need=<id>) only REORDERS + highlights skills matched to
 *    a demand the worker can already see via the gated worker RPC, and every
 *    highlight carries the §19 basis line ("matches N of M skills, K
 *    confirmed"). Need not visible / unstructured → standard CV + honest note.
 *
 * Templates (§10 registry, lib/cv-export/templates.ts): standard | compact —
 * two REAL print layouts; the registry slots future ones in.
 */

// Silent-trust rule: tiers stay visually distinct but carry NO certification
// styling — no green "verified" tone, no checkmark. The strongest tier reads
// as a neutral "with records" signal, not a public confirmation badge.
const TIER_STYLES: Record<CvSkillTier, string> = {
  confirmed: "border-slate-400 bg-slate-50 text-slate-800",
  evidence: "border-brand-cyan/60 bg-brand-cyan/10 text-brand-cyan",
  declared: "border-ink-500 bg-ink-700 text-text-muted",
};

// Magnitude for the eye (lib/cv-export/skill-presentation.ts): a skill with
// 0.5 h must not sit at the same size as one with 100 h. Sizes only — never
// a person score.
const MAGNITUDE_STYLES: Record<SkillMagnitude, string> = {
  major: "px-3 py-1 text-sm font-medium",
  supported: "px-2.5 py-0.5 text-xs",
  trace: "px-2 py-0.5 text-xs",
  none: "px-2 py-0.5 text-xs opacity-80",
  unknown: "px-2.5 py-0.5 text-xs",
};

/** A person's CV render: private surface, never indexable. robots.txt
 *  already disallows the cv path, but a disallow does not stop URL-only
 *  indexing from inbound links. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function VerifiedCvPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("cvExport");
  const tProf = await getTranslations("professions");
  const tSkill = await getTranslations("skillNames");
  const tRel = await getTranslations("relationshipTypes");
  const tTier = await getTranslations("evidenceTier");
  const fmtHours = (h: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(h);
  const tRole = await getTranslations("auth.signup.role");
  const tDocTypes = await getTranslations("documents.types");
  const tEduTypes = await getTranslations("cvSections.educationTypes");

  const template = parseCvTemplateId(sp.template);
  const compact = template === "compact";
  const needParam =
    (Array.isArray(sp.need) ? sp.need[0] : sp.need)?.trim() ?? "";

  const result = await buildVerifiedCv();
  if (!result.ok && result.code === "not_authenticated") {
    redirect(`/${locale}/auth/login`);
  }

  const generatedAt = formatUtcDate(new Date(), locale) ?? "";

  if (!result.ok) {
    // Honest worker-only gate: the Verified CV is built from the worker's
    // journal/skills chain; other roles have no such data to export.
    return (
      <div className="cv-doc min-h-screen bg-ink-900 px-6 py-10 text-text-primary">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <p className="text-sm text-text-secondary" data-testid="cv-not-worker">
            {t("notWorker")}
          </p>
          <Link
            href="/dashboard/profile"
            className="w-fit text-sm font-medium text-brand-blue hover:underline"
          >
            {t("back")}
          </Link>
        </div>
      </div>
    );
  }

  const { cv } = result;

  // Tailored mode — read-only reuse of the gated worker demand RPC + the §19
  // fit engine. Anything not "ok" falls back to the standard CV honestly.
  let tailored: TailoredNeedResult | null = null;
  if (needParam !== "") {
    tailored = await loadTailoredNeed(needParam, cv.skillFacts);
  }
  const tailoredOk = tailored?.kind === "ok" ? tailored : null;
  const matchedSlugs: ReadonlySet<string> =
    tailoredOk?.matchedSlugs ?? new Set<string>();

  const tierSlugs: Record<CvSkillTier, string[]> = cv.tiers;

  // ONE presentation for every skill on this document: tiers from the
  // catalogue rows, free labels folded into the skill they already are or
  // into each other by case/diacritic variant, magnitude from the journal's
  // own figures (lib/cv-export/skill-presentation.ts).
  const presentation = presentSkills({
    tiers: tierSlugs,
    claims: cv.declaredClaims,
    practice: cv.skillPractice,
    nameOf: (slug) => tSkill(slug),
  });
  // A count we could not read is null (see lib/profile/trust-signals.ts). It
  // must never reach the page as a raw value: React renders null as an empty
  // box, and the compact path INTERPOLATES it, which printed the literal word
  // "null" onto a person's CV. An em dash in both places, and never a 0 -
  // this document is what they hand to an employer.
  const summary = [
    { key: "verifiedSkills", value: cv.signals.verifiedSkills },
    { key: "managerConfirmations", value: cv.signals.managerConfirmations },
    { key: "journalEntries", value: cv.signals.journalEntries },
  ].map((s) => ({ ...s, text: s.value === null ? "—" : String(s.value) }));

  // ONE guard-pinned visibility decision — a section with no data does not
  // exist on the export (no empty headers on a printed CV).
  // Employment and placements print under separate headings. A student's real
  // placement belongs on the CV — it is simply not the same claim as a job.
  const employmentHistory = cv.workHistory.filter((e) => e.kind === "employment");
  const practiceHistory = cv.workHistory.filter((e) => e.kind === "practice");

  const visibility = cvSectionVisibility({
    professionalSummary: cv.professionalSummary,
    workHistoryCount: employmentHistory.length,
    practiceHistoryCount: practiceHistory.length,
    languagesCount: cv.languages.length,
    certificateDocsCount: cv.certificateDocs.length,
    drivingLicenceCategoriesCount: cv.drivingLicenceCategories.length,
    declaredCertificatesCount: cv.declaredCertificates.length,
    educationCount: cv.education.length,
    achievementsCount: cv.achievements.length,
    projectsCount: cv.projects.length,
    hasSalary:
      cv.privateDetails.salaryMinEur !== null ||
      cv.privateDetails.salaryMaxEur !== null,
    hasAvailability:
      cv.privateDetails.availabilityStatus !== null ||
      cv.privateDetails.availableFrom !== null ||
      cv.privateDetails.willingToRelocate !== null ||
      cv.privateDetails.hasTransport !== null,
    // The actual on/off is the client-side checkbox (default OFF); the page
    // only prepares the rows when any private fact exists at all.
    includePrivateDetails: true,
  });

  // Pre-localised private-detail rows (only real saved facts become rows).
  const priv = cv.privateDetails;
  const privateRows: { label: string; value: string }[] = [];
  if (priv.salaryMinEur !== null || priv.salaryMaxEur !== null) {
    // A one-sided expectation must keep its direction — a bare "1800" says
    // nothing about whether it is a floor or a ceiling.
    privateRows.push({
      label: t("privateDetails.salary"),
      value:
        priv.salaryMinEur !== null && priv.salaryMaxEur !== null
          ? `${priv.salaryMinEur}–${priv.salaryMaxEur}`
          : priv.salaryMinEur !== null
            ? t("privateDetails.salaryFrom", { amount: priv.salaryMinEur })
            : t("privateDetails.salaryTo", { amount: priv.salaryMaxEur ?? 0 }),
    });
  }
  if (priv.availabilityStatus) {
    const known = ["available", "busy", "unavailable"].includes(
      priv.availabilityStatus,
    );
    privateRows.push({
      label: t("privateDetails.availability"),
      value: known
        ? t(`privateDetails.status.${priv.availabilityStatus}`)
        : priv.availabilityStatus,
    });
  }
  if (priv.availableFrom) {
    privateRows.push({
      label: t("privateDetails.availableFrom"),
      value: formatUtcDate(priv.availableFrom, locale) ?? "",
    });
  }
  if (priv.willingToRelocate !== null) {
    privateRows.push({
      label: t("privateDetails.relocate"),
      value: priv.willingToRelocate
        ? t("privateDetails.yes")
        : t("privateDetails.no"),
    });
  }
  if (priv.hasTransport !== null) {
    privateRows.push({
      label: t("privateDetails.transport"),
      value: priv.hasTransport ? t("privateDetails.yes") : t("privateDetails.no"),
    });
  }

  // Template link helper — plain query links so the registry can grow.
  const templateHref = (id: string) =>
    `?template=${id}${needParam ? `&need=${encodeURIComponent(needParam)}` : ""}`;

  const sectionTitle = compact
    ? "font-display text-base font-bold"
    : "font-display text-lg font-bold";
  const bodyText = compact ? "text-xs" : "text-sm";
  const pageGap = compact ? "gap-4" : "gap-6";

  // One renderer for both history sections — employment and placements differ
  // in their HEADING, never in how a real engagement is described.
  const historyItems = (rows: typeof cv.workHistory) =>
    rows.map((e, i) => {
      const orgDisplay =
        e.orgName ??
        (e.organizationType === "company"
          ? tRole("company")
          : e.organizationType === "agency"
            ? tRole("agency")
            : (e.title ??
              (tRel.has(e.relationship) ? tRel(e.relationship) : e.relationship)));
      const roleLabel = tRel.has(e.relationship)
        ? tRel(e.relationship)
        : e.relationship;
      const start = formatUtcDate(e.startedAt, locale);
      const end = formatUtcDate(e.endedAt, locale);
      const range =
        start && end
          ? `${start} – ${end}`
          : start
            ? `${start} – ${t("present")}`
            : (end ?? "");
      return (
        <li
          key={`${e.relationship}-${i}`}
          className="flex flex-col border-l-2 border-ink-600 pl-3"
        >
          <span className={`font-semibold ${bodyText}`}>{orgDisplay}</span>
          <span className="text-xs text-text-secondary">
            {roleLabel}
            {range ? ` · ${range}` : ""}
          </span>
          {e.title && e.title !== orgDisplay ? (
            <span className="text-xs text-text-muted">{e.title}</span>
          ) : null}
        </li>
      );
    });

  return (
    <div className="cv-doc min-h-screen bg-ink-900 px-6 py-8 text-text-primary print:p-0">
      <div className={`mx-auto flex max-w-3xl flex-col ${pageGap}`}>
        {/* Screen-only toolbar — never printed. */}
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link
            href="/dashboard/profile"
            className="text-sm font-medium text-brand-blue hover:underline"
            data-testid="cv-back-link"
          >
            {t("back")}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {/* Template registry (§10): one link per registered template. */}
            <span className="text-xs text-text-muted">{t("templates.label")}:</span>
            {CV_TEMPLATES.map((tpl) => (
              <a
                key={tpl.id}
                href={templateHref(tpl.id)}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  template === tpl.id
                    ? "border-brand-blue bg-brand-blue text-text-on-brand"
                    : "border-ink-500 text-text-secondary hover:border-brand-blue"
                }`}
                data-testid={`cv-template-${tpl.id}`}
              >
                {t(`templates.${tpl.id}`)}
              </a>
            ))}
            <PrintButton label={t("print")} tone="primary" />
          </div>
        </div>

        {/* Tailored-mode honest fallback notes — screen-only (the printed CV
            in fallback IS the standard CV; no note needed on paper). */}
        {tailored && tailored.kind === "not-visible" ? (
          <p
            className="rounded-md border border-state-amber/40 bg-state-amber/10 px-3 py-2 text-xs text-state-amber print:hidden"
            data-testid="cv-tailored-not-visible"
          >
            {t("tailored.notVisible")}
          </p>
        ) : null}
        {tailored && tailored.kind === "no-structure" ? (
          <p
            className="rounded-md border border-state-amber/40 bg-state-amber/10 px-3 py-2 text-xs text-state-amber print:hidden"
            data-testid="cv-tailored-no-structure"
          >
            {t("tailored.noStructure")}
          </p>
        ) : null}

        {/* The EU-format export is a VIEW over the SAME `cv` object — a
            different document for a different reader, never a second store of
            the person (§4B). Everything below this branch is the platform's
            own layout. */}
        {template === "eu" ? (
          <EuFormatCv
            doc={resolveEuFormatDocument(buildEuFormatCv(cv), {
              relationship: (slug) => (tRel.has(slug) ? tRel(slug) : slug),
              educationType: (slug) => tEduTypes(slug),
              skill: (slug) => tSkill(slug),
              profession: (slug) => tProf(slug),
              // The standard export prints the bare code; the native name is
              // friendlier and falls back to the same code, so the two
              // documents never disagree about which language it is.
              language: (code) =>
                WORKER_LANGUAGE_NATIVE_NAMES[
                  code as keyof typeof WORKER_LANGUAGE_NATIVE_NAMES
                ] ?? code.toUpperCase(),
              certificateType: (slug) =>
                tDocTypes.has(slug) ? tDocTypes(slug) : slug,
              date: (iso) => formatUtcDate(iso, locale),
              present: t("present"),
            })}
            labels={{
              documentTitle: t("templates.eu"),
              notAnOfficialEuropass: t("euFormat.notOfficial"),
              nameNotProvided: t("nameNotProvided"),
              personal: t("euFormat.personal"),
              workExperience: t("euFormat.workExperience"),
              educationAndTraining: t("euFormat.educationAndTraining"),
              personalSkills: t("euFormat.personalSkills"),
              languages: t("languagesTitle"),
              languagesSelfStated: t("languagesSelfStated"),
              jobRelatedSkills: t("euFormat.jobRelatedSkills"),
              drivingLicences: t("drivingLicences"),
              additionalInformation: t("euFormat.additionalInformation"),
              summary: t("summaryTitle"),
              generatedAt: `${t("generatedAt")}: ${generatedAt}`,
              tiers: {
                confirmed: t("tiers.confirmed"),
                evidence: t("tiers.evidence"),
                declared: t("tiers.declared"),
              },
            }}
          />
        ) : (
          <>
        {/* Player-card style header — identity + honest counters. */}
        <header className={`rounded-xl border-2 border-ink-500 ${compact ? "p-4" : "p-6"}`}>
          <p className="font-mono text-meta uppercase tracking-widest text-text-muted">
            {t("pageTitle")}
          </p>
          <h1 className={`mt-1 font-display font-bold tracking-tight ${compact ? "text-2xl" : "text-3xl"}`}>
            {cv.personName.trim() && cv.personName.trim() !== "—" ? (
              cv.personName
            ) : (
              <span className="italic text-text-muted" data-testid="cv-name-missing">
                {t("nameNotProvided")}
              </span>
            )}
          </h1>
          {cv.professionSlugs.length > 0 ? (
            <p className="mt-1 text-sm text-text-secondary" data-testid="cv-professions">
              {cv.professionSlugs
                .map(
                  (p) => `${tProf(p.slug)}${p.isPrimary ? ` · ${t("primary")}` : ""}`,
                )
                .join(" · ")}
            </p>
          ) : null}
          {/* Tailored badge + §19 basis — prints WITH the highlight (a
              highlight may never appear without its basis). */}
          {tailoredOk ? (
            <div className="mt-2 flex flex-col gap-0.5" data-testid="cv-tailored-basis">
              <p className="font-mono text-meta uppercase tracking-widest text-text-muted">
                {t("tailored.badge")}
                {tailoredOk.roleText
                  ? ` — ${t("tailored.forNeed", { role: tailoredOk.roleText })}`
                  : ""}
              </p>
              <p className="text-xs text-text-secondary">
                {t("tailored.basis", {
                  matched: tailoredOk.fit.matchedTotal,
                  needTotal: tailoredOk.fit.needTotal,
                  confirmed: tailoredOk.fit.matchedConfirmed,
                })}
              </p>
            </div>
          ) : null}
          {!compact ? (
            <dl className="mt-4 grid grid-cols-3 gap-3" data-testid="cv-summary">
              {summary.map((s) => (
                <div
                  key={s.key}
                  className="rounded-lg border border-ink-600 p-3 text-center"
                >
                  <dt className="text-meta uppercase tracking-wide text-text-muted">
                    {t(`summary.${s.key}`)}
                  </dt>
                  <dd className="mt-1 font-display text-2xl font-bold">
                    {s.text}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-xs text-text-secondary" data-testid="cv-summary">
              {summary
                .map((s) => `${t(`summary.${s.key}`)}: ${s.text}`)
                .join(" · ")}
            </p>
          )}
        </header>

        {/* Built-from explainer — screen-only, standard template only (the
            compact template keeps the screen dense too). */}
        {!compact ? (
          <section
            className="rounded-lg border border-ink-600 bg-ink-800 p-4 print:hidden"
            data-testid="cv-built-from"
          >
            <p className="text-sm text-text-secondary">{t("builtFrom.lead")}</p>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-text-secondary">
              <li>{t("builtFrom.profile")}</li>
              <li>{t("builtFrom.skills")}</li>
              <li>{t("builtFrom.records")}</li>
            </ul>
            <p className="mt-2 text-xs text-text-muted" data-testid="cv-built-from-privacy">
              {t("builtFrom.privacy")}
            </p>
          </section>
        ) : null}

        {/* Professional summary — self-written, omitted when empty (the
            cv.professionalSummary read model already nulls empty text; the
            guard pins this exact conditional). */}
        {cv.professionalSummary ? (
          <section className="flex flex-col gap-2" data-testid="cv-summary-section">
            <h2 className={sectionTitle}>{t("summaryTitle")}</h2>
            <p className={`whitespace-pre-wrap leading-relaxed text-text-secondary ${bodyText}`}>
              {cv.professionalSummary}
            </p>
          </section>
        ) : null}

        {/* Work history — engagement_contexts (self-stated history, never an
            external verification); omitted entirely when empty. */}
        {visibility.workHistory ? (
          <section
            className="flex flex-col gap-3"
            data-testid="cv-work-history"
          >
            <h2 className={sectionTitle}>{t("workHistoryTitle")}</h2>
            <ul className="flex flex-col gap-2">
              {historyItems(employmentHistory)}
            </ul>
          </section>
        ) : null}

        {/* Practice and volunteering — real engagements at real organizations
            that are NOT employment. A separate heading is the whole point: a
            student's placement counts as experience without being claimed as
            a job. Omitted entirely when the person has none. */}
        {visibility.practiceHistory ? (
          <section
            className="flex flex-col gap-3"
            data-testid="cv-practice-history"
          >
            <h2 className={sectionTitle}>{t("practiceHistoryTitle")}</h2>
            <ul className="flex flex-col gap-2">
              {historyItems(practiceHistory)}
            </ul>
          </section>
        ) : null}

        {/* Education — self-declared entries; slug labels from i18n. */}
        {visibility.education ? (
          <section className="flex flex-col gap-2" data-testid="cv-education">
            <h2 className={sectionTitle}>{t("educationTitle")}</h2>
            <ul className="flex flex-col gap-2">
              {cv.education.map((e, i) => {
                const range =
                  e.startYear || e.endYear || e.isCurrent
                    ? `${e.startYear ?? ""}–${e.isCurrent ? t("present") : (e.endYear ?? "")}`
                    : null;
                return (
                  <li key={i} className="flex flex-col border-l-2 border-ink-600 pl-3">
                    <span className={`font-semibold ${bodyText}`}>
                      {e.institutionName}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {tEduTypes(e.educationTypeSlug)}
                      {e.programOrField ? ` · ${e.programOrField}` : ""}
                      {range ? ` · ${range}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* Languages — self-stated CEFR facts (worker_languages). */}
        {visibility.languages ? (
          <section className="flex flex-col gap-2" data-testid="cv-languages">
            <h2 className={sectionTitle}>{t("languagesTitle")}</h2>
            <div className="flex flex-wrap gap-1.5">
              {cv.languages.map((l) => (
                <span
                  key={l.lang}
                  className="rounded-full border border-ink-500 bg-ink-700 px-2.5 py-0.5 text-xs text-text-secondary"
                >
                  {l.lang.toUpperCase()} · {l.level}
                </span>
              ))}
            </div>
            <p className="text-meta text-text-muted">{t("languagesSelfStated")}</p>
          </section>
        ) : null}

        {/* Certificates & licences — document inventory rows (READY +
            unexpired), driving licence categories, and text-declared
            certificates (always labelled declared, never verified). */}
        {visibility.certificates ? (
          <section className="flex flex-col gap-2" data-testid="cv-certificates">
            <h2 className={sectionTitle}>{t("certificatesTitle")}</h2>
            <ul className="flex flex-col gap-1.5">
              {cv.certificateDocs.map((d, i) => (
                <li key={`doc-${i}`} className={`flex flex-wrap items-baseline gap-2 ${bodyText}`}>
                  <span className="font-medium">{tDocTypes(d.typeSlug)}</span>
                  {d.country ? (
                    <span className="text-xs text-text-secondary">{d.country}</span>
                  ) : null}
                  {d.validUntil ? (
                    <span className="text-xs text-text-muted">
                      {t("validUntil")}: {formatUtcDate(d.validUntil, locale)}
                    </span>
                  ) : null}
                  {/* A held document is not a reviewed one. Without this the
                      row sat unqualified directly above declared certificates
                      that ARE labelled unverified, and the contrast alone
                      claimed a review that may never have happened. */}
                  {d.reviewerVerified ? null : (
                    <span className="text-meta uppercase tracking-wide text-text-muted">
                      {t("documentSelfSuppliedHint")}
                    </span>
                  )}
                </li>
              ))}
              {cv.drivingLicenceCategories.length > 0 ? (
                <li className={`flex flex-wrap items-baseline gap-2 ${bodyText}`} data-testid="cv-driving-licences">
                  <span className="font-medium">{t("drivingLicences")}</span>
                  <span className="text-xs text-text-secondary">
                    {cv.drivingLicenceCategories.join(", ")}
                  </span>
                </li>
              ) : null}
              {cv.declaredCertificates.map((c, i) => (
                <li key={`decl-${i}`} className={`flex flex-wrap items-baseline gap-2 ${bodyText}`}>
                  <span className="font-medium">{c.title}</span>
                  {c.achievedAt ? (
                    <span className="text-xs text-text-secondary">
                      {formatUtcDate(c.achievedAt, locale, { year: "numeric" })}
                    </span>
                  ) : null}
                  <span className="text-meta uppercase tracking-wide text-text-muted">
                    {t("declaredCertHint")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Skills by honest tier — tailored mode only REORDERS (matched
            first) and highlights; nothing is added or hidden. */}
        <section className="flex flex-col gap-4" data-testid="cv-skills">
          <h2 className={sectionTitle}>{t("skills")}</h2>
          {/* Recorded work behind the skills (issue #1689): the SAME figures
              the journal's "work in numbers" shows, through the one canonical
              work-time rule. Null (unreadable) renders nothing — never a zero
              that reads as "no work". */}
          {cv.recordedHoursTotal !== null && (
            <p className="text-meta text-text-muted" data-testid="cv-recorded-hours">
              {cv.recordedHoursTotal > 0
                ? `${t("recordedHours", {
                    hours: fmtHours(cv.recordedHoursTotal),
                    confirmed: fmtHours(cv.recordedHoursConfirmed ?? 0),
                  })} ${t("recordedHoursScope")}`
                : t("recordedHoursNone")}
            </p>
          )}
          {/* The organization's own hour records (owner §19) — the second
              ledger, named beside the journal figure and added to nothing:
              an hour record proves attendance, not a skill. Shown only when
              it holds hours; null (unreadable) renders nothing. */}
          {cv.organizationRecordedHours !== null && cv.organizationRecordedHours.hours > 0 && (
            <p
              className="text-meta text-text-muted"
              data-testid="cv-organization-recorded-hours"
              data-hours={cv.organizationRecordedHours.hours}
            >
              {t("organizationRecordedHours", {
                hours: fmtHours(cv.organizationRecordedHours.hours),
                days: cv.organizationRecordedHours.days,
                imported: fmtHours(cv.organizationRecordedHours.importedHours),
                approved: fmtHours(cv.organizationRecordedHours.approvedHours),
              })}
            </p>
          )}
          {/* Skills as ONE presentation (owner defects C + D, 2026-09-12):
              evidence tier first, then magnitude; a free-label claim that
              is a catalogued skill the person already holds is folded INTO
              that skill (once, with the skill's hours); case/diacritic
              variants of a label are one item that names its variants.
              Nothing is written — the rows stay as saved. Tailored mode
              only REORDERS within a tier (matched first). */}
          {presentation.groups.map((group) => {
            const tier = group.tier;
            const catalogSlugs = group.items
              .map((i) => i.slug)
              .filter((s): s is string => s !== null);
            const { ordered } =
              tier === "self_stated"
                ? { ordered: [] as string[] }
                : orderSkillsForNeed(catalogSlugs, (slug) => slug, matchedSlugs);
            const orderIndex = new Map(ordered.map((slug, i) => [slug, i]));
            const items =
              tier === "self_stated"
                ? group.items
                : [...group.items].sort(
                    (a, b) =>
                      (orderIndex.get(a.slug ?? "") ?? 0) - (orderIndex.get(b.slug ?? "") ?? 0),
                  );
            return (
              <div key={tier} className="flex flex-col gap-1.5" data-testid={`cv-tier-${tier === "self_stated" ? "declared" : tier}`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {tier === "self_stated" ? t("selfStatedTitle") : t(`tiers.${tier}`)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((item) => {
                    const slug = item.slug;
                    const matched = slug !== null && matchedSlugs.has(slug);
                    const facts = item.practice;
                    const hours = facts?.attributedHours ?? 0;
                    const confirmed = facts?.confirmedHours ?? 0;
                    return (
                      <span
                        key={item.key}
                        className={`inline-flex flex-col rounded-md border ${
                          tier === "self_stated"
                            ? "border-dashed border-ink-500 bg-transparent text-text-muted"
                            : TIER_STYLES[tier]
                        } ${MAGNITUDE_STYLES[item.magnitude]} ${
                          matched ? "ring-2 ring-brand-blue" : ""
                        }`}
                        data-testid={matched ? "cv-skill-matched" : undefined}
                        data-magnitude={item.magnitude}
                        data-variants={item.variants.length}
                        title={matched ? t("tailored.matchedTag") : undefined}
                      >
                        <span className="flex items-baseline gap-1">
                          {item.name}
                          {item.variants.length > 1 ? (
                            <span
                              className="text-meta text-text-muted"
                              data-testid="cv-skill-variants"
                              title={item.variants.join(" · ")}
                            >
                              · {t("variantsFolded", { count: item.variants.length })}
                            </span>
                          ) : null}
                          {item.kind === "claim" && item.claimOrigin === "journal" ? (
                            <span
                              className="text-meta text-text-muted"
                              data-testid="cv-claim-from-journal"
                            >
                              · {t("claimFromJournal")}
                            </span>
                          ) : null}
                        </span>
                        {hours > 0 && slug !== null ? (
                          // The chip names its base in words (re-audit F12):
                          // which of the hours a manager confirmed and which
                          // are the person's own record — never a bare number.
                          <span
                            className="tabular-nums text-meta text-text-muted"
                            title={t("skillHoursHint")}
                            data-testid={`cv-skill-hours-${slug}`}
                            data-confirmed-hours={confirmed}
                          >
                            {confirmed > 0
                              ? t("skillHoursConfirmed", {
                                  hours: fmtHours(hours),
                                  confirmed: fmtHours(confirmed),
                                })
                              : t("skillHoursOwn", {
                                  hours: fmtHours(hours),
                                })}
                            {facts && facts.share > 0
                              ? ` · ${t("skillShare", { share: Math.round(facts.share * 100) })}`
                              : ""}
                            {facts && facts.entries > 0
                              ? ` · ${t("skillEntries", { count: facts.entries })}`
                              : ""}
                          </span>
                        ) : tier !== "self_stated" && item.magnitude === "none" ? (
                          <span className="text-meta text-text-muted" data-testid="cv-skill-no-records">
                            {t("skillNoRecords")}
                          </span>
                        ) : null}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {presentation.visible === 0 ? (
            <p className={`text-text-muted ${bodyText}`}>{t("skillsEmpty")}</p>
          ) : null}
        </section>

        {/* Projects — DERIVED from confirmed proof (single truth source). */}
        {visibility.projects ? (
          <section className="flex flex-col gap-2" data-testid="cv-projects">
            <h2 className={sectionTitle}>{t("projectsTitle")}</h2>
            <p className="text-meta text-text-muted">{t("projectsHint")}</p>
            <ul className="flex flex-col gap-1">
              {cv.projects.map((p) => (
                <li key={p.title} className={`flex items-baseline gap-2 ${bodyText}`}>
                  <span className="font-medium">{p.title}</span>
                  <span className="text-xs text-text-muted">
                    {formatUtcDate(p.lastConfirmedAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Achievements — self-declared unless a REAL confirmation set the
            manager flag (which the app itself can never write). */}
        {visibility.achievements ? (
          <section className="flex flex-col gap-2" data-testid="cv-achievements">
            <h2 className={sectionTitle}>{t("achievementsTitle")}</h2>
            <ul className="flex flex-col gap-1.5">
              {cv.achievements.map((a, i) => (
                <li key={i} className="flex flex-col">
                  <span className={`font-medium ${bodyText}`}>
                    {a.title}
                    {a.confirmedByManager ? (
                      <span className="ml-2 text-meta uppercase tracking-wide text-text-secondary">
                        {t("confirmedByManager")}
                      </span>
                    ) : null}
                  </span>
                  {a.achievedAt || a.description ? (
                    <span className="text-xs text-text-secondary">
                      {[
                        formatUtcDate(a.achievedAt, locale),
                        a.description,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Confirmed Work Proof — real confirmations only; role, never name. */}
        <section className="flex flex-col gap-2" data-testid="cv-proof">
          <h2 className={sectionTitle}>{t("proofTitle")}</h2>
          {cv.proof.length === 0 ? (
            <p className={`text-text-muted ${bodyText}`}>{t("proofEmpty")}</p>
          ) : (
            <table className={`w-full border-collapse ${bodyText}`}>
              <thead>
                <tr className="border-b-2 border-ink-500 text-left">
                  <th className="py-1.5 pr-3 font-semibold">{t("proofDate")}</th>
                  <th className="py-1.5 pr-3 font-semibold">{t("proofProject")}</th>
                  <th className="py-1.5 font-semibold">{t("proofRole")}</th>
                </tr>
              </thead>
              <tbody>
                {cv.proof.map((row, i) => (
                  <tr key={`${row.confirmedAt}-${i}`} className="border-b border-ink-600">
                    <td className="py-1.5 pr-3">
                      {formatUtcDate(row.entryDate, locale)}
                    </td>
                    <td className="py-1.5 pr-3">{row.projectTitle ?? "—"}</td>
                    <td className="py-1.5">
                      {tRel.has(row.confirmerRole)
                        ? tRel(row.confirmerRole)
                        : row.confirmerRole}
                      {/* W6 slice 1: automatic never renders identically. */}
                      {row.automatic ? (
                        <span
                          className="text-text-muted"
                          data-testid="cv-proof-auto-confirm-qualifier"
                        >
                          {" "}· {tTier("autoConfirmQualifier")}
                        </span>
                      ) : null}
                      {/* EVID-2: a self-confirmation is real, and it is not an
                          employer's word. It is labelled here rather than
                          hidden, so this document cannot present the worker's
                          own attestation as somebody else's. */}
                      {row.selfConfirmed ? (
                        <span
                          className="text-text-muted"
                          data-testid="cv-proof-self-confirm-qualifier"
                        >
                          {" "}· {tTier("selfConfirmQualifier")}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Salary + availability — per-export opt-in (default OFF, never
            persisted). The checkbox never prints; the section prints only
            when the worker ticked it for THIS export. */}
        <CvPrivateDetails
          toggleLabel={t("privateDetails.toggle")}
          title={t("privateDetails.title")}
          rows={privateRows}
        />

        {/* Footer — generation date only (quiet UI: no verification process note). */}
        <footer className="mt-2 border-t border-ink-600 pt-3 text-xs text-text-muted">
          <p>
            {t("generatedAt")}: {generatedAt}
          </p>
        </footer>
          </>
        )}
      </div>
    </div>
  );
}
