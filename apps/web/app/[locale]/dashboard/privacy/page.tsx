import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DiscoverabilityConsent } from "@/components/app/discoverability-consent";
import { PrivacyDeletionRequest } from "@/components/app/privacy-deletion-request";
import { listMyPrivacyRequests } from "@/lib/privacy/actions";
import {
  getMyConsentHistory,
  getMyDiscoverabilityState,
} from "@/lib/privacy/discoverability-actions";
import { buildOwnDiscoverabilityPreview } from "@/lib/privacy/discoverability-preview";
import {
  CONSENT_LOCALES,
  PROFILE_DISCOVERABILITY_V1,
  type ConsentLocale,
} from "@/lib/privacy/consent-definitions";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * CANONICAL privacy control screen (consent-and-disclosure v1).
 *
 * Four sections, in this order:
 *  1. Employer visibility (profile_discoverability consent — default OFF,
 *     separate from Terms/Privacy, withdrawable in one click here);
 *  2. Data transfers to companies (employer_data_disclosure permissions +
 *     the append-only disclosure ledger — honest empty state until real
 *     individual confirmations exist);
 *  3. Consent history (the user's own immutable ledger rows);
 *  4. Privacy rights & contact (real data export, reviewed deletion
 *     request — pre-existing self-service, unchanged mechanics).
 *
 * The legal consent wording renders from the versioned registry
 * (lib/privacy/consent-definitions.ts) — the exact hashed text.
 */
export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("privacySelfService");
  const tc = await getTranslations("privacyConsent");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const [state, history, preview, myRequests] = await Promise.all([
    getMyDiscoverabilityState(),
    getMyConsentHistory(),
    buildOwnDiscoverabilityPreview(),
    listMyPrivacyRequests(),
  ]);

  const consentLocale: ConsentLocale = (
    CONSENT_LOCALES as readonly string[]
  ).includes(locale)
    ? (locale as ConsentLocale)
    : "lt";
  const legal = PROFILE_DISCOVERABILITY_V1.texts[consentLocale];

  const previewFields = preview.map((f) => ({
    label: tc(`preview.${f.key}`),
    value: f.value,
  }));

  const disclosureRows = history.filter(
    (h) => h.purpose === "employer_data_disclosure",
  );
  const discoverabilityRows = history.filter(
    (h) => h.purpose === "profile_discoverability",
  );

  return (
    <div className="flex flex-col gap-5" data-testid="privacy-page">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">{t("intro")}</p>
      </header>

      {/* 1. Employer visibility — the profile_discoverability consent. */}
      <section className="card-border p-5" data-testid="privacy-visibility" id="visibility">
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {tc("sections.visibility")}
        </p>
        <div className="mt-3">
          <DiscoverabilityConsent
            locale={locale}
            state={state}
            legal={legal}
            preview={previewFields}
            labels={{
              statusHidden: tc("status.hidden"),
              statusHiddenBody: tc("status.hiddenBody"),
              statusVisible: tc("status.visible"),
              statusWithdrawn: tc("status.withdrawn"),
              statusStale: tc("status.stale"),
              grant: tc("actions.grant"),
              decline: tc("actions.decline"),
              manage: tc("actions.manage"),
              withdraw: tc("actions.withdraw"),
              previewTitle: tc("preview.title"),
              previewEmpty: tc("preview.empty"),
              decidedAtLabel: tc("labels.decidedAt"),
              versionLabel: tc("labels.version"),
              needsMigration: tc("labels.needsMigration"),
              errorGeneric: tc("labels.error"),
              declinedNote: tc("labels.declinedNote"),
            }}
          />
        </div>
      </section>

      {/* 2. Data transfers to companies — individual disclosure permissions. */}
      <section className="card-border p-5" data-testid="privacy-disclosures" id="disclosures">
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {tc("sections.disclosures")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-text-primary">
          {tc("disclosures.intro")}
        </p>
        {disclosureRows.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary" data-testid="disclosures-empty">
            {tc("disclosures.empty")}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {disclosureRows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-500 px-3 py-2 text-sm"
              >
                <span className="text-text-primary">
                  {r.contextType ?? "—"} ·{" "}
                  {(r.selectedFields ?? [])
                    .map((f) =>
                      tc.has(`fields.${f}` as never) ? tc(`fields.${f}` as never) : f,
                    )
                    .join(", ")}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                    {r.createdAt.slice(0, 10)}
                  </span>
                  <span className="rounded-sm border border-ink-500 bg-ink-800/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-text-secondary">
                    {tc(`history.action.${r.action}` as never)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3. Consent history — the user's own immutable ledger. */}
      <section className="card-border p-5" data-testid="privacy-history" id="history">
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {tc("sections.history")}
        </p>
        {discoverabilityRows.length === 0 && disclosureRows.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary" data-testid="history-empty">
            {tc("history.empty")}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2" data-testid="history-list">
            {history.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-500 px-3 py-2 text-sm"
              >
                <span className="text-text-primary">
                  {tc.has(`history.purpose.${r.purpose}` as never)
                    ? tc(`history.purpose.${r.purpose}` as never)
                    : r.purpose}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                    {r.createdAt.slice(0, 16).replace("T", " ")} · {r.version} ·{" "}
                    {r.locale}
                  </span>
                  <span className="rounded-sm border border-ink-500 bg-ink-800/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-text-secondary">
                    {tc(`history.action.${r.action}` as never)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 4. Privacy rights & contact — pre-existing real self-service. */}
      <section className="card-border p-5" data-testid="privacy-export" id="rights">
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {tc("sections.rights")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-text-primary">
          {t("export.body")}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          {t("export.includes")}
        </p>
        <a
          href={`/${locale}/dashboard/privacy/export`}
          data-testid="privacy-export-download"
          className="mt-3 inline-flex min-h-11 w-fit items-center rounded-md border border-brand-blue/40 px-4 text-sm font-medium text-brand-blue hover:border-brand-blue"
        >
          {t("export.download")}
        </a>
        <p className="mt-4 text-xs leading-relaxed text-text-muted">
          {tc("rights.notice")}{" "}
          <Link href="/legal/privacy" className="underline hover:text-brand-blue">
            {tc("rights.noticeLink")}
          </Link>
        </p>
      </section>

      <section className="card-border p-5" data-testid="privacy-deletion">
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {t("deletion.title")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-text-primary">
          {t("deletion.body")}
        </p>
        <div className="mt-3">
          <PrivacyDeletionRequest
            labels={{
              confirmLabel: t("deletion.confirmLabel"),
              noteLabel: t("deletion.noteLabel"),
              submit: t("deletion.submit"),
              submitted: t("deletion.submitted"),
              submittedBody: t("deletion.submittedBody"),
              unavailable: t("deletion.unavailable"),
              tooManyOpen: t("deletion.tooManyOpen"),
              error: t("deletion.error"),
            }}
          />
        </div>
      </section>

      {myRequests.length > 0 && (
        <section className="card-border p-5" data-testid="privacy-requests-list">
          <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
            {t("requests.title")}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {myRequests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-500 px-3 py-2 text-sm"
              >
                <span className="text-text-primary">
                  {r.type === "data_export"
                    ? t("requests.type.data_export")
                    : r.type === "account_deletion"
                      ? t("requests.type.account_deletion")
                      : r.type}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                    {r.createdAt.slice(0, 10)}
                  </span>
                  <span className="rounded-sm border border-ink-500 bg-ink-800/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-text-secondary">
                    {t.has(`requests.status.${r.status}` as never)
                      ? t(`requests.status.${r.status}` as never)
                      : r.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href="/dashboard/account"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-text-muted transition-colors hover:text-brand-blue"
      >
        ← {t("backToAccount")}
      </Link>
    </div>
  );
}
