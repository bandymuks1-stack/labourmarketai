import { setRequestLocale, getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import {
  DOCUMENT_COUNTRIES,
  DOCUMENTS_READINESS_ENABLED,
} from "@/lib/config/documents";
import {
  computeCountryReadiness,
  deriveDocumentStatus,
  listMyDocuments,
  type DerivedDocumentStatus,
} from "@/lib/documents/readiness";
import { getDocsConsent } from "@/lib/documents/consent-actions";
import { DocsConsentToggle } from "@/components/app/docs-consent-toggle";

/**
 * "Mano dokumentai" — worker document inventory + country readiness (S3).
 * Low-fidelity preview, bus pakeista TASK 07 (living-arena UI po owner
 * vizualinio užrakto).
 *
 * Honest by construction: while DOCUMENTS_READINESS_ENABLED is false the
 * page is an open RUOŠIAMA roadmap note (doctrine §18) — no fake content.
 * When live: statuses are the worker's own input + date arithmetic, the
 * legal disclaimer is always visible, and an uncurated country says so
 * instead of pretending readiness.
 */

const STATUS_TONE: Record<DerivedDocumentStatus, string> = {
  missing: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  ready: "border-state-success/40 bg-state-success/5 text-state-success",
  expiring: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  blocked: "border-state-warning/60 bg-state-warning/10 text-state-warning",
};

export default async function WorkerDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ country?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("documents");

  if (!DOCUMENTS_READINESS_ENABLED) {
    return (
      <div className="flex flex-col gap-4" data-testid="documents-page">
        <Header t={t} />
        <p
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="documents-preparing"
        >
          {t("preparing")}
        </p>
      </div>
    );
  }

  const { country: rawCountry } = await searchParams;
  const country = (DOCUMENT_COUNTRIES as readonly string[]).includes(
    rawCountry ?? "",
  )
    ? (rawCountry as string)
    : null;

  const result = await listMyDocuments();
  const now = new Date();
  // S6 — the worker's documents-aggregate consent (null until the gated
  // draft is applied → honest needs-gate state inside the toggle).
  const docsConsent = await getDocsConsent();

  return (
    <div className="flex flex-col gap-6" data-testid="documents-page">
      <Header t={t} />
      <p
        className="rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2 text-xs text-text-muted"
        data-testid="documents-disclaimer"
      >
        {t("disclaimer")}
      </p>

      <DocsConsentToggle current={docsConsent} />

      {result.kind === "needs-migration" ? (
        <p className="rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning">
          {t("needsMigration")}
        </p>
      ) : result.kind === "no-worker" ? (
        <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">
          {t("noWorker")}
        </p>
      ) : result.kind !== "ok" ? (
        <p className="rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning">
          {t("error")}
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3" data-testid="documents-list">
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {t("list.title")}
            </h2>
            {result.documents.length === 0 ? (
              <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">
                {t("empty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {result.documents.map((d) => {
                  const status = deriveDocumentStatus(d, now);
                  return (
                    <li
                      key={d.id}
                      className="card-border flex flex-wrap items-center justify-between gap-2 p-3"
                      data-status={status}
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm font-semibold text-text-primary">
                          {t(`types.${d.documentTypeSlug}` as never)}
                          {d.country ? ` · ${d.country}` : ""}
                        </span>
                        {d.validUntil ? (
                          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                            {t("fields.validUntil")}: {d.validUntil}
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${STATUS_TONE[status]}`}
                      >
                        {t(`status.${status}` as never)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3" data-testid="documents-country">
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {t("country.title")}
            </h2>
            <p className="text-xs text-text-secondary">{t("country.help")}</p>
            <div className="flex flex-wrap gap-2">
              {DOCUMENT_COUNTRIES.map((c) => (
                <Link
                  key={c}
                  href={`/dashboard/documents?country=${c}` as "/dashboard"}
                  className={`rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-label ${
                    country === c
                      ? "border-brand-blue text-brand-blue"
                      : "border-ink-500 text-text-secondary hover:border-brand-blue"
                  }`}
                >
                  {c}
                </Link>
              ))}
            </div>
            {country ? (
              (() => {
                const readiness = computeCountryReadiness(
                  country,
                  result.documents,
                  result.requirements,
                  now,
                );
                if (!readiness.requirementsKnown) {
                  return (
                    <p
                      className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
                      data-testid="documents-country-unknown"
                    >
                      {t("country.unknown", { country })}
                    </p>
                  );
                }
                return (
                  <div className="flex flex-col gap-2">
                    <ul className="flex flex-col gap-2">
                      {readiness.items.map((i) => (
                        <li
                          key={i.documentTypeSlug}
                          className="card-border flex flex-wrap items-center justify-between gap-2 p-3"
                        >
                          <span className="text-sm text-text-primary">
                            {t(`types.${i.documentTypeSlug}` as never)}
                            <span className="ml-2 font-mono text-[10px] uppercase tracking-label text-text-muted">
                              {t(`requirement.${i.requirementLevel}` as never)}
                            </span>
                            {i.sourceStatus === "needs_legal_source" ? (
                              <span className="ml-2 font-mono text-[10px] uppercase tracking-label text-state-warning">
                                {t("sourceFlag")}
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${STATUS_TONE[i.status]}`}
                          >
                            {t(`status.${i.status}` as never)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {readiness.nextActionSlug ? (
                      <p
                        className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
                        data-testid="documents-next-action"
                      >
                        {t("country.next", {
                          doc: t(`types.${readiness.nextActionSlug}` as never),
                        })}
                      </p>
                    ) : (
                      <p className="rounded-md border border-state-success/30 bg-state-success/5 px-3 py-2 text-sm text-text-secondary">
                        {t("country.ok", { country })}
                      </p>
                    )}
                  </div>
                );
              })()
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

function Header({ t }: { t: Awaited<ReturnType<typeof getTranslations>> }) {
  return (
    <header className="flex flex-col gap-1">
      <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
        {t("eyebrow")}
      </p>
      <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
        {t("title")}
      </h1>
      <p className="text-sm text-text-secondary">{t("subtitle")}</p>
    </header>
  );
}
