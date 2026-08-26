import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { PrintButton } from "@/components/app/print-button";
import { CvPrivateDetails } from "@/components/app/cv-private-details";
import { buildVerifiedCv } from "@/lib/cv-export/verified-cv";
import type { CvSkillTier } from "@/lib/cv-export/skill-tiers";
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

const TIER_ORDER: CvSkillTier[] = ["confirmed", "evidence", "declared"];

// Silent-trust rule: tiers stay visually distinct but carry NO certification
// styling — no green "verified" tone, no checkmark. The strongest tier reads
// as a neutral "with records" signal, not a public confirmation badge.
const TIER_STYLES: Record<CvSkillTier, string> = {
  confirmed: "border-slate-400 bg-slate-50 text-slate-800",
  evidence: "border-sky-500 bg-sky-50 text-sky-900",
  declared: "border-zinc-300 bg-zinc-50 text-zinc-600",
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
      <div className="min-h-screen bg-white px-6 py-10 text-zinc-900">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <p className="text-sm text-zinc-600" data-testid="cv-not-worker">
            {t("notWorker")}
          </p>
          <Link
            href="/dashboard/profile"
            className="w-fit text-sm font-medium text-sky-700 hover:underline"
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
  // Declared tier: catalogued declared skills + free-label claims. Journal-
  // derived claims (P0 Track B) carry a small provenance suffix — same
  // declared tier, never presented as verified.
  const declaredAll: { name: string; fromJournal: boolean }[] = [
    ...tierSlugs.declared.map((slug) => ({
      name: tSkill(slug),
      fromJournal: false,
    })),
    ...cv.declaredClaims.map((c) => ({
      name: c.label,
      fromJournal: c.origin === "journal",
    })),
  ];

  const summary = [
    { key: "verifiedSkills", value: cv.signals.verifiedSkills },
    { key: "managerConfirmations", value: cv.signals.managerConfirmations },
    { key: "journalEntries", value: cv.signals.journalEntries },
  ] as const;

  // ONE guard-pinned visibility decision — a section with no data does not
  // exist on the export (no empty headers on a printed CV).
  const visibility = cvSectionVisibility({
    professionalSummary: cv.professionalSummary,
    workHistoryCount: cv.workHistory.length,
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

  return (
    <div className="min-h-screen bg-white px-6 py-8 text-zinc-900 print:p-0">
      <div className={`mx-auto flex max-w-3xl flex-col ${pageGap}`}>
        {/* Screen-only toolbar — never printed. */}
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link
            href="/dashboard/profile"
            className="text-sm font-medium text-sky-700 hover:underline"
            data-testid="cv-back-link"
          >
            {t("back")}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {/* Template registry (§10): one link per registered template. */}
            <span className="text-xs text-zinc-500">{t("templates.label")}:</span>
            {CV_TEMPLATES.map((tpl) => (
              <a
                key={tpl.id}
                href={templateHref(tpl.id)}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  template === tpl.id
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 text-zinc-700 hover:border-zinc-500"
                }`}
                data-testid={`cv-template-${tpl.id}`}
              >
                {t(`templates.${tpl.id}`)}
              </a>
            ))}
            <PrintButton
              label={t("print")}
              className="border-zinc-300 bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700"
            />
          </div>
        </div>

        {/* Tailored-mode honest fallback notes — screen-only (the printed CV
            in fallback IS the standard CV; no note needed on paper). */}
        {tailored && tailored.kind === "not-visible" ? (
          <p
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 print:hidden"
            data-testid="cv-tailored-not-visible"
          >
            {t("tailored.notVisible")}
          </p>
        ) : null}
        {tailored && tailored.kind === "no-structure" ? (
          <p
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 print:hidden"
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
        <header className={`rounded-xl border-2 border-zinc-900 ${compact ? "p-4" : "p-6"}`}>
          <p className="font-mono text-meta uppercase tracking-widest text-zinc-500">
            {t("pageTitle")}
          </p>
          <h1 className={`mt-1 font-display font-bold tracking-tight ${compact ? "text-2xl" : "text-3xl"}`}>
            {cv.personName.trim() && cv.personName.trim() !== "—" ? (
              cv.personName
            ) : (
              <span className="italic text-zinc-400" data-testid="cv-name-missing">
                {t("nameNotProvided")}
              </span>
            )}
          </h1>
          {cv.professionSlugs.length > 0 ? (
            <p className="mt-1 text-sm text-zinc-600" data-testid="cv-professions">
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
              <p className="font-mono text-meta uppercase tracking-widest text-zinc-500">
                {t("tailored.badge")}
                {tailoredOk.roleText
                  ? ` — ${t("tailored.forNeed", { role: tailoredOk.roleText })}`
                  : ""}
              </p>
              <p className="text-xs text-zinc-600">
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
                  className="rounded-lg border border-zinc-200 p-3 text-center"
                >
                  <dt className="text-meta uppercase tracking-wide text-zinc-500">
                    {t(`summary.${s.key}`)}
                  </dt>
                  <dd className="mt-1 font-display text-2xl font-bold">
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-xs text-zinc-600" data-testid="cv-summary">
              {summary
                .map((s) => `${t(`summary.${s.key}`)}: ${s.value}`)
                .join(" · ")}
            </p>
          )}
        </header>

        {/* Built-from explainer — screen-only, standard template only (the
            compact template keeps the screen dense too). */}
        {!compact ? (
          <section
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 print:hidden"
            data-testid="cv-built-from"
          >
            <p className="text-sm text-zinc-700">{t("builtFrom.lead")}</p>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-zinc-600">
              <li>{t("builtFrom.profile")}</li>
              <li>{t("builtFrom.skills")}</li>
              <li>{t("builtFrom.records")}</li>
            </ul>
            <p className="mt-2 text-xs text-zinc-500" data-testid="cv-built-from-privacy">
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
            <p className={`whitespace-pre-wrap leading-relaxed text-zinc-700 ${bodyText}`}>
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
              {cv.workHistory.map((e, i) => {
                const orgDisplay =
                  e.orgName ??
                  (e.organizationType === "company"
                    ? tRole("company")
                    : e.organizationType === "agency"
                      ? tRole("agency")
                      : (e.title ??
                        (tRel.has(e.relationship)
                          ? tRel(e.relationship)
                          : e.relationship)));
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
                    className="flex flex-col border-l-2 border-zinc-300 pl-3"
                  >
                    <span className={`font-semibold ${bodyText}`}>{orgDisplay}</span>
                    <span className="text-xs text-zinc-600">
                      {roleLabel}
                      {range ? ` · ${range}` : ""}
                    </span>
                    {e.title && e.title !== orgDisplay ? (
                      <span className="text-xs text-zinc-500">{e.title}</span>
                    ) : null}
                  </li>
                );
              })}
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
                  <li key={i} className="flex flex-col border-l-2 border-zinc-300 pl-3">
                    <span className={`font-semibold ${bodyText}`}>
                      {e.institutionName}
                    </span>
                    <span className="text-xs text-zinc-600">
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
                  className="rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-0.5 text-xs text-zinc-700"
                >
                  {l.lang.toUpperCase()} · {l.level}
                </span>
              ))}
            </div>
            <p className="text-meta text-zinc-500">{t("languagesSelfStated")}</p>
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
                    <span className="text-xs text-zinc-600">{d.country}</span>
                  ) : null}
                  {d.validUntil ? (
                    <span className="text-xs text-zinc-500">
                      {t("validUntil")}: {formatUtcDate(d.validUntil, locale)}
                    </span>
                  ) : null}
                </li>
              ))}
              {cv.drivingLicenceCategories.length > 0 ? (
                <li className={`flex flex-wrap items-baseline gap-2 ${bodyText}`} data-testid="cv-driving-licences">
                  <span className="font-medium">{t("drivingLicences")}</span>
                  <span className="text-xs text-zinc-600">
                    {cv.drivingLicenceCategories.join(", ")}
                  </span>
                </li>
              ) : null}
              {cv.declaredCertificates.map((c, i) => (
                <li key={`decl-${i}`} className={`flex flex-wrap items-baseline gap-2 ${bodyText}`}>
                  <span className="font-medium">{c.title}</span>
                  {c.achievedAt ? (
                    <span className="text-xs text-zinc-600">
                      {formatUtcDate(c.achievedAt, locale, { year: "numeric" })}
                    </span>
                  ) : null}
                  <span className="text-meta uppercase tracking-wide text-zinc-500">
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
          {TIER_ORDER.map((tier) => {
            if (tier === "declared") {
              if (declaredAll.length === 0) return null;
              return (
                <div key={tier} className="flex flex-col gap-1.5" data-testid={`cv-tier-${tier}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
                    {t(`tiers.${tier}`)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {declaredAll.map(({ name, fromJournal }) => (
                      <span
                        key={name}
                        className={`rounded-full border px-2.5 py-0.5 text-xs ${TIER_STYLES[tier]}`}
                      >
                        {name}
                        {fromJournal ? (
                          <span
                            className="ml-1 text-meta text-zinc-500"
                            data-testid="cv-claim-from-journal"
                          >
                            · {t("claimFromJournal")}
                          </span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                </div>
              );
            }
            const { ordered } = orderSkillsForNeed(
              tierSlugs[tier],
              (slug) => slug,
              matchedSlugs,
            );
            if (ordered.length === 0) return null;
            return (
              <div key={tier} className="flex flex-col gap-1.5" data-testid={`cv-tier-${tier}`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
                  {t(`tiers.${tier}`)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ordered.map((slug) => {
                    const matched = matchedSlugs.has(slug);
                    return (
                      <span
                        key={slug}
                        className={`rounded-full border px-2.5 py-0.5 text-xs ${TIER_STYLES[tier]} ${
                          matched ? "ring-2 ring-zinc-900" : ""
                        }`}
                        data-testid={matched ? "cv-skill-matched" : undefined}
                        title={matched ? t("tailored.matchedTag") : undefined}
                      >
                        {tSkill(slug)}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {declaredAll.length === 0 &&
          tierSlugs.confirmed.length === 0 &&
          tierSlugs.evidence.length === 0 ? (
            <p className={`text-zinc-500 ${bodyText}`}>{t("skillsEmpty")}</p>
          ) : null}
        </section>

        {/* Projects — DERIVED from confirmed proof (single truth source). */}
        {visibility.projects ? (
          <section className="flex flex-col gap-2" data-testid="cv-projects">
            <h2 className={sectionTitle}>{t("projectsTitle")}</h2>
            <p className="text-meta text-zinc-500">{t("projectsHint")}</p>
            <ul className="flex flex-col gap-1">
              {cv.projects.map((p) => (
                <li key={p.title} className={`flex items-baseline gap-2 ${bodyText}`}>
                  <span className="font-medium">{p.title}</span>
                  <span className="text-xs text-zinc-500">
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
                      <span className="ml-2 text-meta uppercase tracking-wide text-zinc-600">
                        {t("confirmedByManager")}
                      </span>
                    ) : null}
                  </span>
                  {a.achievedAt || a.description ? (
                    <span className="text-xs text-zinc-600">
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
            <p className={`text-zinc-500 ${bodyText}`}>{t("proofEmpty")}</p>
          ) : (
            <table className={`w-full border-collapse ${bodyText}`}>
              <thead>
                <tr className="border-b-2 border-zinc-900 text-left">
                  <th className="py-1.5 pr-3 font-semibold">{t("proofDate")}</th>
                  <th className="py-1.5 pr-3 font-semibold">{t("proofProject")}</th>
                  <th className="py-1.5 font-semibold">{t("proofRole")}</th>
                </tr>
              </thead>
              <tbody>
                {cv.proof.map((row, i) => (
                  <tr key={`${row.confirmedAt}-${i}`} className="border-b border-zinc-200">
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
                          className="text-zinc-500"
                          data-testid="cv-proof-auto-confirm-qualifier"
                        >
                          {" "}· {tTier("autoConfirmQualifier")}
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
        <footer className="mt-2 border-t border-zinc-300 pt-3 text-xs text-zinc-500">
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
