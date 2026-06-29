import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { PrintButton } from "@/components/app/print-button";
import { buildVerifiedCv } from "@/lib/cv-export/verified-cv";
import type { CvSkillTier } from "@/lib/cv-export/skill-tiers";

/**
 * Verified CV — PDF export (S3.5). A print-clean sheet of the worker's OWN
 * data, rendered in the viewer's locale; "PDF" is the browser's print-to-PDF
 * (the platform's existing window.print pattern — no PDF service, no new
 * dependency). Lives OUTSIDE the dashboard shell so no app chrome prints.
 *
 * Honesty contract:
 *  - tier labels come from skill-tiers.ts — nothing renders under the
 *    confirmed label without verified === true;
 *  - confirmed proof rows show date / project / confirmer ROLE only — never
 *    a person's name (default-closed, no consent flow exists yet);
 *  - footer states confirmations are checkable on the platform — NO public
 *    link (there is no public proof page; deliberately not created here).
 *
 * Taxonomy names are the existing curated slug→JSON labels; once the ESCO
 * canonical layer (#286) is applied, swap tProf/tSkill to ESCO preferred
 * labels — data flow here stays the same.
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

export default async function VerifiedCvPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("cvExport");
  const tProf = await getTranslations("professions");
  const tSkill = await getTranslations("skillNames");
  const tRel = await getTranslations("relationshipTypes");
  const tRole = await getTranslations("auth.signup.role");

  const result = await buildVerifiedCv();
  if (!result.ok && result.code === "not_authenticated") {
    redirect(`/${locale}/auth/login`);
  }

  const generatedAt = new Date().toLocaleDateString(locale);

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
  const tierSlugs: Record<CvSkillTier, string[]> = cv.tiers;
  const declaredAll = [
    ...tierSlugs.declared.map((slug) => tSkill(slug)),
    ...cv.declaredClaims,
  ];

  const summary = [
    { key: "verifiedSkills", value: cv.signals.verifiedSkills },
    { key: "managerConfirmations", value: cv.signals.managerConfirmations },
    { key: "journalEntries", value: cv.signals.journalEntries },
  ] as const;

  return (
    <div className="min-h-screen bg-white px-6 py-8 text-zinc-900 print:p-0">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {/* Screen-only toolbar — never printed. */}
        <div className="flex items-center justify-between gap-3 print:hidden">
          <Link
            href="/dashboard/profile"
            className="text-sm font-medium text-sky-700 hover:underline"
            data-testid="cv-back-link"
          >
            {t("back")}
          </Link>
          <PrintButton
            label={t("print")}
            className="border-zinc-300 bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700"
          />
        </div>

        {/* Player-card style header — identity + honest counters. */}
        <header className="rounded-xl border-2 border-zinc-900 p-6">
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            {t("pageTitle")}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
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
          <dl className="mt-4 grid grid-cols-3 gap-3" data-testid="cv-summary">
            {summary.map((s) => (
              <div
                key={s.key}
                className="rounded-lg border border-zinc-200 p-3 text-center"
              >
                <dt className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {t(`summary.${s.key}`)}
                </dt>
                <dd className="mt-1 font-display text-2xl font-bold">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </header>

        {/* Professional summary — the worker's OWN self-written text
            (profiles.profile_text). Self-declared, never verified. Omitted
            entirely when empty so the print CV stays clean. */}
        {cv.professionalSummary ? (
          <section className="flex flex-col gap-2" data-testid="cv-summary-section">
            <h2 className="font-display text-lg font-bold">{t("summaryTitle")}</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
              {cv.professionalSummary}
            </p>
          </section>
        ) : null}

        {/* Work history — real engagement_contexts (companies, role, dates),
            the same source the profile renders. Self-stated history, never an
            external verification; omitted entirely when empty so the print CV
            stays clean. Org name falls back to an org-type/relationship label,
            never an invented name. */}
        {cv.workHistory.length > 0 ? (
          <section
            className="flex flex-col gap-3"
            data-testid="cv-work-history"
          >
            <h2 className="font-display text-lg font-bold">
              {t("workHistoryTitle")}
            </h2>
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
                const start = e.startedAt
                  ? new Date(e.startedAt).toLocaleDateString(locale)
                  : null;
                const end = e.endedAt
                  ? new Date(e.endedAt).toLocaleDateString(locale)
                  : null;
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
                    <span className="text-sm font-semibold">{orgDisplay}</span>
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

        {/* Skills by honest tier — visually distinct, labelled, hinted. */}
        <section className="flex flex-col gap-4" data-testid="cv-skills">
          <h2 className="font-display text-lg font-bold">{t("skills")}</h2>
          {TIER_ORDER.map((tier) => {
            const names =
              tier === "declared"
                ? declaredAll
                : tierSlugs[tier].map((slug) => tSkill(slug));
            if (names.length === 0) return null;
            return (
              <div key={tier} className="flex flex-col gap-1.5" data-testid={`cv-tier-${tier}`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
                  {t(`tiers.${tier}`)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {names.map((name) => (
                    <span
                      key={name}
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${TIER_STYLES[tier]}`}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
          {declaredAll.length === 0 &&
          tierSlugs.confirmed.length === 0 &&
          tierSlugs.evidence.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("skillsEmpty")}</p>
          ) : null}
        </section>

        {/* Confirmed Work Proof — real confirmations only; role, never name. */}
        <section className="flex flex-col gap-2" data-testid="cv-proof">
          <h2 className="font-display text-lg font-bold">{t("proofTitle")}</h2>
          {cv.proof.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("proofEmpty")}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
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
                      {new Date(row.entryDate).toLocaleDateString(locale)}
                    </td>
                    <td className="py-1.5 pr-3">{row.projectTitle ?? "—"}</td>
                    <td className="py-1.5">
                      {tRel.has(row.confirmerRole)
                        ? tRel(row.confirmerRole)
                        : row.confirmerRole}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Footer — generation date only (quiet UI: no verification process note). */}
        <footer className="mt-2 border-t border-zinc-300 pt-3 text-xs text-zinc-500">
          <p>
            {t("generatedAt")}: {generatedAt}
          </p>
        </footer>
      </div>
    </div>
  );
}
