import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { Card } from "@/components/ui/Card";
import { SemanticIcon } from "@/components/app/semantic-icon";
import { PersonImportedHistory } from "@/components/app/people/person-imported-history";
import { PersonHistorySummaryBlock } from "@/components/app/organization/person-history-summary";
import { loadCompanyPerson } from "@/lib/organization-evidence/company-person-read";

export const dynamic = "force-dynamic";

/**
 * THE HISTORICAL PERSON CARD — company side, keyed on the ROSTER ROW
 * (`organization_people.id`), not on an account (2026-10-07).
 *
 * Owner invariant: organization-provided historical worker data exists BEFORE
 * account claim. A person the organization recorded — with no account at all —
 * therefore has a card here: who they were to the organization, every record it
 * supplied (including records tied to no known project or place), the stated
 * hours, the work by place, and the skills the organization's own words point
 * to. Claiming later links an account and gives the PERSON control; nothing on
 * this page waits for it, and nothing here asks for payment or for a
 * counterparty's or owner's confirmation.
 *
 * Authority: managers of the SUPPLYING organization only. The roster row is
 * read under the caller's RLS and bound to the caller's active governed
 * organization; another organization's manager (or an id from another
 * organization) gets a 404, never data. Read-only.
 *
 * Honesty: every figure is labelled "organization-provided, not independently
 * verified"; a failed read is said, never rendered as "no history".
 */
export default async function CompanyPersonHistoryPage({
  params,
}: {
  params: Promise<{ locale: string; personId: string }>;
}) {
  const { locale, personId } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "company");

  const t = await getTranslations("companyPerson");
  const tRel = await getTranslations("evidenceImport.relationship");

  const load = await loadCompanyPerson(locale, personId);
  if (load.kind === "hidden" || load.kind === "not-found") notFound();

  const back = (
    <Link
      href={"/dashboard/company/people" as "/dashboard"}
      className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      data-testid="company-person-back"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      {t("back")}
    </Link>
  );

  if (load.kind === "unavailable") {
    return (
      <div className="flex flex-col gap-4" data-testid="company-person" data-state="unavailable">
        {back}
        <Card variant="error" compact>
          <p className="text-sm text-text-secondary" data-testid="company-person-unavailable">
            {t("unavailable")}
          </p>
        </Card>
      </div>
    );
  }

  const { person, organizationName } = load;
  const relationship = person.relationshipKind
    ? tRel.has(person.relationshipKind)
      ? tRel(person.relationshipKind)
      : person.relationshipKind
    : null;

  return (
    <div
      className="flex flex-col gap-6"
      data-testid="company-person"
      data-state="ready"
      data-link-state={person.linkState}
    >
      {back}
      <header className="flex flex-col gap-2">
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">{t("eyebrow")}</p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary" data-testid="company-person-name">
          {person.name || "—"}
        </h1>
        {relationship ? (
          <p className="text-sm text-text-secondary" data-testid="company-person-relationship">
            {relationship}
          </p>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta leading-relaxed text-text-muted" data-testid="company-person-provenance">
          <span className="inline-flex items-center gap-1 rounded-full border border-ink-500 px-2 py-0.5 font-mono uppercase tracking-label text-text-secondary">
            <SemanticIcon concept="historical" label={t("badge")} className="h-3 w-3" />
            {t("badge")}
          </span>
          <span>{t("provenance", { name: organizationName })}</span>
        </p>
        {/* THE CLAIM STATUS — information, never a gate on the history. */}
        <p className="text-sm text-text-secondary" data-testid="company-person-claim" data-link-state={person.linkState}>
          {t(`claim.${person.linkState}` as never)}
          {person.linkedWorkerId ? (
            <>
              {" "}
              <Link
                href={`/dashboard/people/${person.linkedWorkerId}` as "/dashboard"}
                className="font-medium text-brand-blue hover:underline"
                data-testid="company-person-open-profile"
              >
                {t("claim.openProfile")} →
              </Link>
            </>
          ) : null}
        </p>
      </header>

      {load.truncated ? (
        <p className="text-meta text-text-muted" data-testid="company-person-truncated">
          {t("truncated", { count: load.records.length })}
        </p>
      ) : null}

      <PersonHistorySummaryBlock summary={load.summary} signals={load.signals} locale={locale} />

      <PersonImportedHistory
        records={{ list: load.records, truncated: false }}
        organizationPersonIds={[person.id]}
        showEmpty
        locale={locale}
      />
    </div>
  );
}
